package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.cs203.mgodataapi.ForecastService.*;

class PurchaseForecastServiceTests {
    final PurchaseForecastRepository repository = mock(PurchaseForecastRepository.class);
    final RidgeInference ridge = mock(RidgeInference.class);
    final Clock clock = Clock.fixed(Instant.parse("2026-10-26T02:00:00Z"), ZoneOffset.UTC);
    final LocalDate origin = LocalDate.parse("2026-10-26");
    final PurchaseForecastService service = new PurchaseForecastService(repository, clock, ridge);
    List<PurchaseForecastRepository.Observation> rows;
    @BeforeEach void setup() {
        rows = new ArrayList<>();
        for (int i = 150; i >= 1; i--) {
            LocalDate date = origin.minusDays(i);
            rows.add(row("SGP_MGO_OBSERVED", date, 800 + 30 * Math.sin(i / 4.)));
            if (i < 80) {
                rows.add(row("GDELT_ARTICLE_COUNT", date, 100 + i));
                rows.add(row("GDELT_AVERAGE_TONE", date, -1 - i / 100.));
            }
        }
        when(repository.observations(origin)).thenAnswer(x -> rows.stream()
                .sorted(java.util.Comparator.comparing(PurchaseForecastRepository.Observation::series)
                        .thenComparing(PurchaseForecastRepository.Observation::date)).toList());
        when(ridge.predict(anyInt(), any())).thenAnswer(call -> {
            int h = call.getArgument(0);
            return tools.jackson.databind.json.JsonMapper.builder().build().readTree("""
                {"status":"ready","horizon_days":%s,"unit":"USD/metric tonne","anchor_quote_date":"2026-10-25","as_of_date":"2026-10-26",
                 "anchor_price":800,"forecast":850,"low":750,"high":950,"raw_q10_price":760,"raw_q90_price":940,
                 "execution":"src.predict.predict:standardscaler+ridgecv",
                 "artifact_sha256":"%s","input_snapshot":"%s","inference_snapshot":"%s",
                 "model_version":"ridge-%sd-executed","target_date":"%s"}
                """.formatted(h, "a".repeat(64), "b".repeat(64), "c".repeat(64), h, origin.minusDays(1).plusDays(h)));
        });
    }
    PurchaseForecastRepository.Observation row(String series, LocalDate date, double value) {
        boolean mgo = series.equals("SGP_MGO_OBSERVED");
        return new PurchaseForecastRepository.Observation(series, mgo ? "The Maritime" : "GDELT",
                mgo ? "USD/MT" : series.equals("GDELT_ARTICLE_COUNT") ? "articles" : "tone",
                mgo ? "USD" : null, date, BigDecimal.valueOf(value));
    }
    @Test void yesterdayNewsWidensBoundsWithoutMovingPointOrDashboardAndPinsAcrossHorizons() {
        Ready quiet = assertInstanceOf(Ready.class, service.read(7));
        assertNull(quiet.data().interval().nominal_coverage());
        assertNull(quiet.data().interval().empirical_coverage());
        assertEquals(0, quiet.data().interval().evaluation_rows());
        assertTrue(quiet.data().interval().limitations().contains("Ridge pipeline executed"));
        assertEquals(quiet.run_id(), assertInstanceOf(Ready.class, service.read(14)).run_id());
        assertEquals(quiet.run_id(), assertInstanceOf(Ready.class, service.read(30)).run_id());
        rows.removeIf(r -> r.date().equals(origin.minusDays(1)) && !r.series().equals("SGP_MGO_OBSERVED"));
        rows.add(row("GDELT_ARTICLE_COUNT", origin.minusDays(1), 100000));
        rows.add(row("GDELT_AVERAGE_TONE", origin.minusDays(1), -10));
        Ready active = assertInstanceOf(Ready.class, service.read(7));
        assertEquals(quiet.data().forecast(), active.data().forecast());
        assertTrue(active.data().low().compareTo(quiet.data().low()) < 0);
        assertTrue(active.data().high().compareTo(quiet.data().high()) > 0);
        assertNotEquals(quiet.run_id(), active.run_id());
        verify(ridge, times(4)).predict(anyInt(), eq(origin)); // Only reads; no dashboard publication mutation.
    }
    @Test void missingYesterdayCannotUseOlderNewsAndFutureRowsCannotLeak() {
        rows.removeIf(r -> r.series().equals("GDELT_AVERAGE_TONE") && r.date().equals(origin.minusDays(1)));
        assertEquals("missing_previous_day_news", assertInstanceOf(Unavailable.class, service.read(7)).reason());
        rows.add(row("GDELT_AVERAGE_TONE", origin, -2));
        assertEquals("invalid_inputs", assertInstanceOf(Unavailable.class, service.read(7)).reason());
    }
    @Test void datedReferenceIsExplicitAndVeryOldReferenceRemainsUnavailable() {
        rows.removeIf(r -> r.series().equals("SGP_MGO_OBSERVED") && r.date().isAfter(origin.minusDays(8)));
        Ready dated = assertInstanceOf(Ready.class, service.read(7));
        assertEquals(origin.minusDays(1), dated.data().forecast_origin_date());
        rows.removeIf(r -> r.series().equals("SGP_MGO_OBSERVED") && r.date().isAfter(origin.minusDays(31)));
        assertEquals("stale_reference", assertInstanceOf(Unavailable.class, service.read(7)).reason());
    }
    @Test void guidanceAndCostsReadTheSameDataAndRejectAChangedNewsRun() {
        var forecastService = mock(ForecastService.class);
        when(forecastService.today()).thenReturn(origin);
        var provider = new PublishedForecastAnalysisProvider(forecastService, service);
        var analysis = new PlanAnalysisService(provider);
        var context = new PlanAnalysisService.Context(UUID.randomUUID(), new BigDecimal("100"), origin.plusDays(10), origin);
        Ready forecast = assertInstanceOf(Ready.class, service.read(7));
        var impact = analysis.read(context, true, 7, forecast.run_id());
        @SuppressWarnings("unchecked") var cost = (PlanAnalysisProvider.Result<PlanAnalysisService.Impact>) impact.get("cost_impact");
        assertEquals(forecast.data().low().multiply(context.quantity_mt()), cost.value().forecast_total().lower());
        assertEquals("ready", ((PlanAnalysisProvider.Result<?>) analysis.read(context, false, 7, forecast.run_id()).get("recommendation")).status());
        rows.add(row("SGP_MGO_OBSERVED", origin.minusDays(160), 800));
        assertThrows(ApiException.class, () -> analysis.read(context, true, 7, forecast.run_id()));
    }
    @Test void unavailableRidgeNeverBecomesPersistence() {
        when(ridge.predict(anyInt(), any())).thenThrow(new IllegalStateException("expired target"));
        assertEquals("ridge_unavailable", assertInstanceOf(Unavailable.class, service.read(7)).reason());
    }
    @Test void invalidModelTargetUnitsAndIdentityAreRejected() {
        var valid = (tools.jackson.databind.node.ObjectNode) ridge.predict(7, origin);
        for (String field : List.of("target_date", "unit", "artifact_sha256")) {
            var invalid = valid.deepCopy();
            invalid.put(field, field.equals("target_date") ? origin.plusDays(7).toString() : "incompatible");
            when(ridge.predict(7, origin)).thenReturn(invalid);
            assertEquals("invalid_ridge_response", assertInstanceOf(Unavailable.class, service.read(7)).reason());
        }
    }
    @Test void duplicatesAreRejectedAndLatestCompletedUtcDayIsUsedAcrossMidnight() {
        rows.add(row("SGP_MGO_OBSERVED", origin.minusDays(1), 1));
        assertEquals("invalid_inputs", assertInstanceOf(Unavailable.class, service.read(7)).reason());
        rows.remove(rows.size() - 1);
        var early = new PurchaseForecastService(repository, Clock.fixed(Instant.parse("2026-10-25T20:00:00Z"), ZoneOffset.UTC), ridge);
        assertEquals(Instant.parse("2026-10-25T00:00:00Z"), assertInstanceOf(Ready.class, early.read(7)).data().news_window_end());
    }
}
