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
    public static final String VERSION = "near-term-weighted-v3";
    /** With this many days or fewer left there is no time to wait, so the engine says Buy Now outright. */
    public static final int BUY_NOW_WITHIN_DAYS = 7;
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
        // A short deadline leaves no time to wait, so forecasts are not used at all.
        boolean shortDeadline = days >= 0 && days <= BUY_NOW_WITHIN_DAYS;
        if (reference != null && days >= 0 && !shortDeadline) {
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
        eligibleForecasts.sort(Comparator.comparing(Forecast::target_date));
        BigDecimal signal = null, signalLow = null, signalHigh = null;
        var signalInputs = new ArrayList<SignalInput>();
        if (!eligibleForecasts.isEmpty()) {
            Forecast nearest = eligibleForecasts.get(0);
            BigDecimal inverseDaysTotal = eligibleForecasts.stream()
                    .map(f -> BigDecimal.ONE.divide(BigDecimal.valueOf(
                            ChronoUnit.DAYS.between(c.scenario_as_of_date(), f.target_date())), MathContext.DECIMAL128))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            signal = BigDecimal.ZERO;
            signalLow = BigDecimal.ZERO;
            signalHigh = BigDecimal.ZERO;
            BigDecimal remainingWeight = BigDecimal.ONE;
            var contributions = new ArrayList<String>();
            for (int index = 0; index < eligibleForecasts.size(); index++) {
                Forecast forecast = eligibleForecasts.get(index);
                BigDecimal inverseDays = BigDecimal.ONE.divide(BigDecimal.valueOf(
                        ChronoUnit.DAYS.between(c.scenario_as_of_date(), forecast.target_date())), MathContext.DECIMAL128);
                BigDecimal weight = index == eligibleForecasts.size() - 1 ? remainingWeight
                        : inverseDays.divide(inverseDaysTotal, MathContext.DECIMAL128);
                remainingWeight = remainingWeight.subtract(weight);
                signal = signal.add(forecast.central_estimate().multiply(weight));
                signalLow = signalLow.add(forecast.prices().lower().multiply(weight));
                signalHigh = signalHigh.add(forecast.prices().upper().multiply(weight));
                signalInputs.add(new SignalInput(forecast.target_date(), weight, forecast.central_estimate()));
                contributions.add(percent(weight) + "% of the " + forecast.target_date()
                        + " forecast ($" + money(forecast.central_estimate()) + "/mt)");
            }
            reasons.add("Blended signal: " + String.join(" + ", contributions)
                    + ". Weights use inverse days from the planning date; nearer-term forecasts receive more weight.");
            limitations.add("The blend is a timing signal, not a forecast for the recommended date or a split purchase schedule.");
            reasons.add("Eligible price signal: $" + money(signal) + "/mt; weighted uncertainty range $"
                    + money(signalLow) + "–$" + money(signalHigh) + "/mt.");
            limitations.add("Weighted uncertainty bounds are a descriptive signal, not a calibrated confidence interval.");
            if (reference != null && signal.compareTo(reference.price()) < 0) best = nearest;
        }
        // Current news-aware Ridge results may use dated observed references, as disclosed.
        // The requested estimate-based policy uses the centre for timing, not range overlap.
        boolean estimateDriven = !shortDeadline && candidates.stream().filter(Objects::nonNull)
                .filter(p -> c.scenario_as_of_date().equals(p.scenario_as_of_date()))
                .filter(p -> p.forecast() != null && "ready".equals(p.forecast().status()))
                .map(p -> p.forecast().value())
                .anyMatch(f -> f.model_version() != null && f.model_version().startsWith("ridge-decision-gdelt-")
                        && reference != null && validForecast(f, reference, c));
        if (estimateDriven) limitations.add("Timing uses the news-aware Ridge central estimate, including when the reference is dated. Wide ranges and quote age remain limitations, not automatic Monitor overrides.");
        String action, summary;
        BigDecimal chosen = null, difference = null, width = null;
        java.time.LocalDate target = null;
        if (days < 0) {
            action = "MONITOR";
            summary = "Your purchase deadline has passed. Update the plan and obtain a current supplier quote.";
        } else if (reference == null) {
            action = "MONITOR";
            summary = "A valid reference price is unavailable. Refresh prices before choosing when to buy.";
        } else if (shortDeadline) {
            // No Monitor override applies, even for an old reference price: waiting is not an option.
            action = "BUY_NOW";
            target = c.scenario_as_of_date();
            chosen = now;
            difference = BigDecimal.ZERO;
            summary = "Buy today. With " + days + (days == 1 ? " day" : " days") + " left before the deadline, there is no time to wait for a lower price.";
            reasons.add("The deadline is " + BUY_NOW_WITHIN_DAYS + " days away or less, so forecasts are not used and buying today at $"
                    + money(reference.price()) + "/mt is the recommendation.");
            limitations.add("Forecasts are not compared for deadlines " + BUY_NOW_WITHIN_DAYS + " days away or less.");
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
            reasons.add("Compared buying today at $" + money(reference.price()) + "/mt with " + eligibleForecasts.size() + " eligible forecasts. All eligible targets form the signal; uncertainty can require monitoring.");
            reasons.add("Estimated savings: $" + money(saving) + "/mt; $" + money(now.subtract(chosen)) + " for " + c.quantity_mt().stripTrailingZeros().toPlainString() + " MT.");
            if (eligibleForecasts.isEmpty()) limitations.add("No available forecast fits the deadline; buying today is the only priced option in the comparison.");
            if (signal != null) {
                width = signalHigh.subtract(signalLow).divide(reference.price(), MathContext.DECIMAL128);
                boolean overlaps = signalLow.compareTo(reference.price()) <= 0 && signalHigh.compareTo(reference.price()) >= 0;
                boolean conflicting = signal.compareTo(reference.price()) < 0 ? signalHigh.compareTo(reference.price()) >= 0
                        : signalLow.compareTo(reference.price()) <= 0;
                if (conflicting && !estimateDriven) {
                    action = "MONITOR";
                    summary = overlaps ? "Monitor prices. The weighted uncertainty range overlaps today's price, so the buying direction is uncertain."
                            : "Monitor prices. The point signal and uncertainty range disagree on price direction.";
                    if (best != null) summary += " The lower price signal suggests " + target + " as a date to reassess, with potential savings of $" + money(saving) + "/mt, not a confirmed buying date.";
                    reasons.add("Review fresh prices before committing; do not wait beyond " + c.purchase_deadline() + ".");
                }
            }
            if (age > 7 && !estimateDriven) {
                action = "MONITOR";
                summary = "Monitor and obtain a current supplier quote. The reference price is too old for timing advice.";
                target = null;
                chosen = null;
                difference = null;
            }
        }
        if (age != null && age > 7) limitations.add("The reference observation is " + age + " days old. Check a current supplier quote.");
        var evidence = new Evidence(VERSION, c.urgency(), signal == null || reference == null ? "UNAVAILABLE" : signal.compareTo(reference.price()) < 0 ? "DOWN" : signal.compareTo(reference.price()) > 0 ? "UP" : "FLAT", width, now, chosen, difference,
                age, target, "One near-term-weighted comparison of today against the weighted eligible forecast signal.",
                List.copyOf(reasons), List.copyOf(limitations), List.of(), signal, signalLow, signalHigh, List.copyOf(signalInputs));
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
