package com.cs203.mgodataapi;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static com.cs203.mgodataapi.PlanAnalysisProvider.*;
class RecommendationPolicyTests {
    final LocalDate date = LocalDate.of(2026, 10, 27);
    final Basis basis = new Basis("Singapore MGO", "USD", "MT");
    PlanAnalysisService.Context context(int days) {
        return new PlanAnalysisService.Context(UUID.fromString("00000000-0000-0000-0000-000000000001"), new BigDecimal("100.125"), date.plusDays(days), date);
    }
    Prices prices(int days, String point) {
        return new Prices(date, Result.ready(new Reference(new BigDecimal("720"), date, basis)),
                Result.ready(new Forecast(new Range(new BigDecimal(point).subtract(BigDecimal.ONE), new BigDecimal(point).add(BigDecimal.ONE)), date.plusDays(days), basis, "Experimental bounds", days + " days", new BigDecimal(point))));
    }
    @Test void twentyDayExample() {
        var result = RecommendationPolicy.evaluateAvailable(context(20), List.of(prices(7, "710"), prices(14, "695"), prices(30, "680")));
        assertEquals("WAIT", result.action());
        assertEquals(date.plusDays(14), result.evidence().supported_target_date());
        assertTrue(result.explanation().contains("$20.26/mt"));
        assertEquals(-2028.85, result.evidence().alternative_minus_now_usd().doubleValue(), 0.01);
        assertTrue(result.evidence().reasons().stream().anyMatch(s -> s.contains("68.42%") && s.contains("31.58%")));
        assertTrue(result.evidence().reasons().stream().anyMatch(s -> s.contains("Excluded")));
    }
    @Test void deadlineInclusiveAndTodayCheaper() {
        assertEquals(date.plusDays(14), RecommendationPolicy.evaluate(context(14), prices(14, "695")).evidence().supported_target_date());
        var result = RecommendationPolicy.evaluateAvailable(context(30), List.of(prices(7, "721"), prices(14, "730"), prices(30, "740")));
        assertEquals("BUY_NOW", result.action());
        assertEquals(date, result.evidence().supported_target_date());
        assertEquals(0, result.evidence().alternative_minus_now_usd().signum());
    }
    @Test void tiesPreferTodayAndBlendedSignalUsesNearestEligibleDate() {
        assertEquals("MONITOR", RecommendationPolicy.evaluate(context(30), prices(7, "720")).action());
        assertEquals(date.plusDays(14), RecommendationPolicy.evaluateAvailable(context(30), List.of(prices(14, "695"), prices(7, "695"))).evidence().supported_target_date());
    }
    @Test void shortAndOverdueDeadlines() {
        for (int days : new int[] {0, 1, 6}) assertEquals("BUY_NOW", RecommendationPolicy.evaluate(context(days), prices(7, "695")).action());
        var overdue = RecommendationPolicy.evaluate(context(-1), prices(7, "695"));
        assertEquals("MONITOR", overdue.action());
        assertNull(overdue.evidence().supported_target_date());
        assertNull(overdue.evidence().alternative_minus_now_usd());
    }
    @Test void missingForecastStillComparesToday() {
        assertEquals("MONITOR", RecommendationPolicy.evaluate(context(20), null).action());
        var good = prices(14, "695");
        var missing = new Prices(date, good.reference(), Result.<Forecast>unavailable("missing_forecast", "Missing"));
        assertEquals("BUY_NOW", RecommendationPolicy.evaluate(context(20), missing).action());
    }
    @Test void urgencyDoesNotOverrideCheapestPrice() {
        assertEquals("WAIT", RecommendationPolicy.evaluate(context(20).withUrgency("HIGH"), prices(14, "695")).action());
        assertEquals(RecommendationPolicy.evaluate(context(20), prices(14, "695")), RecommendationPolicy.evaluate(context(20), prices(14, "695")));
    }
    @Test void blendCanRejectWaitingEvenWhenOneIndividualForecastIsCheaper() {
        var result = RecommendationPolicy.evaluateAvailable(context(20), List.of(prices(7, "600"), prices(14, "800"), prices(30, "500")));
        assertEquals("BUY_NOW", result.action());
        assertEquals(0, result.evidence().alternative_minus_now_usd().signum());
    }
    @Test void exactDeadlineUsesOnlyMatchingForecast() {
        var result = RecommendationPolicy.evaluateAvailable(context(14), List.of(prices(7, "600"), prices(14, "730")));
        assertEquals("BUY_NOW", result.action());
        assertTrue(result.evidence().reasons().stream().anyMatch(s -> s.contains("100%")));
    }
    @Test void uncertaintyOverlapProducesMonitorWithDirectionAndPotentialSavings() {
        var original = prices(14, "695");
        var wide = new Prices(date, original.reference(), Result.ready(new Forecast(new Range(new BigDecimal("600"), new BigDecimal("800")), date.plusDays(14), basis, "Wide bounds", "14 days", new BigDecimal("695"))));
        var result = RecommendationPolicy.evaluate(context(20), wide);
        assertEquals("MONITOR", result.action());
        assertEquals("DOWN", result.evidence().direction());
        assertTrue(result.explanation().contains("overlaps"));
        assertTrue(result.explanation().contains("$25.00/mt"));
    }
    @Test void weightedUncertaintyUsesSameWeightsAsPrice() {
        var a = prices(7, "710");
        var b = prices(14, "695");
        var wide = new Prices(date, b.reference(), Result.ready(new Forecast(new Range(new BigDecimal("600"), new BigDecimal("800")), date.plusDays(14), basis, "Wide", "14 days", new BigDecimal("695"))));
        var result = RecommendationPolicy.evaluateAvailable(context(20), List.of(a, wide));
        assertEquals("MONITOR", result.action());
        assertTrue(result.evidence().reasons().stream().anyMatch(reason -> reason.contains("$634.42") && reason.contains("$771.89")));
    }
    @Test void staleReferenceProducesMonitorAndMalformedForecastCannotCreateSavings() {
        var p = prices(14, "695");
        var stale = new Prices(date, Result.ready(new Reference(new BigDecimal("720"), date.minusDays(8), basis)), p.forecast());
        assertEquals("MONITOR", RecommendationPolicy.evaluate(context(20), stale).action());
        var malformed = new Prices(date, p.reference(), Result.ready(new Forecast(new Range(new BigDecimal("800"), new BigDecimal("600")), date.plusDays(14), basis, "Bad", "14 days", new BigDecimal("695"))));
        assertEquals("BUY_NOW", RecommendationPolicy.evaluate(context(20), malformed).action());
    }
    @Test void invalidQuantityRejected() {
        assertThrows(ApiException.class, () -> RecommendationPolicy.evaluate(new PlanAnalysisService.Context(UUID.randomUUID(), BigDecimal.ZERO, date, date), null));
    }
}
