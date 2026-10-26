package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Wunna's integration boundary. Forecasts are independent of saved plans.
 * Implementations must return only information available at the supplied scenario,
 * normalize exact commodity/grade/location identities and never invent guidance.
 * Missing data is unavailable; provider failures must throw (HTTP 503), not fabricate data.
 */
public interface PlanAnalysisProvider {
    record Basis(String commodity, String currency, String unit) {}
    record Range(BigDecimal lower, BigDecimal upper) {}
    record Reference(BigDecimal price, LocalDate observation_date, Basis basis) {}
    record Forecast(Range prices, LocalDate target_date, Basis basis,
            String range_description, String horizon_description, BigDecimal central_estimate,
            java.util.UUID run_id, String model_version) {
        public Forecast(Range prices, LocalDate target_date, Basis basis, String range_description,
                String horizon_description, BigDecimal central_estimate) {
            this(prices, target_date, basis, range_description, horizon_description, central_estimate, null, null);
        }
    }
    record Guidance(String recommendation_id, String action, String explanation) {}
    record Result<T>(String status, T value, String reason, String message) {
        public static <T> Result<T> ready(T value) { return new Result<>("ready", value, null, null); }
        public static <T> Result<T> unavailable(String reason, String message) {
            return new Result<>("unavailable", null, reason, message);
        }
    }
    record Prices(LocalDate scenario_as_of_date, Result<Reference> reference, Result<Forecast> forecast) {}
    record Recommendation(PlanAnalysisService.Context context, Result<Guidance> recommendation) {}

    /** 'unavailable', 'fixture', or 'model'. This is provenance, not a confidence claim. */
    String provenance();
    Prices prices(LocalDate scenarioDate);
    default Prices prices(LocalDate scenarioDate, int horizonDays) { return prices(scenarioDate); }
    Recommendation recommendation(PlanAnalysisService.Context context);
}
