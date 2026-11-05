package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.oauth2.jwt.Jwt;

class ManagerOverviewTests {
    final LocalDate today = LocalDate.parse("2026-11-04");
    Jwt manager(String org) {
        return Jwt.withTokenValue("test").header("alg", "none").subject("manager")
                .claim("o", Map.of("id", org, "rol", "manager")).build();
    }
    @Test void scopedTotalsIncludeAllOwnersButExcludeOtherTeamsAndFinishedExposure() {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1;NON_KEYWORDS=VALUE", "sa", ""));
        jdbc.execute("CREATE TABLE purchase_plans (plan_id UUID, user_id UUID, quantity_mt NUMERIC(20,3), purchase_deadline DATE, scenario_as_of_date DATE, status TEXT, submitted_at TIMESTAMP, previous_plan_id UUID, clerk_org_id TEXT)");
        jdbc.execute("CREATE TABLE market_series (series_id INT, series_key TEXT, currency_code TEXT, unit TEXT)");
        jdbc.execute("CREATE TABLE market_observations (series_id INT, observation_date DATE, value NUMERIC(20,3), value_type TEXT)");
        jdbc.update("INSERT INTO market_series VALUES (1, 'SGP_MGO_OBSERVED', 'USD', 'USD/MT'), (2, 'SGP_MGO_OBSERVED', 'SGD', 'USD/MT')");
        jdbc.update("INSERT INTO market_observations VALUES (1, '2026-11-02', 600, 'OBSERVED'), (1, '2026-11-05', 900, 'OBSERVED'), (2, '2026-11-04', 999, 'OBSERVED'), (1, '2026-11-03', 800, 'ESTIMATED')");
        for (String status : new String[]{"draft", "submitted", "approved", "rejected", "withdrawn", "purchased"})
            jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, 10.25, ?, ?, ?, NULL, NULL, 'org_a')", UUID.randomUUID(), UUID.randomUUID(), today, today, status);
        jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, 1000, ?, ?, 'submitted', NULL, NULL, 'org_b')", UUID.randomUUID(), UUID.randomUUID(), today, today);
        jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, 1000, ?, ?, 'submitted', NULL, NULL, NULL)", UUID.randomUUID(), UUID.randomUUID(), today, today);
        var dates = mock(OperationalDate.class); when(dates.today()).thenReturn(today);
        var controller = new ManagerOverviewController(new PurchasePlanRepository(jdbc), jdbc, dates);
        var result = controller.get(manager("org_a")).getBody();
        assertEquals(6, result.plan_count());
        assertEquals(0, new BigDecimal("61.50").compareTo(result.total_quantity_mt()));
        assertEquals(0, new BigDecimal("30.75").compareTo(result.open_quantity_mt()));
        assertEquals(1, result.pending_approval_count());
        assertEquals(0, new BigDecimal("18450").compareTo(result.exposure_usd()));
        assertEquals(LocalDate.parse("2026-11-02"), result.reference_date());
        assertEquals(0, controller.get(manager("org_empty")).getBody().plan_count());
        jdbc.update("DELETE FROM market_observations");
        var missing = controller.get(manager("org_a")).getBody();
        assertNull(missing.exposure_usd()); assertNull(missing.reference_date());
        assertEquals(6, missing.plan_count());
    }
}
