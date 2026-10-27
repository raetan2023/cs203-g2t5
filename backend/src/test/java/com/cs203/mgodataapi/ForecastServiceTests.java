package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static com.cs203.mgodataapi.PlanAnalysisProvider.*;

class ForecastServiceTests {
    final ForecastRepository repository = mock(ForecastRepository.class);
    final Clock clock = Clock.fixed(Instant.parse("2026-10-26T02:00:00Z"), ZoneId.of("Asia/Singapore"));
    final JsonMapper mapper = new JsonMapper();
    final ForecastService service = new ForecastService(repository, clock, mapper);
    final UUID run = UUID.randomUUID();
    ObjectNode value;
    @BeforeEach void setup() {
        value = (ObjectNode) mapper.readTree("""
            {"status":"ready","horizon_days":7,"target_date":"2026-11-02",
             "as_of_date":"2026-10-26","forecast_origin_date":"2026-10-26",
             "anchor_quote_date":"2026-10-23","anchor_price":800,"quote_age_days":3,
             "forecast":850,"low":700,"high":820,"raw_q10_price":720,"raw_q90_price":810,
             "unit":"USD/metric tonne","evidence":"weak","mae_skill_vs_persistence":0.1,"backtest_rows":64,
             "top_drivers":[{"feature":"gasoil_ret5","contribution":0.01}],
             "interval":{"method":"gdelt_error_quantiles","nominal_coverage":0.8,
               "empirical_coverage":0.79,"evaluation_rows":64,"evaluation_scope":"chronological holdout",
               "baseline_coverage":0.82,"baseline_mean_width":250,"mean_width":380,"limitations":"Experimental."},
             "news_window_start":"2026-10-25T00:00:00Z","news_window_end":"2026-10-26T00:00:00Z",
             "source_dates":{"mgo":"2026-10-23","gasoil":"2026-10-23","brent":"2026-10-22","dubai":"2026-10-23","usd":"2026-10-22"},
             "history":[{"date":"2026-10-23","price":800}]}
            """);
        publish(value, LocalDate.parse("2026-10-26"));
    }
    void publish(ObjectNode payload, LocalDate origin) {
        when(repository.active(7)).thenReturn(List.of(new ForecastRepository.Snapshot(run, origin,
                "daily-v1", Instant.parse("2026-10-26T01:00:00Z"), "{}", payload.toString())));
    }
    @Test void pythonPipelineFixtureMatchesTypedReaderForAllHorizons() throws Exception {
        // Generated using real Python predict_day/run serialization with synthetic models/data only.
        var fixture = mapper.readTree(getClass().getResourceAsStream("/daily-publication-contract.json"));
        assertTrue(fixture.path("synthetic_test_only").asBoolean());
        var run = fixture.path("run");
        Instant published = Instant.parse(run.path("payload").path("run_started_at").asText());
        Clock fixtureClock = Clock.fixed(published.plusSeconds(60), ZoneId.of("Asia/Singapore"));
        ForecastRepository fixtureRepository = mock(ForecastRepository.class);
        ForecastService fixtureService = new ForecastService(fixtureRepository, fixtureClock, mapper);
        for (var forecast : fixture.path("forecasts")) {
            int horizon = forecast.path("horizon_days").asInt();
            when(fixtureRepository.active(horizon)).thenReturn(List.of(new ForecastRepository.Snapshot(
                UUID.fromString(run.path("id").asText()), LocalDate.parse(run.path("origin_date").asText()),
                run.path("model_version").asText(), published, run.path("payload").toString(), forecast.toString())));
            var ready = assertInstanceOf(ForecastService.Ready.class, fixtureService.read(horizon));
            assertEquals(horizon, ready.data().horizon_days());
            assertEquals("gdelt_error_quantiles", ready.data().interval().method());
            assertTrue(ready.data().interval().evaluation_rows() >= 40);
            assertEquals(ready.data().forecast_origin_date().plusDays(horizon), ready.data().target_date());
        }
    }
    @Test void readsTypedPublishedValueAndSerializesThePublicContract() {
        var ready = assertInstanceOf(ForecastService.Ready.class, service.read(7));
        assertEquals(run, ready.run_id());
        assertEquals(new BigDecimal("850"), ready.data().forecast()); // independent point can exceed interval
        var json = mapper.readTree(mapper.writeValueAsString(ready));
        assertEquals("ready", json.path("status").asText());
        assertEquals(850, json.path("forecast").asInt());
        assertEquals("2026-11-02", json.path("target_date").asText());
        assertEquals(run.toString(), json.path("run_id").asText());
        assertFalse(json.has("data"));
    }
    @Test void staleFutureMissingDataNeverProducesPrices() {
        for (String source : List.of("mgo", "gasoil", "brent", "dubai", "usd")) {
            ObjectNode stale = value.deepCopy();
            ((ObjectNode) stale.get("source_dates")).put(source, "2026-10-18");
            publish(stale, LocalDate.parse("2026-10-26"));
            assertEquals("stale_sources", assertInstanceOf(ForecastService.Unavailable.class, service.read(7)).reason());
        }
        ObjectNode future = value.deepCopy();
        ((ObjectNode) future.get("source_dates")).put("gasoil", "2026-10-27");
        publish(future, LocalDate.parse("2026-10-26"));
        assertEquals("stale_sources", assertInstanceOf(ForecastService.Unavailable.class, service.read(7)).reason());
        ObjectNode missing = value.deepCopy(); missing.remove("source_dates");
        publish(missing, LocalDate.parse("2026-10-26"));
        assertEquals("missing_sources", assertInstanceOf(ForecastService.Unavailable.class, service.read(7)).reason());
    }
    @Test void latestRollingAndOlderAvailableWindowsAreAccepted() {
        value.put("news_window_start", "2026-10-25T00:45:00Z");
        value.put("news_window_end", "2026-10-26T00:45:00Z");
        value.put("evidence", "unevaluated");
        publish(value, LocalDate.parse("2026-10-26"));
        assertInstanceOf(ForecastService.Ready.class, service.read(7));
        value.put("news_window_start", "2026-10-22T12:00:00Z");
        value.put("news_window_end", "2026-10-23T12:00:00Z");
        publish(value, LocalDate.parse("2026-10-26"));
        assertInstanceOf(ForecastService.Ready.class, service.read(7));
        value.put("news_window_start", "2026-10-18T00:00:00Z");
        value.put("news_window_end", "2026-10-19T00:00:00Z");
        publish(value, LocalDate.parse("2026-10-26"));
        assertInstanceOf(ForecastService.Unavailable.class, service.read(7));
    }
    @Test void staleRunNewsAndUnorderedBoundsAreUnavailable() {
        publish(value, LocalDate.parse("2026-10-25"));
        assertEquals("stale_run", assertInstanceOf(ForecastService.Unavailable.class, service.read(7)).reason());
        value.put("news_window_start", "2026-10-24T00:00:00Z");
        publish(value, LocalDate.parse("2026-10-26"));
        assertEquals("stale_news", assertInstanceOf(ForecastService.Unavailable.class, service.read(7)).reason());
        value.put("news_window_start", "2026-10-25T00:00:00Z"); value.put("low", 900);
        publish(value, LocalDate.parse("2026-10-26"));
        assertEquals("invalid_bounds", assertInstanceOf(ForecastService.Unavailable.class, service.read(7)).reason());
    }
    @Test void unvalidatedIntervalEvidenceCannotBecomeReady() {
        ((ObjectNode) value.get("interval")).put("evaluation_rows", 39);
        publish(value, LocalDate.parse("2026-10-26"));
        assertEquals("invalid_interval", assertInstanceOf(ForecastService.Unavailable.class, service.read(7)).reason());
        ((ObjectNode) value.get("interval")).put("evaluation_rows", 64).put("method", "split_conformal_quantile");
        publish(value, LocalDate.parse("2026-10-26"));
        assertEquals("invalid_interval", assertInstanceOf(ForecastService.Unavailable.class, service.read(7)).reason());
    }
    @Test void selectedHorizonFlowsThroughSharedPublicationAndCost() {
        value.put("horizon_days", 14).put("target_date", "2026-11-09");
        when(repository.active(14)).thenReturn(List.of(new ForecastRepository.Snapshot(run, LocalDate.parse("2026-10-26"),
                "daily-v1", Instant.parse("2026-10-26T01:00:00Z"), "{}", value.toString())));
        var provider = new PublishedForecastAnalysisProvider(service);
        var prices = provider.prices(service.today(), 14);
        assertEquals(LocalDate.parse("2026-11-09"), prices.forecast().value().target_date());
        assertEquals(run, prices.forecast().value().run_id());
        verify(repository).active(14);
    }
    @Test void unavailablePublicationPreservesLastSuccessfulMetadataButNeverItsPrices() {
        var last = new ForecastRepository.RunSummary(UUID.randomUUID(), LocalDate.parse("2026-10-25"),
                Instant.parse("2026-10-25T01:00:00Z"), "older");
        when(repository.lastSuccessful()).thenReturn(last);
        publish((ObjectNode) mapper.readTree("{\"status\":\"unavailable\",\"reason\":\"news_failed\",\"message\":\"News collection failed.\"}"), LocalDate.parse("2026-10-26"));
        var unavailable = assertInstanceOf(ForecastService.Unavailable.class, service.read(7));
        assertEquals("news_failed", unavailable.reason());
        assertEquals(last, unavailable.last_successful_run());
        assertFalse(mapper.readTree(mapper.writeValueAsString(unavailable)).has("forecast"));
    }
    @Test void purchaseGuidanceAndCostsPinTheSameRunAndRespectDeadline() {
        var provider = new PublishedForecastAnalysisProvider(service);
        var analysis = new PlanAnalysisService(provider);
        var context = new PlanAnalysisService.Context(UUID.randomUUID(), new BigDecimal("100"),
                LocalDate.parse("2026-10-30"), service.today());
        var response = analysis.read(context, false, 7, run);
        @SuppressWarnings("unchecked") var guidance = (Result<Guidance>) response.get("recommendation");
        assertEquals("MONITOR", guidance.value().action());
        assertFalse(guidance.value().explanation().contains("70,000 to 82,000"));
        assertTrue(guidance.value().evidence().limitations().stream().anyMatch(s -> s.contains("exceeds the purchase deadline")));
        assertEquals("unavailable", ((Result<?>) analysis.read(context, true, 7, run).get("cost_impact")).status());
        assertEquals(HttpStatus.CONFLICT, assertThrows(ApiException.class,
                () -> analysis.read(context, false, 7, UUID.randomUUID())).status());
        value.put("news_window_start", "2026-10-24T00:00:00Z");
        value.put("news_window_end", "2026-10-25T00:00:00Z");
        publish(value, service.today());
        assertEquals("unavailable", provider.prices(service.today(), 7).forecast().status());
        assertEquals("MONITOR", provider.recommendation(context).recommendation().value().action());
    }
    @Test void purchaseGuidanceExplainsIntervalDirectionWithoutInventingCertainty() {
        var provider = new PublishedForecastAnalysisProvider(service);
        var context = new PlanAnalysisService.Context(UUID.randomUUID(), new BigDecimal("100"),
                LocalDate.parse("2026-11-03"), service.today());
        assertEquals("SPLIT", provider.recommendation(context).recommendation().value().action());
        value.put("high", 790); value.put("raw_q90_price", 780);
        publish(value, service.today());
        assertEquals("SPLIT", provider.recommendation(context).recommendation().value().action());
        value.put("low", 810).put("high", 900).put("raw_q10_price", 820).put("raw_q90_price", 880);
        publish(value, service.today());
        assertEquals("SPLIT", provider.recommendation(context).recommendation().value().action());
        var overdue = new PlanAnalysisService.Context(context.plan_id(), context.quantity_mt(), service.today().minusDays(1), service.today());
        assertEquals("MONITOR", provider.recommendation(overdue).recommendation().value().action());
    }

