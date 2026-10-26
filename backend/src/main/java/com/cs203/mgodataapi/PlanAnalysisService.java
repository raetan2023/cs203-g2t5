package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import static com.cs203.mgodataapi.PlanAnalysisProvider.*;

@Service
public class PlanAnalysisService {
    public record Context(UUID plan_id, BigDecimal quantity_mt, LocalDate purchase_deadline, LocalDate scenario_as_of_date) {
        static Context of(PurchasePlan plan, LocalDate date) {
            return new Context(plan.planId(), plan.quantityMt(), plan.purchaseDeadline(), date);
        }
        boolean matches(Context other) {
            return other != null && plan_id.equals(other.plan_id) && quantity_mt.compareTo(other.quantity_mt) == 0
                    && purchase_deadline.equals(other.purchase_deadline) && scenario_as_of_date.equals(other.scenario_as_of_date);
        }
    }
    public record Impact(String currency, LocalDate target_date, BigDecimal reference_total, Range forecast_total,
            Range difference_total, Range savings_total, BigDecimal central_total) {}
    private final PlanAnalysisProvider provider;
    public PlanAnalysisService(PlanAnalysisProvider provider) { this.provider = provider; }

    public Map<String, Object> read(Context context, boolean impact) {
        try {
            Result<Reference> reference = Result.unavailable("missing_reference", "Reference prices are loaded separately.");
            Result<Forecast> forecast = Result.unavailable("missing_forecast", "Forecast prices are loaded separately.");
            Result<Impact> cost = Result.unavailable("missing_forecast", "Cost impact is loaded separately.");
            Result<Guidance> guidance = Result.unavailable("recommendation_unavailable", "Recommendations are loaded separately.");
            if (impact) {
                Prices prices = provider.prices(context.scenario_as_of_date);
                if (!context.scenario_as_of_date.equals(prices.scenario_as_of_date())) throw new IllegalArgumentException("Provider scenario mismatch");
                reference = validateReference(prices.reference(), context.scenario_as_of_date);
                forecast = validateForecast(prices.forecast(), context.scenario_as_of_date);
                cost = calculate(context, reference, forecast);
            } else {
                Recommendation result = provider.recommendation(context);
                if (!context.matches(result.context())) throw new IllegalArgumentException("Provider context mismatch");
                guidance = result.recommendation();
                validateResult(guidance);
                if ("ready".equals(guidance.status()) && (guidance.value() == null
                        || blank(guidance.value().recommendation_id()) || blank(guidance.value().action()) || blank(guidance.value().explanation())))
                    throw new IllegalArgumentException("Incomplete guidance");
            }
            String provenance = provider.provenance();
            if (!Set.of("fixture", "model", "unavailable").contains(provenance)
                    || ("unavailable".equals(provenance) && ("ready".equals(reference.status())
                    || "ready".equals(forecast.status()) || "ready".equals(guidance.status()))))
                throw new IllegalArgumentException("Invalid provenance");
            return Map.of("provenance", provenance, "context", context, "reference", reference,
                    "forecast", forecast, "cost_impact", cost, "recommendation", guidance);
        } catch (RuntimeException failure) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "The analysis provider could not complete this request. Please retry.");
        }
    }

    private static void validateResult(Result<?> result) {
        if (result == null || !("ready".equals(result.status()) && result.value() != null
                || "unavailable".equals(result.status()) && !blank(result.message()) && result.reason() != null
                && Set.of("missing_reference", "missing_forecast", "unsupported_horizon", "incompatible_basis",
                        "invalid_bounds", "recommendation_unavailable").contains(result.reason())))
            throw new IllegalArgumentException("Invalid provider availability result");
    }
    private static boolean validBasis(Basis basis) {
        return basis != null && !blank(basis.commodity()) && !blank(basis.currency()) && !blank(basis.unit());
    }
    private static Result<Reference> validateReference(Result<Reference> result, LocalDate scenario) {
        validateResult(result);
        if (!"ready".equals(result.status())) return result;
        Reference r = result.value();
        if (!validBasis(r.basis())) return Result.unavailable("incompatible_basis", "The reference price basis is not specified.");
        if (!nonnegative(r.price())) return Result.unavailable("invalid_bounds", "The reference price is invalid.");
        if (r.observation_date() == null || r.observation_date().isAfter(scenario))
            return Result.unavailable("unsupported_horizon", "The reference observation is not available at this historical scenario.");
        return result;
    }
    private static Result<Forecast> validateForecast(Result<Forecast> result, LocalDate scenario) {
        validateResult(result);
        if (!"ready".equals(result.status())) return result;
        Forecast f = result.value();
        if (!validBasis(f.basis())) return Result.unavailable("incompatible_basis", "The forecast price basis is not specified.");
        if (f.target_date() == null || f.target_date().isBefore(scenario))
            return Result.unavailable("unsupported_horizon", "The forecast target is not supported for this historical scenario.");
        if (f.prices() == null || !nonnegative(f.prices().lower()) || !nonnegative(f.prices().upper())
                || f.prices().lower().compareTo(f.prices().upper()) > 0 || blank(f.range_description())
                || (f.central_estimate() != null && (f.central_estimate().compareTo(f.prices().lower()) < 0
                || f.central_estimate().compareTo(f.prices().upper()) > 0)))
            return Result.unavailable("invalid_bounds", "The forecast bounds or uncertainty description are invalid.");
        return result;
    }

    static Result<Impact> calculate(Context context, Result<Reference> reference, Result<Forecast> forecast) {
        if (!"ready".equals(forecast.status())) return Result.unavailable(forecast.reason(), forecast.message());
        if (!"ready".equals(reference.status())) return Result.unavailable(reference.reason(), reference.message());
        Reference r = reference.value(); Forecast f = forecast.value();
        if (r.basis() == null || f.basis() == null || !r.basis().equals(f.basis()) || blank(r.basis().commodity())
                || !"USD".equals(r.basis().currency()) || !"MT".equals(r.basis().unit()))
            return Result.unavailable("incompatible_basis", "Reference and forecast must describe the same commodity in USD/MT.");
        if (r.observation_date() == null || r.observation_date().isAfter(context.scenario_as_of_date)
                || f.target_date() == null || f.target_date().isBefore(context.scenario_as_of_date))
            return Result.unavailable("unsupported_horizon", "The supplied price dates are incompatible with the active historical scenario.");
        if (!nonnegative(r.price()) || f.prices() == null || !nonnegative(f.prices().lower())
                || !nonnegative(f.prices().upper()) || f.prices().lower().compareTo(f.prices().upper()) > 0
                || blank(f.range_description()) || (f.central_estimate() != null &&
                (f.central_estimate().compareTo(f.prices().lower()) < 0 || f.central_estimate().compareTo(f.prices().upper()) > 0)))
            return Result.unavailable("invalid_bounds", "The source price bounds or uncertainty metadata are invalid.");
        BigDecimal q = context.quantity_mt;
        BigDecimal base = r.price().multiply(q), low = f.prices().lower().multiply(q), high = f.prices().upper().multiply(q);
        return Result.ready(new Impact("USD", f.target_date(), base, new Range(low, high),
                new Range(low.subtract(base), high.subtract(base)), new Range(base.subtract(high), base.subtract(low)),
                f.central_estimate() == null ? null : f.central_estimate().multiply(q)));
    }
    private static boolean nonnegative(BigDecimal value) { return value != null && value.signum() >= 0; }
    private static boolean blank(String value) { return value == null || value.isBlank(); }
}
