package com.cs203.mgodataapi;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Immutable publication snapshots; the active run and requested value are read atomically. */
@Repository
public class ForecastRepository {
    public record Snapshot(UUID id, LocalDate origin, String modelVersion, Instant publishedAt,
                           String runPayload, String valuePayload) {}
    public record RunSummary(UUID run_id, LocalDate origin_date, Instant published_at, String model_version) {}
    private final JdbcTemplate jdbc;
    public ForecastRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<Snapshot> active(int horizon) {
        return jdbc.query("""
                SELECT r.id, r.origin_date, r.model_version, r.published_at,
                       CAST(r.payload AS text) AS run_payload, CAST(v.payload AS text) AS value_payload
                FROM public.forecast_active a JOIN public.forecast_runs r ON r.id = a.run_id
                LEFT JOIN public.forecast_values v ON v.run_id = r.id AND v.horizon_days = ?
                WHERE a.singleton = true
                """, (rs, n) -> new Snapshot(rs.getObject("id", UUID.class),
                rs.getObject("origin_date", LocalDate.class), rs.getString("model_version"),
                rs.getTimestamp("published_at").toInstant(), rs.getString("run_payload"),
                rs.getString("value_payload")), horizon);
    }

    public RunSummary lastSuccessful() {
        return jdbc.query("""
                SELECT r.id, r.origin_date, r.published_at, r.model_version
                FROM public.forecast_runs r
                WHERE (SELECT count(*) FROM public.forecast_values v
                       WHERE v.run_id = r.id AND v.payload->>'status' = 'ready') = 3
                ORDER BY r.origin_date DESC, r.published_at DESC LIMIT 1
                """, (rs, n) -> new RunSummary(rs.getObject("id", UUID.class),
                rs.getObject("origin_date", LocalDate.class), rs.getTimestamp("published_at").toInstant(),
                rs.getString("model_version"))).stream().findFirst().orElse(null);
    }
}
