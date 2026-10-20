package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Reads the UUID Supabase schema directly, independent of legacy scenario entities. */
@Repository
public class BrentMarketRepository {
    private final JdbcTemplate jdbc;
    private final String seriesKey;

    public record Observation(String seriesKey, String source, String unit, String currency,
                              LocalDate date, BigDecimal value) {}

    public BrentMarketRepository(JdbcTemplate jdbc,
            @Value("${mgo.brent.series-key:BRENT_CRUDE}") String seriesKey) {
        this.jdbc = jdbc;
        this.seriesKey = seriesKey;
    }

    public List<Observation> latest() {
        return jdbc.query("""
                SELECT s.series_key, s.source_name, s.unit, s.currency_code,
                       o.observation_date, o.value
                FROM public.market_observations o
                JOIN public.market_series s ON s.series_id = o.series_id
                WHERE s.series_key = ? AND o.value_type = 'OBSERVED'
                ORDER BY o.observation_date DESC
                LIMIT 60
                """, (row, index) -> new Observation(row.getString("series_key"),
                        row.getString("source_name"), row.getString("unit"),
                        row.getString("currency_code"), row.getDate("observation_date").toLocalDate(),
                        row.getBigDecimal("value")), seriesKey);
    }
}
