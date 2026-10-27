package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** One database snapshot for experimental purchase ranges, independent of dashboard forecasts. */
@Repository
public class PurchaseForecastRepository {
    public record Observation(String series, String source, String unit, String currency,
                              LocalDate date, BigDecimal value) {}
    public record ModelObservation(String series, String source, String source_url, String unit,
                                   String currency, LocalDate date, BigDecimal value) {}
    public List<ModelObservation> modelObservations(LocalDate asOf) {
        return jdbc.query("""
            SELECT s.series_key, s.source_name, s.source_url, s.unit, s.currency_code, o.observation_date, o.value
            FROM public.market_observations o JOIN public.market_series s USING (series_id)
            WHERE s.series_key IN ('SGP_MGO_OBSERVED','SGP_GASOIL_FUT','BRENT_CRUDE','DUBAI_CRUDE','USD_INDEX')
              AND o.value_type = 'OBSERVED' AND o.observation_date <= ?
            ORDER BY s.series_key, o.observation_date
            """, (row, n) -> new ModelObservation(row.getString("series_key"), row.getString("source_name"),
                row.getString("source_url"), row.getString("unit"), row.getString("currency_code"),
                row.getObject("observation_date", LocalDate.class), row.getBigDecimal("value")), asOf);
    }
    private final JdbcTemplate jdbc;
    public PurchaseForecastRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public List<Observation> observations(LocalDate origin) {
        return jdbc.query("""
            SELECT s.series_key, s.source_name, s.unit, s.currency_code, o.observation_date, o.value
            FROM public.market_observations o
            JOIN public.market_series s ON s.series_id = o.series_id
            WHERE s.series_key IN ('SGP_MGO_OBSERVED', 'GDELT_ARTICLE_COUNT', 'GDELT_AVERAGE_TONE')
              AND o.value_type = 'OBSERVED' AND o.observation_date <= ? AND (s.series_key = 'SGP_MGO_OBSERVED' OR o.observation_date < ?) AND o.observation_date >= ?
            ORDER BY s.series_key, o.observation_date
            """, (r, n) -> new Observation(r.getString("series_key"), r.getString("source_name"),
                    r.getString("unit"), r.getString("currency_code"), r.getObject("observation_date", LocalDate.class),
                    r.getBigDecimal("value")), origin, origin, origin.minusDays(400));
    }
}
