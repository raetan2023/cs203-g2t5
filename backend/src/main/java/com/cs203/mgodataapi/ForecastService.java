package com.cs203.mgodataapi;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Reads published forecasts only. Missing/stale input never becomes a synthetic forecast. */
@Service
public class ForecastService {
    private static final ZoneId SINGAPORE = ZoneId.of("Asia/Singapore");
    public sealed interface Response permits Ready, Unavailable {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Ready(String status, @JsonUnwrapped Value data, UUID run_id, Instant published_at,
                        String model_version) implements Response {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Unavailable(String status, String reason, String message,
                              ForecastRepository.RunSummary last_successful_run) implements Response {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Driver(String feature, BigDecimal contribution) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record History(LocalDate date, BigDecimal price) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Interval(String method, BigDecimal nominal_coverage, BigDecimal empirical_coverage,
            Integer evaluation_rows, String evaluation_scope, BigDecimal baseline_coverage,
            BigDecimal baseline_mean_width, BigDecimal mean_width, String limitations) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Value(Integer horizon_days, LocalDate target_date, LocalDate as_of_date,
            LocalDate forecast_origin_date, LocalDate anchor_quote_date, BigDecimal anchor_price,
            Integer quote_age_days, BigDecimal forecast, BigDecimal low, BigDecimal high,
            BigDecimal raw_q10_price, BigDecimal raw_q90_price, String unit, String evidence,
            BigDecimal mae_skill_vs_persistence, Integer backtest_rows, List<Driver> top_drivers,
            Interval interval, Instant news_window_start, Instant news_window_end,
            Map<String, LocalDate> source_dates, List<History> history) {}
    private final ForecastRepository repository;
    private final Clock clock;
    private final JsonMapper mapper;
    public ForecastService(ForecastRepository repository, Clock clock, JsonMapper mapper) {
        this.repository = repository; this.clock = clock; this.mapper = mapper;
    }

    public LocalDate today() { return LocalDate.now(clock.withZone(SINGAPORE)); }

    public Response read(int horizon) {
        if (!Set.of(7, 14, 30).contains(horizon))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "horizon_days must be 7, 14 or 30.");
        try {
            var snapshots = repository.active(horizon);
            if (snapshots.isEmpty()) return unavailable("missing_run", "No forecast has been published.");
            var snapshot = snapshots.getFirst();
            if (!snapshot.origin().equals(today()))
                return unavailable("stale_run", "Today's forecast is not available; the previous run is stale.");
            if (snapshot.valuePayload() == null)
                return unavailable("missing_horizon", "The active forecast run has no value for this horizon.");
            ObjectNode node = (ObjectNode) mapper.readTree(snapshot.runPayload());
            JsonNode value = mapper.readTree(snapshot.valuePayload());
            if (!value.isObject()) throw new IllegalArgumentException("Invalid forecast payload");
            value.properties().forEach(entry -> node.set(entry.getKey(), entry.getValue()));
            if (!"ready".equals(node.path("status").asText()))
                return unavailable(node.path("reason").asText("forecast_unavailable"),
                        node.path("message").asText("The daily forecast could not be produced."));
            Value data = mapper.treeToValue(node, Value.class);
            String invalid = invalidReason(data, horizon, snapshot);
            if (invalid != null) return unavailable(invalid, "The published forecast does not meet current data availability requirements.");
            return new Ready("ready", data, snapshot.id(), snapshot.publishedAt(), snapshot.modelVersion());
        } catch (DataAccessException failure) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Published forecast storage is unavailable. Please retry.");
        } catch (ApiException failure) {
            throw failure;
        } catch (RuntimeException failure) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "The published forecast is invalid. Please retry after the next completed run.");
        }
    }

    private String invalidReason(Value v, int horizon, ForecastRepository.Snapshot run) {
        LocalDate today = today();
        if (v.horizon_days() == null || v.horizon_days() != horizon
                || !today.equals(v.forecast_origin_date()) || !today.equals(v.as_of_date())
                || v.target_date() == null || !v.target_date().equals(today.plusDays(horizon))
                || !v.target_date().isAfter(today) || run.publishedAt().isAfter(clock.instant().plusSeconds(60))) return "invalid_dates";
        LocalDate utcToday = LocalDate.now(clock.withZone(ZoneOffset.UTC));
        Instant newsStart = utcToday.minusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant newsEnd = utcToday.atStartOfDay(ZoneOffset.UTC).toInstant();
        if (!newsStart.equals(v.news_window_start()) || !newsEnd.equals(v.news_window_end())) return "stale_news";
        if (v.source_dates() == null || !v.source_dates().keySet().containsAll(Set.of("mgo", "gasoil", "brent", "dubai", "usd"))) return "missing_sources";
        for (String source : Set.of("mgo", "gasoil", "brent", "dubai", "usd")) {
            LocalDate date = v.source_dates().get(source);
            if (date == null || date.isAfter(today) || date.isBefore(today.minusDays(7))) return "stale_sources";
        }
        if (v.anchor_quote_date() == null || !v.anchor_quote_date().equals(v.source_dates().get("mgo"))
                || v.quote_age_days() == null || v.quote_age_days() != java.time.temporal.ChronoUnit.DAYS.between(v.anchor_quote_date(), today)) return "invalid_anchor";
        if (!positive(v.anchor_price()) || !nonnegative(v.forecast()) || !nonnegative(v.low()) || !nonnegative(v.high())
                || v.low().compareTo(v.high()) > 0 || !positive(v.raw_q10_price()) || !positive(v.raw_q90_price())
                || v.raw_q10_price().compareTo(v.raw_q90_price()) > 0 || !"USD/metric tonne".equals(v.unit())) return "invalid_bounds";
        Interval i = v.interval();
        if (i == null || !"gdelt_error_quantiles".equals(i.method()) || !probability(i.nominal_coverage())
                || i.nominal_coverage().compareTo(new BigDecimal("0.8")) != 0
                || i.evaluation_rows() == null || i.evaluation_rows() < 40 || blank(i.evaluation_scope()) || blank(i.limitations())
                || !probability(i.empirical_coverage()) || !probability(i.baseline_coverage())
                || !nonnegative(i.mean_width()) || !nonnegative(i.baseline_mean_width())) return "invalid_interval";
        if (v.history() == null || v.top_drivers() == null || v.backtest_rows() == null || v.backtest_rows() < 40
                || !Set.of("weak", "no_edge", "supported").contains(v.evidence() == null ? "" : v.evidence())) return "missing_context";
        for (History point : v.history())
            if (point.date() == null || point.date().isAfter(today) || !positive(point.price())) return "invalid_history";
        for (Driver driver : v.top_drivers())
            if (blank(driver.feature()) || driver.contribution() == null) return "invalid_drivers";
        return null;
    }
    private Unavailable unavailable(String reason, String message) {
        return new Unavailable("unavailable", reason, message, repository.lastSuccessful());
    }
    private static boolean probability(BigDecimal value) { return nonnegative(value) && value.compareTo(BigDecimal.ONE) <= 0; }
    private static boolean positive(BigDecimal value) { return value != null && value.signum() > 0; }
    private static boolean nonnegative(BigDecimal value) { return value != null && value.signum() >= 0; }
    private static boolean blank(String value) { return value == null || value.isBlank(); }
}