    @Test void storageFailureIs503AndUnsupportedHorizonIs422() {
        when(repository.active(7)).thenThrow(new DataAccessResourceFailureException("missing table"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, assertThrows(ApiException.class, () -> service.read(7)).status());
        assertEquals(HttpStatus.UNPROCESSABLE_CONTENT, assertThrows(ApiException.class, () -> service.read(5)).status());
    }
    @Test void sharedProviderUsesSelectedRunForCostAndRejectsChangedRun() {
        PlanAnalysisService analysis = new PlanAnalysisService(new PublishedForecastAnalysisProvider(service));
        var context = new PlanAnalysisService.Context(UUID.randomUUID(), new BigDecimal("100"), LocalDate.parse("2026-11-02"), service.today());
        var response = analysis.read(context, true, 7, run);
        @SuppressWarnings("unchecked") var result = (Result<PlanAnalysisService.Impact>) response.get("cost_impact");
        assertEquals("ready", result.status());
        assertEquals(new BigDecimal("70000"), result.value().forecast_total().lower());
        assertEquals(new BigDecimal("82000"), result.value().forecast_total().upper());
        assertEquals(new BigDecimal("85000"), result.value().central_total());
        assertEquals(HttpStatus.CONFLICT, assertThrows(ApiException.class, () -> analysis.read(context, true, 7, UUID.randomUUID())).status());
        verify(repository, times(2)).active(7);
        var recommendation = analysis.read(context, false);
        assertEquals("ready", ((Result<?>) recommendation.get("recommendation")).status());
    }
}
