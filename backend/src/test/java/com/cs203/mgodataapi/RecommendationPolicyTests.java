package com.cs203.mgodataapi;

import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static com.cs203.mgodataapi.PlanAnalysisProvider.*;

class RecommendationPolicyTests {
    final LocalDate date = LocalDate.of(2026, 10, 26);
    final Basis basis = new Basis("Singapore MGO", "USD", "MT");
    final UUID id = UUID.randomUUID();
    PlanAnalysisService.Context context(int days, String urgency) {
        return new PlanAnalysisService.Context(id, new BigDecimal("100.125"), date.plusDays(days), date, urgency);
    }
    Prices prices(String point, String low, String high, int age, int target) {
        return new Prices(date, Result.ready(new Reference(new BigDecimal("100"), date.minusDays(age), basis)),
            Result.ready(new Forecast(new Range(new BigDecimal(low), new BigDecimal(high)), date.plusDays(target), basis,
                "Experimental test interval", "7 calendar days", point == null ? null : new BigDecimal(point))));
    }
    Guidance decide(String point, String low, String high) {
        return RecommendationPolicy.evaluate(context(7, "NORMAL"), prices(point, low, high, 0, 7));
    }
    @Test void allFourOutcomesAndSignConvention() {
        assertEquals("BUY_NOW", decide("102", "101", "103").action());
        var wait = decide("98", "97", "99");
        assertEquals("WAIT", wait.action());
        assertEquals(0, new BigDecimal("10012.500").compareTo(wait.evidence().buy_now_cost_usd()));
        assertEquals(0, new BigDecimal("-200.250").compareTo(wait.evidence().alternative_minus_now_usd()));
        assertEquals("SPLIT", decide("98", "90", "110").action());
        assertEquals("MONITOR", decide("100", "99", "101").action());
    }
    @Test void thresholdBoundariesAreInclusiveAndQuantityIndependent() {
        assertEquals("MONITOR", decide("100.999", "100", "102").action());
        assertEquals("BUY_NOW", decide("101", "100", "102").action());
        assertEquals("WAIT", decide("99", "98", "100").action());
        assertEquals("BUY_NOW", decide("102", "97", "106.999").action());
        assertEquals("SPLIT", decide("102", "97", "107").action());
        assertEquals("MONITOR", decide("100", "80", "120").action()); // Flat before width.
    }
    @Test void deadlineAndUrgencyPrecedence() {
        var fallingWide = prices("98", "90", "110", 0, 7);
        assertEquals("BUY_NOW", RecommendationPolicy.evaluate(context(7, "HIGH"), fallingWide).action());
        assertEquals("SPLIT", RecommendationPolicy.evaluate(context(7, "LOW"), fallingWide).action());
        assertEquals("BUY_NOW", RecommendationPolicy.evaluate(context(0, "LOW"), null).action());
        assertEquals("BUY_NOW", RecommendationPolicy.evaluate(context(1, "NORMAL"), null).action());
        assertEquals("MONITOR", RecommendationPolicy.evaluate(context(2, "HIGH"), null).action());
        var overdue = RecommendationPolicy.evaluate(context(-1, "HIGH"), fallingWide);
        assertEquals("MONITOR", overdue.action());
        assertTrue(overdue.explanation().contains("now"));
        assertTrue(overdue.evidence().allocations().isEmpty());
    }
    @Test void horizonBoundariesAndNoExtrapolation() {
        var p = prices("98", "97", "99", 0, 7);
        assertEquals("MONITOR", RecommendationPolicy.evaluate(context(6, "NORMAL"), p).action());
        assertNull(RecommendationPolicy.evaluate(context(6, "NORMAL"), p).evidence().alternative_cost_usd());
        assertEquals("WAIT", RecommendationPolicy.evaluate(context(7, "NORMAL"), p).action());
        var beyond = RecommendationPolicy.evaluate(context(30, "NORMAL"), p);
        assertEquals("WAIT", beyond.action());
        assertEquals(date.plusDays(7), beyond.evidence().supported_target_date());
        assertTrue(beyond.evidence().limitations().stream().anyMatch(s -> s.contains("no extrapolated")));
        assertEquals("MONITOR", RecommendationPolicy.evaluate(context(7, "NORMAL"), prices("98", "97", "99", 0, 0)).action());
    }
    @Test void staleMissingMalformedAndMismatchedDataDoNotProducePriceAdvice() {
        assertEquals("WAIT", RecommendationPolicy.evaluate(context(7, "NORMAL"), prices("98", "97", "99", 7, 7)).action());
        assertEquals("MONITOR", RecommendationPolicy.evaluate(context(7, "NORMAL"), prices("98", "97", "99", 8, 7)).action());
        for (Prices p : new Prices[]{null, prices(null, "97", "99", 0, 7), prices("98", "99", "97", 0, 7), prices("98", "-1", "99", 0, 7), prices("98", "97", "99", -1, 7)})
            assertEquals("MONITOR", RecommendationPolicy.evaluate(context(7, "NORMAL"), p).action());
        var good = prices("98", "97", "99", 0, 7);
        var incompatible = new Prices(date, Result.ready(new Reference(new BigDecimal("100"), date, new Basis("Brent", "USD", "MT"))), good.forecast());
        var decision = RecommendationPolicy.evaluate(context(7, "NORMAL"), incompatible);
        assertEquals("MONITOR", decision.action());
        assertNull(decision.evidence().alternative_cost_usd());
    }
    @Test void splitAllocationIsPositiveExactAndInsideDeadline() {
        var c = context(7, "NORMAL");
        var result = RecommendationPolicy.evaluate(c, prices("98", "90", "110", 0, 7));
        var a = result.evidence().allocations();
        assertEquals(2, a.size());
        assertEquals(0, a.get(0).quantity_mt().add(a.get(1).quantity_mt()).compareTo(c.quantity_mt()));
        assertTrue(a.stream().allMatch(x -> x.quantity_mt().signum() > 0 && !x.date().isAfter(c.purchase_deadline())));
        assertEquals(date, a.get(0).date());
        assertEquals(date.plusDays(7), a.get(1).date());
    }
    @Test void invalidRequestsAre422NotMonitor() {
        for (BigDecimal quantity : new BigDecimal[]{null, BigDecimal.ZERO, BigDecimal.ONE.negate(), new BigDecimal("1e400")})
            assertThrows(ApiException.class, () -> RecommendationPolicy.evaluate(new PlanAnalysisService.Context(id, quantity, date.plusDays(7), date), null));
        assertThrows(ApiException.class, () -> RecommendationPolicy.evaluate(context(7, "ASAP"), null));
        assertThrows(ApiException.class, () -> RecommendationPolicy.evaluate(context(7, null), null));
    }
    @Test void configurableThresholdAndDeterminism() {
        var p = prices("102", "101", "103", 0, 7);
        var c = context(7, "NORMAL");
        var cfg = new RecommendationPolicy.Config(new BigDecimal("0.03"), new BigDecimal("0.1"), 7, 1, new BigDecimal("0.5"));
        assertEquals("MONITOR", RecommendationPolicy.evaluate(c, p, cfg).action());
        assertEquals(RecommendationPolicy.evaluate(c, p), RecommendationPolicy.evaluate(c, p));
    }
}
