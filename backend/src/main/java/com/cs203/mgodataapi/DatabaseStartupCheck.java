package com.cs203.mgodataapi;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Reports at startup whether the configured database is reachable, and which tables it has. */
@Component
@ConditionalOnProperty(name = "mgo.db.check-on-startup", havingValue = "true", matchIfMissing = true)
public class DatabaseStartupCheck implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DatabaseStartupCheck.class);

    private final JdbcTemplate jdbc;

    public DatabaseStartupCheck(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(org.springframework.boot.ApplicationArguments args) {
        try {
            String database = jdbc.queryForObject("select current_database()", String.class);
            List<String> tables = jdbc.queryForList(
                    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
                    String.class);
            log.info("Connected to database '{}'. Tables in public schema: {}", database,
                    tables.isEmpty() ? "none" : String.join(", ", tables));
        } catch (Exception e) {
            // Logged rather than thrown: the market-data endpoints work without the database.
            // The root cause carries the useful detail (bad password, unreachable host, ...).
            Throwable cause = e;
            while (cause.getCause() != null) {
                cause = cause.getCause();
            }
            log.error("Could not reach the database. Check SUPABASE_DB_URL/USER/PASSWORD. Cause: {}: {}",
                    cause.getClass().getSimpleName(), cause.getMessage());
            log.error("If the host resolves only to an IPv6 address and your network is IPv4-only, "
                    + "use Supabase's Session pooler connection string instead of the direct one.");
        }
    }
}
