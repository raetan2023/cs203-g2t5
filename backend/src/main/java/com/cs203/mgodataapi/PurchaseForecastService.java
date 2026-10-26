package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.math.MathContext;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import static com.cs203.mgodataapi.ForecastService.*;

/** Explicitly experimental alternative for purchase plans only.
 * Empirical MGO-return q10/q90 bounds expand with yesterday's news activity/tone ranks.
 * This heuristic has no measured conditional coverage. It never modifies dashboard forecasts.
 */
@Service
public class PurchaseForecastService {
    public static final String METHOD = "experimental_gdelt_scaled_quantiles";
    private static final String VERSION = "purchase-news-range-v1";
    private final PurchaseForecastRepository repository;
    private final Clock clock;
    private final ForecastService published;
    public PurchaseForecastService(PurchaseForecastRepository repository, Clock clock, ForecastService published) {
        this.repository = repository; this.clock = clock; this.published = published;
    }
    public LocalDate today() { return LocalDate.now(clock.withZone(ZoneId.of("Asia/Singapore"))); }

    public LocalDate newsDay() { return LocalDate.now(clock.withZone(ZoneOffset.UTC)).minusDays(1); }

    public Response read(int horizon) {
        if (!Set.of(7, 14, 30).contains(horizon))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "horizon_days must be 7, 14 or 30.");
        LocalDate origin = today(), yesterday = newsDay();
        Response verified = published.read(horizon);
        if (verified instanceof Ready ready && yesterday.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().equals(ready.data().news_window_end()))
            return verified; // Retain an available model point and its validated range.
        List<PurchaseForecastRepository.Observation> observations;
        try { observations = repository.observations(origin); }
        catch (org.springframework.dao.DataAccessException failure) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Stored purchase-range inputs are unavailable. Please retry.");
        }
        TreeMap<LocalDate, BigDecimal> prices = new TreeMap<>(), counts = new TreeMap<>(), tones = new TreeMap<>();
        for (var row : observations) {
            if (row.date() == null || row.date().isBefore(origin.minusDays(400)) || !row.date().isBefore(origin)
                    || row.value() == null) return unavailable("invalid_inputs", "Stored observations contain invalid dates or values.");
            TreeMap<LocalDate, BigDecimal> series;
            switch (row.series()) {
                case "SGP_MGO_OBSERVED" -> {
                    if (!"The Maritime".equals(row.source()) || !"USD/MT".equals(row.unit()) || !"USD".equals(row.currency())
                            || row.value().signum() <= 0) return unavailable("invalid_inputs", "MGO source, currency or units are incompatible.");
                    series = prices;
                }
                case "GDELT_ARTICLE_COUNT" -> {
                    if (!"GDELT".equals(row.source()) || !"articles".equals(row.unit()) || row.value().signum() < 0
                            || row.value().stripTrailingZeros().scale() > 0) return unavailable("invalid_inputs", "GDELT article count is invalid.");
                    series = counts;
                }
                case "GDELT_AVERAGE_TONE" -> {
                    if (!"GDELT".equals(row.source()) || !"tone".equals(row.unit()))
                        return unavailable("invalid_inputs", "GDELT tone source or units are incompatible.");
                    series = tones;
                }
                default -> { return unavailable("invalid_inputs", "Unexpected input series."); }
            }
            if (!Double.isFinite(row.value().doubleValue()) || series.putIfAbsent(row.date(), row.value()) != null)
                return unavailable("invalid_inputs", "Stored observations are duplicated or nonfinite.");
        }
        if (!counts.containsKey(yesterday) || !tones.containsKey(yesterday))
            return unavailable("missing_previous_day_news", "Both stored GDELT article count and average tone are required for " + yesterday + ".");
        if (prices.isEmpty()) return unavailable("missing_reference", "No observed MGO quote is available.");
        LocalDate quoteDate = prices.lastKey();
        long age = ChronoUnit.DAYS.between(quoteDate, origin);
        if (age > 30) return unavailable("stale_reference", "The latest observed MGO quote is older than 30 days.");
        List<Double> activity = new ArrayList<>(), toneStress = new ArrayList<>();
        for (var entry : counts.subMap(yesterday.minusDays(90), true, yesterday, false).entrySet()) {
            if (!tones.containsKey(entry.getKey())) continue;
            activity.add(Math.log1p(entry.getValue().doubleValue()));
            toneStress.add(Math.abs(tones.get(entry.getKey()).doubleValue()));
        }
        if (activity.size() < 14) return unavailable("insufficient_news_history", "At least 14 prior paired GDELT days are needed to compare yesterday's news.");
        double volumeRank = rank(activity, Math.log1p(counts.get(yesterday).doubleValue()));
        double toneRank = rank(toneStress, Math.abs(tones.get(yesterday).doubleValue()));
        double multiplier = 1 + (volumeRank + toneRank) / 2; // Explicit policy: 1x to 2x historical deviations.
        int returnSpan = horizon + (int) age; // Account for the gap between a dated anchor and the forecast origin.
        List<Double> returns = new ArrayList<>();
        for (var entry : prices.entrySet()) {
            BigDecimal target = prices.get(entry.getKey().plusDays(returnSpan));
            if (target != null) returns.add(Math.log(target.divide(entry.getValue(), MathContext.DECIMAL64).doubleValue()));
        }
        if (returns.size() < 20) return unavailable("insufficient_price_history", "At least 20 exact-date observed MGO return pairs are needed for this horizon.");
        returns.sort(Double::compare);
        double q10 = Math.min(0, quantile(returns, .1)), q90 = Math.max(0, quantile(returns, .9));
        BigDecimal anchor = prices.get(quoteDate);
        // The persistence point is unchanged by news. It is labelled as such in every response.
        BigDecimal low = price(anchor, q10 * multiplier), high = price(anchor, q90 * multiplier);
        String limits = "Experimental news-adjusted range, not calibrated confidence. Historical return q10/q90 deviations "
                + "are expanded by " + String.format(java.util.Locale.ROOT, "%.2f", multiplier)
                + "x using yesterday's article-activity and absolute-tone ranks. These are proxies, not a measure of world uncertainty. "
                + "No measured coverage or purchasing advantage. Central estimate uses persistence (last observed MGO quote), not a new Ridge prediction. "
                + "Reference quote: " + quoteDate + " (" + age + " days old). "
                + (age > 7 ? "Price data is stale; this is a scenario estimate, not a current market offer. " : "")
                + "Historical return span: " + returnSpan + " days, including the age of the reference quote. GDELT date: " + yesterday + "; " + counts.get(yesterday).stripTrailingZeros().toPlainString()
                + " articles; average tone " + tones.get(yesterday).stripTrailingZeros().toPlainString() + ".";
        Interval interval = new Interval(METHOD, null, null, 0,
                returns.size() + " historical exact-date return pairs; no out-of-sample coverage evaluation.", null, null, null, limits);
        List<History> history = prices.entrySet().stream().skip(Math.max(0, prices.size() - 20))
                .map(e -> new History(e.getKey(), e.getValue())).toList();
        Value value = new Value(horizon, origin.plusDays(horizon), origin, origin, quoteDate, anchor, (int) age,
                anchor, low, high, price(anchor, q10), price(anchor, q90), "USD/metric tonne", "unevaluated", null, 0,
                List.of(), interval, yesterday.atStartOfDay(ZoneOffset.UTC).toInstant(),
                yesterday.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant(), Map.of("mgo", quoteDate, "gdelt", yesterday), history);
        // Stable across horizons/requests, changes when the underlying database evidence changes.
        String identity = VERSION + ":" + origin + ":" + observations;
        UUID run = UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8));
        return new Ready("ready", value, run, clock.instant(), VERSION);
    }
    private static double rank(List<Double> history, double value) {
        return history.stream().filter(x -> x < value).count() / (double) history.size();
    }
    private static double quantile(List<Double> sorted, double probability) {
        double index = (sorted.size() - 1) * probability;
        int lower = (int) Math.floor(index), upper = (int) Math.ceil(index);
        return sorted.get(lower) + (sorted.get(upper) - sorted.get(lower)) * (index - lower);
    }
    private static BigDecimal price(BigDecimal anchor, double change) {
        double result = anchor.doubleValue() * Math.exp(change);
        if (!Double.isFinite(result) || result <= 0) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Experimental range could not be computed.");
        return BigDecimal.valueOf(result);
    }
    private static Unavailable unavailable(String reason, String message) { return new Unavailable("unavailable", reason, message, null); }
}
