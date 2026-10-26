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
    final ForecastService published = mock(ForecastService.class);
    final Clock clock = Clock.fixed(Instant.parse("2026-10-26T02:00:00Z"), ZoneOffset.UTC);
    final LocalDate origin = LocalDate.parse("2026-10-26");
    final PurchaseForecastService service = new PurchaseForecastService(repository, clock, published);
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
        when(published.read(anyInt())).thenReturn(new Unavailable("unavailable", "missing_run", "No model run", null));
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
        assertTrue(quiet.data().interval().limitations().contains("persistence"));
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
        verify(published, times(4)).read(anyInt()); // Only reads; no dashboard publication mutation.
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
        assertTrue(dated.data().interval().limitations().contains("Price data is stale"));
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
    @Test void anAvailablePublishedModelKeepsItsOriginalPointAndRange() {
        Value value = mock(Value.class);
        when(value.news_window_end()).thenReturn(Instant.parse("2026-10-26T00:00:00Z"));
        Ready available = new Ready("ready", value, UUID.randomUUID(), clock.instant(), "trained-model");
        when(published.read(7)).thenReturn(available);
        assertSame(available, service.read(7));
        verifyNoInteractions(repository);
    }
    @Test void duplicatesAreRejectedAndLatestCompletedUtcDayIsUsedAcrossMidnight() {
        rows.add(row("SGP_MGO_OBSERVED", origin.minusDays(1), 1));
        assertEquals("invalid_inputs", assertInstanceOf(Unavailable.class, service.read(7)).reason());
        rows.remove(rows.size() - 1);
        var early = new PurchaseForecastService(repository, Clock.fixed(Instant.parse("2026-10-25T20:00:00Z"), ZoneOffset.UTC), published);
        assertEquals(Instant.parse("2026-10-25T00:00:00Z"), assertInstanceOf(Ready.class, early.read(7)).data().news_window_end());
    }
}
