package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.http.HttpStatus;
import static com.cs203.mgodataapi.PlanAnalysisProvider.*;

/** One buying date from a weighted signal using only forecasts within the saved deadline. */
public final class RecommendationPolicy {
    public static final String VERSION = "deadline-weighted-v1";
    private RecommendationPolicy() {}
    public static void validate(PlanAnalysisService.Context c) {
        if (c == null || c.plan_id() == null || !positive(c.quantity_mt()) || c.purchase_deadline() == null || c.scenario_as_of_date() == null)
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "A saved plan, positive finite quantity and valid dates are required.");
        if (c.urgency() == null || !Set.of("LOW", "NORMAL", "HIGH").contains(c.urgency()))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "urgency must be LOW, NORMAL or HIGH.");
    }
    public static Guidance evaluate(PlanAnalysisService.Context c, Prices prices) {
        return evaluateAvailable(c, prices == null ? List.of() : List.of(prices));
    }

    public static Guidance evaluateAvailable(PlanAnalysisService.Context c, List<Prices> candidates) {
        validate(c);
        long days = ChronoUnit.DAYS.between(c.scenario_as_of_date(), c.purchase_deadline());
        Reference reference = candidates.stream().filter(Objects::nonNull)
                .filter(p -> c.scenario_as_of_date().equals(p.scenario_as_of_date()))
                .map(Prices::reference).filter(Objects::nonNull)
                .filter(r -> "ready".equals(r.status())).map(Result::value)
                .filter(r -> validReference(r, c)).findFirst().orElse(null);
        var reasons = new ArrayList<String>();
        var limitations = new ArrayList<String>(List.of(
                "Forecast savings are estimates, not guaranteed. Obtain a current supplier quote before buying.",
                "Reference prices are dated observations, not executable quotes. Costs exclude freight, fees and taxes.",
                "Only available 7, 14 and 30 day forecasts are compared; no prices are interpolated between targets."));
        reasons.add(days + " calendar days remain until the saved deadline " + c.purchase_deadline() + ".");
        BigDecimal now = reference == null ? null : reference.price().multiply(c.quantity_mt());
        Long age = reference == null ? null : ChronoUnit.DAYS.between(reference.observation_date(), c.scenario_as_of_date());
        Forecast best = null;
        var eligibleForecasts = new ArrayList<Forecast>();
        if (reference != null && days >= 0) {
            for (Prices p : candidates) {
                if (p == null || !c.scenario_as_of_date().equals(p.scenario_as_of_date()) || p.forecast() == null
                        || !"ready".equals(p.forecast().status())) continue;
                Forecast f = p.forecast().value();
                // Require a common observed reference so horizons are comparable.
                if (p.reference() == null || !"ready".equals(p.reference().status())
                        || !sameReference(reference, p.reference().value()) || !validForecast(f, reference, c)) continue;
                if (f.target_date().isAfter(c.purchase_deadline())) {
                    reasons.add("Excluded forecast for " + f.target_date() + ": after the purchase deadline.");
                    continue;
                }
                if (eligibleForecasts.stream().noneMatch(existing -> existing.target_date().equals(f.target_date())))
                    eligibleForecasts.add(f);
            }
        }
        eligibleForecasts.sort(Comparator.comparing(Forecast::target_date).reversed());
        BigDecimal signal = null, signalLow = null, signalHigh = null;
        if (!eligibleForecasts.isEmpty()) {
            Forecast nearest = eligibleForecasts.get(0);
            signal = nearest.central_estimate();
            signalLow = nearest.prices().lower();
            signalHigh = nearest.prices().upper();
            long nearDistance = ChronoUnit.DAYS.between(nearest.target_date(), c.purchase_deadline());
            if (eligibleForecasts.size() > 1 && nearDistance > 0) {
                Forecast other = eligibleForecasts.get(1);
                long otherDistance = ChronoUnit.DAYS.between(other.target_date(), c.purchase_deadline());
                BigDecimal totalDistance = BigDecimal.valueOf(nearDistance + otherDistance);
                BigDecimal nearestWeight = BigDecimal.valueOf(otherDistance).divide(totalDistance, MathContext.DECIMAL128);
                BigDecimal otherWeight = BigDecimal.ONE.subtract(nearestWeight);
                signal = nearest.central_estimate().multiply(nearestWeight)
                        .add(other.central_estimate().multiply(otherWeight));
                signalLow = nearest.prices().lower().multiply(nearestWeight).add(other.prices().lower().multiply(otherWeight));
                signalHigh = nearest.prices().upper().multiply(nearestWeight).add(other.prices().upper().multiply(otherWeight));
                reasons.add("Blended signal: " + percent(nearestWeight) + "% of the " + nearest.target_date()
                        + " forecast ($" + money(nearest.central_estimate()) + "/mt) + " + percent(otherWeight)
                        + "% of the " + other.target_date() + " forecast ($" + money(other.central_estimate())
                        + "/mt). Weights use inverse distance to the deadline.");
                limitations.add("The blend is a timing signal, not a forecast for the recommended date or a split purchase schedule.");
            } else {
                reasons.add("Used the " + nearest.target_date() + " forecast at 100% weight: "
                        + (nearDistance == 0 ? "its target matches the deadline." : "it is the only eligible forecast."));
            }
            reasons.add("Eligible price signal: $" + money(signal) + "/mt; weighted uncertainty range $"
                    + money(signalLow) + "–$" + money(signalHigh) + "/mt.");
            limitations.add("Weighted uncertainty bounds are a descriptive signal, not a calibrated confidence interval.");
            if (reference != null && signal.compareTo(reference.price()) < 0) best = nearest;
        }
        String action, summary;
        BigDecimal chosen = null, difference = null, width = null;
        java.time.LocalDate target = null;
        if (days < 0) {
            action = "MONITOR";
            summary = "Your purchase deadline has passed. Update the plan and obtain a current supplier quote.";
        } else if (reference == null) {
            action = "MONITOR";
            summary = "A valid reference price is unavailable. Refresh prices before choosing when to buy.";
        } else {
            action = best == null ? "BUY_NOW" : "WAIT";
            target = best == null ? c.scenario_as_of_date() : best.target_date();
            BigDecimal price = best == null ? reference.price() : signal;
            chosen = price.multiply(c.quantity_mt());
            difference = chosen.subtract(now);
            BigDecimal saving = reference.price().subtract(price);
            long waitDays = ChronoUnit.DAYS.between(c.scenario_as_of_date(), target);
            summary = best == null ? "Buy today. The eligible forecast signal does not offer a saving over today's reference price."
                    : "Buy in " + waitDays + " days (" + target + "). Estimated MGO price signal is $" + money(price)
                    + "/mt, representing a potential saving of $" + money(saving) + "/mt compared with buying today.";
            reasons.add("Compared buying today at $" + money(reference.price()) + "/mt with " + eligibleForecasts.size() + " eligible forecasts. Up to two nearest eligible targets form the signal; uncertainty can require monitoring.");
            reasons.add("Estimated savings: $" + money(saving) + "/mt; $" + money(now.subtract(chosen)) + " for " + c.quantity_mt().stripTrailingZeros().toPlainString() + " MT.");
            if (eligibleForecasts.isEmpty()) limitations.add("No available forecast fits the deadline; buying today is the only priced option in the comparison.");
            if (signal != null) {
                width = signalHigh.subtract(signalLow).divide(reference.price(), MathContext.DECIMAL128);
                boolean overlaps = signalLow.compareTo(reference.price()) <= 0 && signalHigh.compareTo(reference.price()) >= 0;
                boolean conflicting = signal.compareTo(reference.price()) < 0 ? signalHigh.compareTo(reference.price()) >= 0
                        : signalLow.compareTo(reference.price()) <= 0;
                if (age > 7 || conflicting) {
                    action = "MONITOR";
                    summary = age > 7 ? "Monitor and obtain a current supplier quote. The reference price is too old for timing advice."
                            : overlaps ? "Monitor prices. The weighted uncertainty range overlaps today's price, so the buying direction is uncertain."
                            : "Monitor prices. The point signal and uncertainty range disagree on price direction.";
                    if (best != null) summary += " The lower price signal suggests " + target + " as a date to reassess, with potential savings of $" + money(saving) + "/mt, not a confirmed buying date.";
                    reasons.add("Review fresh prices before committing; do not wait beyond " + c.purchase_deadline() + ".");
                }
            }
        }
        if (age != null && age > 7) limitations.add("The reference observation is " + age + " days old. Check a current supplier quote.");
        var evidence = new Evidence(VERSION, c.urgency(), signal == null || reference == null ? "UNAVAILABLE" : signal.compareTo(reference.price()) < 0 ? "DOWN" : signal.compareTo(reference.price()) > 0 ? "UP" : "FLAT", width, now, chosen, difference,
                age, target, "One deadline-based comparison of today against the weighted eligible forecast signal.",
                List.copyOf(reasons), List.copyOf(limitations), List.of());
        String identity = c + ":" + evidence + ":" + action;
        return new Guidance(UUID.nameUUIDFromBytes(identity.getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString(), action, summary, evidence);
    }
    private static boolean sameReference(Reference a, Reference b) {
        return b != null && b.price() != null && a.price().compareTo(b.price()) == 0
                && a.observation_date().equals(b.observation_date()) && a.basis().equals(b.basis());
    }
    private static boolean validReference(Reference r, PlanAnalysisService.Context c) {
        return r != null && positive(r.price()) && r.observation_date() != null
                && !r.observation_date().isAfter(c.scenario_as_of_date()) && basis(r.basis());
    }
    private static boolean validForecast(Forecast f, Reference r, PlanAnalysisService.Context c) {
        return f != null && f.target_date() != null && f.target_date().isAfter(c.scenario_as_of_date())
                && r.basis().equals(f.basis()) && positive(f.central_estimate()) && f.prices() != null
                && positive(f.prices().lower()) && positive(f.prices().upper())
                && f.prices().lower().compareTo(f.prices().upper()) <= 0;
    }
    private static boolean positive(BigDecimal v) { return v != null && v.signum() > 0 && Double.isFinite(v.doubleValue()); }
    private static boolean basis(Basis b) { return b != null && b.commodity() != null && !b.commodity().isBlank() && "USD".equals(b.currency()) && "MT".equals(b.unit()); }
    private static String percent(BigDecimal v) { return v.movePointRight(2).setScale(2, RoundingMode.HALF_UP).toPlainString(); }
    private static String money(BigDecimal v) { return v.setScale(2, RoundingMode.HALF_UP).toPlainString(); }
}
