package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Executes production SQL against the UUID table shape in H2 PostgreSQL mode. */
class MarketDataStoreTests {
    private JdbcTemplate jdbc;
    private MarketDataStore store;

    @BeforeEach void database() {
        var db = new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;NON_KEYWORDS=VALUE;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(db);
        jdbc.execute("CREATE TABLE market_series (series_id UUID PRIMARY KEY, series_key TEXT UNIQUE, source_name TEXT, unit TEXT)");
        jdbc.execute("CREATE TABLE market_observations (observation_id UUID PRIMARY KEY, series_id UUID REFERENCES market_series, observation_date DATE, value NUMERIC(20,8), value_type TEXT, UNIQUE(series_id, observation_date))");
        store = new MarketDataStore(new NamedParameterJdbcTemplate(db), "BRENT_CRUDE");
    }

    private UUID series(String key, String unit) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO market_series VALUES (?, ?, ?, ?)", id, key, "test provider", unit);
        return id;
    }

    private void observation(UUID id, String date, String value, String type) {
        jdbc.update("INSERT INTO market_observations VALUES (?, ?, ?, ?, ?)", UUID.randomUUID(), id,
                java.sql.Date.valueOf(date), new BigDecimal(value), type);
    }

    @Test void newestWindowAndInclusiveDatesComeFromDatabaseWithoutCaching() {
        var id = series("BRENT_CRUDE", "USD/barrel");
        observation(id, "2026-10-12", "120", "OBSERVED");
        observation(id, "2026-10-13", "125.78", "OBSERVED");
        observation(id, "2026-10-14", "126.55", "OBSERVED");
        observation(id, "2026-10-15", "999", "FORECAST");
        var rows = store.rows("brent", null, null, null, 2);
        assertEquals(List.of("2026-10-13", "2026-10-14"), rows.stream().map(r -> r.get("date")).toList());
        assertEquals("brent", rows.getFirst().get("series"));
        assertEquals("test provider", rows.getFirst().get("source"));
        assertEquals("USD/barrel", rows.getFirst().get("unit"));
        var bounded = store.rows("brent", LocalDate.parse("2026-10-12"), LocalDate.parse("2026-10-13"), "brent", 10);
        assertEquals(2, bounded.size());
        assertEquals("2026-10-13", bounded.getLast().get("date"));
        assertTrue(store.rows("brent", null, null, "' OR 1=1 --", 10).isEmpty());
        assertEquals(3L, store.availability("brent").get("records"));
        assertEquals("2026-10-12", store.availability("brent").get("start"));
        assertEquals("2026-10-14", store.availability("brent").get("end"));
        observation(id, "2026-10-16", "130", "OBSERVED");
        assertEquals("2026-10-16", store.rows("brent", null, null, null, 1).getFirst().get("date"));
        assertEquals(4L, store.availability("brent").get("records"));
    }

    @Test void mapsAllSimpleSourcesAndHonorsConfiguredBrentKey() {
        Map<String, String> keys = Map.of("mgo_singapore", "SGP_MGO_OBSERVED",
                "gasoil_singapore", "SGP_GASOIL_FUT", "dubai_crude", "DUBAI_CRUDE", "usd_index", "USD_INDEX");
        keys.forEach((source, key) -> {
            observation(series(key, "source-defined"), "2026-10-16", "171.08", "OBSERVED");
            var row = store.rows(source, null, null, null, 1).getFirst();
            assertEquals(source, row.get("series"));
            assertEquals("source-defined", row.get("unit"));
            assertEquals(0, new BigDecimal("171.08").compareTo((BigDecimal) row.get("value")));
            assertEquals(1L, store.availability(source).get("records"));
        });
        observation(series("CUSTOM_BRENT", "USD/barrel"), "2026-10-14", "126.55", "OBSERVED");
        var configured = new MarketDataStore(new NamedParameterJdbcTemplate(jdbc), "CUSTOM_BRENT");
        assertEquals(1, configured.rows("brent", null, null, "brent", 2).size());
    }

    @Test void bunkerSeriesKeepNamesAndSelectNewestRowsDeterministically() {
        observation(series("MPA_BUNKER_SALES_MARINE_DIESEL_OIL", "thousand tonnes"), "2026-08-01", "10", "OBSERVED");
        observation(series("MPA_BUNKER_SALES_MGO", "thousand tonnes"), "2026-08-01", "20", "OBSERVED");
        observation(series("MPAXBUNKER_SALES_UNRELATED", "index"), "2026-08-01", "99", "OBSERVED");
        var rows = store.rows("bunker_sales", null, null, null, 2);
        assertEquals(List.of("bunker_sales_marine_diesel_oil", "bunker_sales_mgo"),
                rows.stream().map(r -> r.get("series")).toList());
        assertEquals("bunker_sales_mgo", store.rows("bunker_sales", null, null, null, 1).getFirst().get("series"));
        assertEquals(1, store.rows("bunker_sales", null, null, "bunker_sales_marine_diesel_oil", 10).size());
        assertEquals(2L, store.availability("bunker_sales").get("records"));
    }

    @Test void gdeltCountsStaySeparateFromToneAndMissingToneIsNull() {
        var count = series("GDELT_ARTICLE_COUNT", "articles");
        var tone = series("GDELT_AVERAGE_TONE", "tone");
        observation(count, "2026-10-15", "100", "OBSERVED");
        observation(count, "2026-10-16", "200", "OBSERVED");
        observation(tone, "2026-10-15", "-2.5", "OBSERVED");
        observation(tone, "2026-10-16", "5", "FORECAST");
        var rows = store.rows("gdelt", null, null, "gdelt_article_count", 10);
        assertEquals(2, rows.size());
        assertEquals(0, new BigDecimal("-2.5").compareTo((BigDecimal) ((Map<?, ?>) rows.getFirst().get("metadata")).get("average_tone")));
        assertNull(((Map<?, ?>) rows.getLast().get("metadata")).get("average_tone"));
        assertEquals(2L, store.availability("gdelt").get("records"));
    }

    @Test void missingDataIsEmptyButOutageIs503WithoutPrivateDetails() {
        var empty = store.availability("brent");
        assertEquals(false, empty.get("available"));
        assertEquals(0L, empty.get("records"));
        assertNull(empty.get("start"));
        assertNull(empty.get("end"));
        assertTrue(store.rows("brent", null, null, null, 10).isEmpty());
        assertEquals(404, assertThrows(ApiException.class, () -> store.availability("unknown")).status().value());
        jdbc.execute("DROP TABLE market_observations");
        for (Runnable query : List.<Runnable>of(() -> store.availability("brent"),
                () -> store.rows("brent", null, null, null, 10))) {
            var error = assertThrows(ApiException.class, query::run);
            assertEquals(503, error.status().value());
            assertFalse(error.getMessage().contains("SELECT"));
        }
    }
}
