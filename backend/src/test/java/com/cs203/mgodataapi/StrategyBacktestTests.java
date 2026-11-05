package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static com.cs203.mgodataapi.PlanAnalysisProvider.*;

class StrategyBacktestTests {
    final LocalDate origin = LocalDate.of(2026, 6, 1);
    final Basis basis = new Basis("Singapore MGO", "USD", "MT");
    Prices forecast(String low, String high) {
        return new Prices(origin, Result.ready(new Reference(new BigDecimal("720"), origin, basis)),
                Result.ready(new Forecast(new Range(new BigDecimal(low), new BigDecimal(high)), origin.plusDays(7), basis,
                        "experimental", "7 days", new BigDecimal("690"))));
    }
    PlanAnalysisService.Context context() {
        return new PlanAnalysisService.Context(new UUID(0, 1), new BigDecimal("100"), origin.plusDays(7), origin);
    }
    @Test void lossIsReportedUsingActualExecutionRatherThanForecast() {
        var result = StrategyBacktest.replay(context(), List.of(forecast("680", "700")),
                Map.of(origin, new BigDecimal("720"), origin.plusDays(7), new BigDecimal("750")));
        assertEquals("WAIT", result.action());
        assertEquals(new BigDecimal("-30"), result.savedPerMt());
        assertEquals(new BigDecimal("75000"), result.strategy());
    }
    @Test void monitorFallbackBuysImmediatelyEvenWhenFuturePriceFalls() {
        var result = StrategyBacktest.replay(context(), List.of(forecast("680", "740")),
                Map.of(origin, new BigDecimal("720"), origin.plusDays(7), new BigDecimal("650")));
        assertEquals("MONITOR", result.action());
        assertEquals(origin, result.purchaseDate());
        assertEquals(0, result.savedPerMt().signum());
    }
    @Test void absentObservedPriceCannotBecomeForecastProfit() {
        assertThrows(IllegalArgumentException.class, () -> StrategyBacktest.replay(context(),
                List.of(forecast("680", "700")), Map.of(origin, new BigDecimal("720"))));
    }
    @Test void quantityScalesCostsButNotSavingsPerMt() {
        var observations = Map.of(origin, new BigDecimal("720"), origin.plusDays(7), new BigDecimal("650"));
        var small = new PlanAnalysisService.Context(new UUID(0, 1), BigDecimal.ONE, origin.plusDays(7), origin);
        var result = StrategyBacktest.replay(small, List.of(forecast("680", "700")), observations);
        assertEquals(new BigDecimal("70"), result.savedPerMt());
        assertEquals(new BigDecimal("650"), result.strategy());
    }
}
