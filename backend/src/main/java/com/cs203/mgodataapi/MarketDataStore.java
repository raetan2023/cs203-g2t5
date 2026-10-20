package com.cs203.mgodataapi;

import java.sql.Date;
import java.sql.Types;
import java.time.LocalDate;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** Reads imported observations from the UUID Supabase schema on each request. */
@Repository
public class MarketDataStore {
    private static final Map<String, String> SERIES_KEYS = Map.of(
            "mgo_singapore", "SGP_MGO_OBSERVED", "gasoil_singapore", "SGP_GASOIL_FUT",
            "dubai_crude", "DUBAI_CRUDE", "usd_index", "USD_INDEX", "gdelt", "GDELT_ARTICLE_COUNT");
    private static final String BUNKER_PREFIX = "MPA_BUNKER_SALES_";
    private final NamedParameterJdbcTemplate jdbc;
    private final String brentKey;

    public MarketDataStore(NamedParameterJdbcTemplate jdbc,
            @Value("${mgo.brent.series-key:BRENT_CRUDE}") String brentKey) {
        this.jdbc = jdbc;
        this.brentKey = brentKey;
    }

    // SQL fragments are selected internally; user values are always bound parameters.
    private String predicate(String sourceId) {
        return sourceId.equals("bunker_sales")
                ? "substring(s.series_key, 1, 17) = :seriesKey" : "s.series_key = :seriesKey";
    }

    private MapSqlParameterSource parameters(String sourceId) {
        if (!Source.ALL.containsKey(sourceId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Unknown source. See /api/v1/sources.");
        }
        String key = sourceId.equals("brent") ? brentKey
                : sourceId.equals("bunker_sales") ? BUNKER_PREFIX : SERIES_KEYS.get(sourceId);
        String publicSeries = sourceId.equals("gdelt") ? "gdelt_article_count" : sourceId;
        return new MapSqlParameterSource("seriesKey", key).addValue("publicSeries", publicSeries);
    }

    public Map<String, Object> availability(String sourceId) {
        var params = parameters(sourceId);
        return read(() -> jdbc.queryForObject("""
                SELECT COUNT(*) AS records, MIN(o.observation_date) AS first_date,
                       MAX(o.observation_date) AS last_date
                FROM public.market_observations o
                JOIN public.market_series s ON s.series_id = o.series_id
                WHERE o.value_type = 'OBSERVED' AND %s
                """.formatted(predicate(sourceId)), params, (row, index) -> {
            Map<String, Object> result = new LinkedHashMap<>();
            long count = row.getLong("records");
            result.put("available", count > 0);
            result.put("records", count);
            result.put("start", row.getString("first_date"));
            result.put("end", row.getString("last_date"));
            return result;
        }));
    }

    public List<Map<String, Object>> rows(String sourceId, LocalDate start, LocalDate end,
                                          String series, int limit) {
        var params = parameters(sourceId)
                .addValue("start", start == null ? null : Date.valueOf(start), Types.DATE)
                .addValue("end", end == null ? null : Date.valueOf(end), Types.DATE)
                .addValue("series", series, Types.VARCHAR).addValue("limit", limit);
        String seriesExpression = sourceId.equals("bunker_sales")
                ? "lower(substring(s.series_key, 5))" : ":publicSeries";
        return read(() -> {
            List<Map<String, Object>> rows = jdbc.query("""
                    SELECT o.observation_date, o.value, s.source_name, s.unit,
                           %s AS public_series, tone.value AS average_tone
                    FROM public.market_observations o
                    JOIN public.market_series s ON s.series_id = o.series_id
                    LEFT JOIN public.market_series ts ON ts.series_key = 'GDELT_AVERAGE_TONE'
                        AND s.series_key = 'GDELT_ARTICLE_COUNT'
                    LEFT JOIN public.market_observations tone ON tone.series_id = ts.series_id
                        AND tone.observation_date = o.observation_date AND tone.value_type = 'OBSERVED'
                    WHERE o.value_type = 'OBSERVED' AND %s
                      AND (:start IS NULL OR o.observation_date >= :start)
                      AND (:end IS NULL OR o.observation_date <= :end)
                      AND (:series IS NULL OR %s = :series)
                    ORDER BY o.observation_date DESC, public_series DESC
                    LIMIT :limit
                    """.formatted(seriesExpression, predicate(sourceId), seriesExpression), params, (row, index) -> {
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("date", row.getString("observation_date"));
                result.put("value", row.getBigDecimal("value"));
                result.put("series", row.getString("public_series"));
                result.put("source", row.getString("source_name"));
                result.put("unit", row.getString("unit"));
                if (sourceId.equals("gdelt")) {
                    Map<String, Object> metadata = new LinkedHashMap<>();
                    metadata.put("average_tone", row.getBigDecimal("average_tone"));
                    result.put("metadata", metadata);
                }
                return result;
            });
            // Select the newest bounded window in SQL, then return chronological rows.
            Collections.reverse(rows);
            return rows;
        });
    }

    private static <T> T read(Supplier<T> query) {
        try {
            return query.get();
        } catch (DataAccessException failure) {
            var unavailable = new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Stored market data is unavailable. Check the backend database connection.");
            unavailable.initCause(failure);
            throw unavailable;
        }
    }
}
