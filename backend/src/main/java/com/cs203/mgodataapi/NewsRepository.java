package com.cs203.mgodataapi;

import java.time.Instant;
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

    /** Display-only curated selections are excluded from complete-window analytics. */
    public List<String> latestHeadlineWindows(int windows) {
        return jdbc.query("""
                SELECT CAST(payload AS text) AS payload
                FROM public.news_daily_features
                WHERE payload->>'status' IN ('complete', 'curated')
                ORDER BY (payload->>'end')::timestamptz DESC, (payload->>'retrieved_at')::timestamptz DESC
                LIMIT ?
                """, (row, index) -> row.getString("payload"), windows);
    }

    public record WindowCount(Instant start, Instant end, int articleCount) {}

    /** Article counts of recent complete 24-hour windows, newest first, without loading their headlines. */
    public List<WindowCount> recentWindowCounts(int windows) {
        return jdbc.query("""
                SELECT payload->>'start' AS window_start, payload->>'end' AS window_end,
                       (payload->>'article_count')::int AS article_count
                FROM public.news_daily_features
                WHERE payload->>'status' = 'complete' AND payload->>'article_count' IS NOT NULL
                ORDER BY (payload->>'end')::timestamptz DESC, (payload->>'retrieved_at')::timestamptz DESC
                LIMIT ?
                """, (row, index) -> new WindowCount(Instant.parse(row.getString("window_start")),
                        Instant.parse(row.getString("window_end")), row.getInt("article_count")), windows);
    }
}
