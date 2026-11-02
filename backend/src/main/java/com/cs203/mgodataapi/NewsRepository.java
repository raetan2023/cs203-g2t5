package com.cs203.mgodataapi;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Classified GDELT headline windows written by the daily news pipeline (ridge-regression-model/news). */
@Repository
public class NewsRepository {
    private final JdbcTemplate jdbc;
    public NewsRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** Payloads of the most recent complete 24-hour windows, newest window first. */
    public List<String> latestCompleteWindows(int windows) {
        return jdbc.query("""
                SELECT CAST(payload AS text) AS payload
                FROM public.news_daily_features
                WHERE payload->>'status' = 'complete'
                ORDER BY (payload->>'end')::timestamptz DESC, (payload->>'retrieved_at')::timestamptz DESC
                LIMIT ?
                """, (row, index) -> row.getString("payload"), windows);
    }
}
