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
 * Original Ridge quantile-artifact bounds expand with yesterday's news activity/tone ranks.
 * This heuristic has no measured conditional coverage. It never modifies dashboard forecasts.
 */
@Service
public class PurchaseForecastService {
    public static final String METHOD = "experimental_gdelt_scaled_quantiles";
    private static final String VERSION = "purchase-ridge-news-db-v3";
    private final PurchaseForecastRepository repository;
    private final Clock clock;
    private final RidgeInference ridge;
    public PurchaseForecastService(PurchaseForecastRepository repository, Clock clock, RidgeInference ridge) {
        this.repository = repository; this.clock = clock; this.ridge = ridge;
    }
    public LocalDate today() { return LocalDate.now(clock.withZone(ZoneId.of("Asia/Singapore"))); }

    public LocalDate newsDay() { return LocalDate.now(clock.withZone(ZoneOffset.UTC)).minusDays(1); }

    public Response read(int horizon) {
        if (!Set.of(7, 14, 30).contains(horizon))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "horizon_days must be 7, 14 or 30.");
        LocalDate origin = today(), yesterday = newsDay();
        List<PurchaseForecastRepository.Observation> observations;
        try { observations = repository.observations(origin); }
        catch (org.springframework.dao.DataAccessException failure) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Stored purchase-range inputs are unavailable. Please retry.");
        }
        TreeMap<LocalDate, BigDecimal> prices = new TreeMap<>(), counts = new TreeMap<>(), tones = new TreeMap<>();
        for (var row : observations) {
            if (row.date() == null || row.date().isBefore(origin.minusDays(400)) || (row.date().isAfter(origin) || (row.date().equals(origin) && !row.series().equals("SGP_MGO_OBSERVED")))
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
        tools.jackson.databind.JsonNode model;
        try { model = ridge.predict(horizon, origin); }
        catch (IllegalStateException failure) { return unavailable("ridge_unavailable", failure.getMessage()); }
        if (!"ready".equals(model.path("status").asText()))
            return unavailable("ridge_unavailable", model.path("message").asText("Ridge prediction unavailable."));
        LocalDate modelAnchor, target;
        BigDecimal central, modelLow, modelHigh, modelAnchorPrice, rawLow, rawHigh;
        String modelVersion = model.path("model_version").asText();
        try {
            modelAnchor = LocalDate.parse(model.path("anchor_quote_date").asText());
            target = LocalDate.parse(model.path("target_date").asText());
            central = new BigDecimal(model.path("forecast").asText());
            modelLow = new BigDecimal(model.path("low").asText());
            modelHigh = new BigDecimal(model.path("high").asText());
            modelAnchorPrice = new BigDecimal(model.path("anchor_price").asText());
            rawLow = new BigDecimal(model.path("raw_q10_price").asText());
            rawHigh = new BigDecimal(model.path("raw_q90_price").asText());
            if (!"supabase".equals(model.path("input_source").asText())
                    || !modelAnchor.equals(quoteDate) || modelAnchorPrice.compareTo(prices.get(quoteDate)) != 0
                    || model.path("horizon_days").asInt() != horizon || !"USD/metric tonne".equals(model.path("unit").asText())
                    || !Double.isFinite(central.doubleValue()) || !Double.isFinite(modelHigh.doubleValue())
                    || rawLow.signum() <= 0 || rawHigh.compareTo(rawLow) < 0
                    || !model.path("inference_snapshot").asText().matches("[a-f0-9]{64}")
                    || !target.equals(modelAnchor.plusDays(horizon)) || !target.isAfter(origin)
                    || modelAnchor.isAfter(origin) || central.signum() <= 0 || modelLow.signum() <= 0
                    || modelHigh.compareTo(modelLow) < 0 || modelAnchorPrice.signum() <= 0
                    || !model.path("as_of_date").asText().equals(origin.toString())
                    || !model.path("execution").asText().equals("src.predict.predict:standardscaler+ridgecv")
                    || !model.path("artifact_sha256").asText().matches("[a-f0-9]{64}")
                    || !model.path("input_snapshot").asText().matches("[a-f0-9]{64}")
                    || !modelVersion.startsWith("ridge-")) throw new IllegalArgumentException();
        } catch (RuntimeException invalid) { return unavailable("invalid_ridge_response", "Ridge returned invalid dates, prices or provenance."); }
        BigDecimal anchor = modelAnchorPrice;
        // Widen each baseline endpoint away from the executed Ridge centre in log-price space.
        // Include the centre if independent quantile regressions place it outside their interval.
        double q10 = Math.min(0, Math.log(modelLow.divide(central, MathContext.DECIMAL64).doubleValue()));
        double q90 = Math.max(0, Math.log(modelHigh.divide(central, MathContext.DECIMAL64).doubleValue()));
        BigDecimal low = price(central, q10 * multiplier), high = price(central, q90 * multiplier);
        String limits = "Experimental news-adjusted q10/q90-based bounds; no measured conditional coverage or purchasing advantage. "
                + "Original repository Ridge pipeline executed using the current database observation snapshot " + model.path("input_snapshot").asText()
                + ". Central prediction is unchanged by news. Baseline calibrated quantile endpoints expand away from the Ridge centre by "
                + String.format(java.util.Locale.ROOT, "%.2f", multiplier) + "x. No additional quote-age scaling is applied. "
                + "Model horizon is " + horizon + " calendar days from its observed anchor " + modelAnchor
                + ", not from today. Target: " + target + ". Stored GDELT UTC day: " + yesterday
                + "; articles " + counts.get(yesterday) + "; tone " + tones.get(yesterday) + ".";
        Interval interval = new Interval(METHOD, null, null, 0,
                "Experimental adjustment of original quantile artifacts; conditional news coverage not evaluated.", null, null, null, limits);
        List<History> history = prices.entrySet().stream().skip(Math.max(0, prices.size() - 20))
                .map(e -> new History(e.getKey(), e.getValue())).toList();
        Map<String, LocalDate> sourceDates = new TreeMap<>();
        sourceDates.put("gdelt", yesterday);
        model.path("source_dates").properties().forEach(entry -> sourceDates.put(entry.getKey(), LocalDate.parse(entry.getValue().asText())));
        sourceDates.put("mgo", modelAnchor);
        List<Driver> drivers = new ArrayList<>();
        for (var driver : model.path("top_drivers"))
            drivers.add(new Driver(driver.path("feature").asText(), new BigDecimal(driver.path("contribution").asText())));
        Value value = new Value(horizon, target, origin, modelAnchor, modelAnchor, anchor, (int) ChronoUnit.DAYS.between(modelAnchor, origin),
                central, low, high, rawLow, rawHigh, "USD/metric tonne", "unevaluated", null, 0,
                drivers, interval, yesterday.atStartOfDay(ZoneOffset.UTC).toInstant(),
                yesterday.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant(), sourceDates, history);
        // Stable across horizons/requests, changes when the underlying database evidence changes.
        String identity = VERSION + ":" + origin + ":" + observations + ":" + model.path("input_snapshot").asText() + ":" + model.path("inference_snapshot").asText();
        UUID run = UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8));
        return new Ready("ready", value, run, clock.instant(), modelVersion);
    }
    private static double rank(List<Double> history, double value) {
        return history.stream().filter(x -> x < value).count() / (double) history.size();
    }
    private static BigDecimal price(BigDecimal anchor, double change) {
        double result = anchor.doubleValue() * Math.exp(change);
        if (!Double.isFinite(result) || result <= 0) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Experimental range could not be computed.");
        return BigDecimal.valueOf(result);
    }
    private static Unavailable unavailable(String reason, String message) { return new Unavailable("unavailable", reason, message, null); }
}
