package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Home's market alerts, from stored data only: a news spike when the latest GDELT keyword-filtered window
 * holds far more headlines than recent windows, and a price alert when Singapore MGO's latest daily move is
 * well outside its recent range. Never calls GDELT or a price provider, and never fills gaps with defaults.
 */
@Service
public class NewsAlertService {
    static final String PRICE_SERIES = "SGP_MGO_OBSERVED";
    /** Enough recent windows for two weeks of daily runs, plus a few retries or backfills. */
    static final int WINDOWS = 30;
    static final int BASELINE_WINDOWS = 14;
    static final int MIN_BASELINE_WINDOWS = 5;
    /** A spike needs both: half again the usual volume, and enough extra headlines that it is not noise. */
    static final double SPIKE_RATIO = 1.5;
    static final int SPIKE_MIN_EXTRA = 10;
    static final int RETURNS = 20;
    static final int MIN_RETURNS = 10;
    /** A daily move this many standard deviations from recent moves is flagged. */
    static final double MOVE_SIGMAS = 2.0;
    /** A flagged move must also be at least this large, so a tiny move after a run of flat prices is not one. */
    static final double MIN_MOVE_PCT = 1.0;
    static final int TOP_TOPICS = 3;
    /** Daily runs start at slightly different times, so consecutive rolling windows overlap by minutes. */
    private static final Duration OVERLAP_TOLERANCE = Duration.ofHours(1);

    public enum State { ALERT, NORMAL, INSUFFICIENT_DATA }
    public record TopicCount(String topic, int count) {}
    public record NewsSpike(State state, int articleCount, Integer baselineCount, int baselineWindows,
                            Instant windowStart, Instant windowEnd, List<TopicCount> topTopics, String query) {}
    public record PriceMove(State state, String seriesKey, LocalDate observedDate, BigDecimal value,
                            BigDecimal changePct, BigDecimal typicalChangePct, int returns) {}
    /** Each signal is null when nothing is stored for it yet. */
    public record Response(NewsSpike news, PriceMove price, String storage) {}

    private final NewsRepository news;
    private final BrentMarketRepository market;
    private final JsonMapper mapper;

    public NewsAlertService(NewsRepository news, BrentMarketRepository market, JsonMapper mapper) {
        this.news = news;
        this.market = market;
        this.mapper = mapper;
    }

    public Response alerts() {
        try {
            return new Response(newsSpike(), priceMove(market.latestObserved(PRICE_SERIES)), "supabase");
        } catch (DataAccessException failure) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Stored alerts are unavailable. Check the backend database connection.");
        }
    }

    private NewsSpike newsSpike() {
        List<NewsRepository.WindowCount> windows = distinctWindows(news.recentWindowCounts(WINDOWS));
        if (windows.isEmpty()) return null;
        NewsRepository.WindowCount latest = windows.getFirst();
        List<NewsRepository.WindowCount> baseline = windows.subList(1, Math.min(windows.size(), BASELINE_WINDOWS + 1));
        Integer usual = baseline.size() < MIN_BASELINE_WINDOWS ? null
                : (int) Math.round(median(baseline.stream().map(w -> (double) w.articleCount()).toList()));
        State state = usual == null ? State.INSUFFICIENT_DATA
                : latest.articleCount() >= usual * SPIKE_RATIO && latest.articleCount() - usual >= SPIKE_MIN_EXTRA
                    ? State.ALERT : State.NORMAL;
        Window details = latestWindowDetails(latest);
        return new NewsSpike(state, latest.articleCount(), usual, baseline.size(),
                latest.start(), latest.end(), details.topics(), details.query());
    }

    /** Keeps the newest copy of each window and drops windows overlapping a newer one, so no day counts twice. */
    static List<NewsRepository.WindowCount> distinctWindows(List<NewsRepository.WindowCount> windows) {
        List<NewsRepository.WindowCount> kept = new ArrayList<>();
        for (var window : windows) {
            if (kept.isEmpty() || !window.end().isAfter(kept.getLast().start().plus(OVERLAP_TOLERANCE))) kept.add(window);
        }
        return kept;
    }

    private record Window(List<TopicCount> topics, String query) {}

    /** Most common classified topics in the latest window, ignoring "other" and unclassified headlines. */
    private Window latestWindowDetails(NewsRepository.WindowCount latest) {
        for (String payload : news.latestCompleteWindows(1)) {
            JsonNode window;
            try {
                window = mapper.readTree(payload);
            } catch (RuntimeException malformed) {
                break;
            }
            if (!latest.end().equals(instant(window.path("end")))) break;
            Map<String, Integer> counts = new LinkedHashMap<>();
            for (JsonNode record : window.path("records")) {
                JsonNode label = record.path("classification");
                String topic = label.path("category").asText("");
                if (label.path("valid").asBoolean(false) && !topic.isEmpty() && !topic.equals("other")) counts.merge(topic, 1, Integer::sum);
            }
            List<TopicCount> topics = counts.entrySet().stream()
                    .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                    .limit(TOP_TOPICS).map(e -> new TopicCount(e.getKey(), e.getValue())).toList();
            String query = window.path("query").asText("");
            return new Window(topics, query.isEmpty() ? null : query);
        }
        return new Window(List.of(), null);
    }

    static PriceMove priceMove(List<BrentMarketRepository.Observation> newestFirst) {
        List<BrentMarketRepository.Observation> rows = newestFirst.stream()
                .filter(row -> row.value() != null && row.value().signum() > 0)
                .sorted(Comparator.comparing(BrentMarketRepository.Observation::date).reversed()).toList();
        if (rows.isEmpty()) return null;
        var latest = rows.getFirst();
        List<Double> returns = new ArrayList<>();
        // The latest move, then up to RETURNS earlier moves to compare it with.
        for (int i = 0; i + 1 < rows.size() && returns.size() < RETURNS + 1; i++)
            returns.add(rows.get(i).value().doubleValue() / rows.get(i + 1).value().doubleValue() - 1);
        if (returns.isEmpty())
            return new PriceMove(State.INSUFFICIENT_DATA, PRICE_SERIES, latest.date(), latest.value(), null, null, 0);
        double move = returns.getFirst();
        List<Double> history = returns.subList(1, returns.size());
        if (history.size() < MIN_RETURNS)
            return new PriceMove(State.INSUFFICIENT_DATA, PRICE_SERIES, latest.date(), latest.value(), percent(move), null, history.size());
        double typical = standardDeviation(history);
        State state = Math.abs(move) >= MOVE_SIGMAS * typical && Math.abs(move) * 100 >= MIN_MOVE_PCT ? State.ALERT : State.NORMAL;
        return new PriceMove(state, PRICE_SERIES, latest.date(), latest.value(), percent(move), percent(typical), history.size());
    }

    private static Instant instant(JsonNode node) {
        try {
            return Instant.parse(node.asText(""));
        } catch (RuntimeException invalid) {
            return null;
        }
    }

    private static BigDecimal percent(double fraction) {
        return BigDecimal.valueOf(fraction * 100).setScale(2, RoundingMode.HALF_UP);
    }

    static double median(List<Double> values) {
        List<Double> sorted = values.stream().sorted().toList();
        int middle = sorted.size() / 2;
        return sorted.size() % 2 == 1 ? sorted.get(middle) : (sorted.get(middle - 1) + sorted.get(middle)) / 2;
    }

    /** Sample standard deviation. */
    static double standardDeviation(List<Double> values) {
        double mean = values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        double squares = values.stream().mapToDouble(v -> (v - mean) * (v - mean)).sum();
        return Math.sqrt(squares / (values.size() - 1));
    }
}
