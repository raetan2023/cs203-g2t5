package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.math.MathContext;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.http.HttpStatus;
import static com.cs203.mgodataapi.PlanAnalysisProvider.*;

/** Side-effect-free advisory heuristic; thresholds are choices, not validated trading rules. */
public final class RecommendationPolicy {
    private RecommendationPolicy() {}
    public record Config(BigDecimal materialFraction, BigDecimal wideFraction, int maxAgeDays,
            int imminentDays, BigDecimal splitNowFraction) {
        public Config {
            if (materialFraction == null || materialFraction.signum() <= 0 || wideFraction == null || wideFraction.signum() <= 0
                    || maxAgeDays < 0 || imminentDays < 0 || splitNowFraction == null || splitNowFraction.signum() <= 0
                    || splitNowFraction.compareTo(BigDecimal.ONE) >= 0) throw new IllegalArgumentException("Invalid policy configuration");
        }
    }
    public static final String VERSION = "buyer-heuristic-v1";
    // Fractions of reference price, calendar days, fraction of requested MT.
    public static final Config DEFAULT = new Config(new BigDecimal("0.01"), new BigDecimal("0.10"), 7, 1, new BigDecimal("0.5"));
    public static void validate(PlanAnalysisService.Context c) {
        if (c == null || c.plan_id() == null || !positive(c.quantity_mt()) || c.purchase_deadline() == null || c.scenario_as_of_date() == null)
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "A saved plan, positive finite quantity and valid dates are required.");
        if (c.urgency() == null || !Set.of("LOW", "NORMAL", "HIGH").contains(c.urgency()))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "urgency must be LOW, NORMAL or HIGH.");
    }
    public static Guidance evaluate(PlanAnalysisService.Context c, Prices p) { return evaluate(c, p, DEFAULT); }
    public static Guidance evaluate(PlanAnalysisService.Context c, Prices p, Config cfg) {
        validate(c);
        var reasons = new ArrayList<String>();
        var limits = new ArrayList<String>(List.of(
            "Advisory heuristic only; no purchase is executed. Obtain a current supplier quote before acting.",
            "Dated reference prices are not live executable quotes. Estimated USD costs exclude freight, fees, taxes, financing and currency conversion.",
            "Intervals are experimental ranges, not probabilities of prices rising or falling. No guaranteed savings or validated purchasing advantage.",
            "Urgency applies to this analysis and is not stored with the plan. Split allocations are illustrative policy choices, not an optimal schedule."));
        Reference r = p != null && p.reference() != null && "ready".equals(p.reference().status()) ? p.reference().value() : null;
        Forecast f = p != null && p.forecast() != null && "ready".equals(p.forecast().status()) ? p.forecast().value() : null;
        long days = ChronoUnit.DAYS.between(c.scenario_as_of_date(), c.purchase_deadline());
        boolean vr = r != null && positive(r.price()) && r.observation_date() != null && !r.observation_date().isAfter(c.scenario_as_of_date()) && basis(r.basis());
        Long age = vr ? ChronoUnit.DAYS.between(r.observation_date(), c.scenario_as_of_date()) : null;
        boolean vf = f != null && f.target_date() != null && f.target_date().isAfter(c.scenario_as_of_date())
            && positive(f.central_estimate()) && f.prices() != null && positive(f.prices().lower()) && positive(f.prices().upper())
            && f.prices().lower().compareTo(f.prices().upper()) <= 0 && basis(f.basis()) && f.range_description() != null && !f.range_description().isBlank();
        boolean comparable = vr && vf && r.basis().equals(f.basis());
        boolean fits = vf && !f.target_date().isAfter(c.purchase_deadline());
        BigDecimal now = vr ? r.price().multiply(c.quantity_mt()) : null;
        BigDecimal alternative = comparable && fits ? f.central_estimate().multiply(c.quantity_mt()) : null;
        BigDecimal diff = alternative == null ? null : alternative.subtract(now);
        BigDecimal width = comparable ? f.prices().upper().subtract(f.prices().lower()).divide(r.price(), MathContext.DECIMAL128) : null;
        BigDecimal change = comparable ? f.central_estimate().subtract(r.price()).divide(r.price(), MathContext.DECIMAL128) : null;
        String direction = change == null ? "UNAVAILABLE" : change.abs().compareTo(cfg.materialFraction()) < 0 ? "FLAT" : change.signum() > 0 ? "UP" : "DOWN";
        boolean reliable = comparable && fits && age <= cfg.maxAgeDays();
        if (p != null && p.reference() != null && !"ready".equals(p.reference().status()) && p.reference().message() != null) limits.add(p.reference().message());
        if (p != null && p.forecast() != null && !"ready".equals(p.forecast().status()) && p.forecast().message() != null) limits.add(p.forecast().message());
        if (!vr) limits.add("A valid positive USD/MT reference price and observation date are unavailable.");
        if (!vf) limits.add("A valid future point forecast with complete ordered bounds is unavailable; no extrapolation is used.");
        if (vr && age > cfg.maxAgeDays()) limits.add("Reference age " + age + " calendar days exceeds the freshness limit of " + cfg.maxAgeDays() + " days.");
        if (vf && !fits) limits.add("Forecast target " + f.target_date() + " exceeds the purchase deadline. A within-window alternative cost is unavailable.");
        if (vf && c.purchase_deadline().isAfter(f.target_date())) limits.add("Deadline exceeds selected forecast target " + f.target_date() + ". Waiting ends at that target; no extrapolated deadline-price estimate is made.");
        if (vr && vf && !comparable) limits.add("Reference and forecast commodity, currency or quantity units do not match.");
        if (comparable) reasons.add("Point direction " + direction + "; material threshold " + pct(cfg.materialFraction()) + "; interval width/reference " + pct(width) + " (wide at " + pct(cfg.wideFraction()) + ").");
        if (diff != null) reasons.add("Estimated alternative minus buy-now cost: USD " + diff.setScale(2, java.math.RoundingMode.HALF_UP) + ". Positive means waiting costs more; negative means less.");
        String action, summary;
        var allocations = new ArrayList<Allocation>();
        if (days < 0) {
            action = "MONITOR"; summary = "Review the overdue plan and obtain a supplier quote now.";
            reasons.add("The deadline has passed; no future purchase schedule is feasible. Do not wait for this forecast.");
        } else if (days <= cfg.imminentDays()) {
            action = "BUY_NOW"; summary = "Seek a supplier quote now to meet the imminent deadline.";
            reasons.add("Only " + days + " calendar days remain. This operational constraint does not establish forecast reliability.");
        } else if (!reliable) {
            action = "MONITOR"; summary = "Refresh evidence before choosing purchase timing.";
            reasons.add("Insufficient evidence for price-driven timing. Review by " + c.scenario_as_of_date().plusDays(1) + " before your deadline.");
            if ("HIGH".equals(c.urgency())) reasons.add("High urgency warrants contacting a supplier now despite insufficient forecast evidence.");
        } else if ("HIGH".equals(c.urgency())) {
            action = "BUY_NOW"; summary = "Prioritise securing supply now because urgency is high.";
            reasons.add("High urgency takes precedence over direction and interval width; this is an operational preference.");
        } else if ("FLAT".equals(direction)) {
            action = "MONITOR"; summary = "No material estimated price difference; review tomorrow.";
            reasons.add("The estimated change is below the material threshold. Negligible estimated savings do not justify waiting.");
        } else if (width.compareTo(cfg.wideFraction()) >= 0) {
            action = "SPLIT"; summary = "Consider an illustrative split to spread timing exposure.";
            reasons.add("A material point signal conflicts with wide uncertainty. A fixed split avoids concentrating all timing exposure on one date.");
            BigDecimal first = c.quantity_mt().multiply(cfg.splitNowFraction());
            allocations.add(new Allocation(c.scenario_as_of_date(), first));
            allocations.add(new Allocation(f.target_date(), c.quantity_mt().subtract(first)));
            reasons.add("Confirm supplier lot sizes and availability; allocations are illustrative, not optimal.");
        } else if ("UP".equals(direction)) {
            action = "BUY_NOW"; summary = "Consider buying now because the point estimate is materially higher.";
            reasons.add("Estimated waiting cost is materially higher with an interval below the wide threshold.");
        } else {
            action = "WAIT"; summary = "Consider waiting until " + f.target_date() + ", then reassess.";
            reasons.add("Estimated waiting cost is materially lower with an interval below the wide threshold. Check evidence tomorrow and do not wait beyond your deadline.");
        }
        reasons.add("Deadline " + c.purchase_deadline() + "; urgency " + c.urgency() + "; quantity " + c.quantity_mt().stripTrailingZeros().toPlainString() + " MT.");
        var evidence = new Evidence(VERSION, c.urgency(), direction, width, now, alternative, diff, age,
            vf ? f.target_date() : null, f == null ? "Unavailable" : f.horizon_description(), List.copyOf(reasons), List.copyOf(limits), List.copyOf(allocations));
        String identity = c + ":" + evidence + ":" + action;
        return new Guidance(UUID.nameUUIDFromBytes(identity.getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString(), action, summary, evidence);
    }
    private static boolean positive(BigDecimal v) { return v != null && v.signum() > 0 && Double.isFinite(v.doubleValue()); }
    private static boolean basis(Basis b) { return b != null && b.commodity() != null && !b.commodity().isBlank() && "USD".equals(b.currency()) && "MT".equals(b.unit()); }
    private static String pct(BigDecimal v) { return v.movePointRight(2).setScale(2, java.math.RoundingMode.HALF_UP) + "%"; }
}
