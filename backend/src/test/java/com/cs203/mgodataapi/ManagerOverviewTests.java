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
    @Test void scopedTotalsLeaveOutDraftsRejectedWithdrawnAndOtherTeams() {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1;NON_KEYWORDS=VALUE", "sa", ""));
        jdbc.execute("CREATE TABLE purchase_plans (plan_id UUID, user_id UUID, quantity_mt NUMERIC(20,3), purchase_deadline DATE, scenario_as_of_date DATE, status TEXT, submitted_at TIMESTAMP, previous_plan_id UUID, clerk_org_id TEXT)");
        jdbc.execute("CREATE TABLE users (user_id UUID PRIMARY KEY, clerk_user_id TEXT, email TEXT, display_name TEXT)");
        jdbc.execute("CREATE TABLE market_series (series_id INT, series_key TEXT, currency_code TEXT, unit TEXT)");
        jdbc.execute("CREATE TABLE market_observations (series_id INT, observation_date DATE, value NUMERIC(20,3), value_type TEXT)");
        jdbc.update("INSERT INTO market_series VALUES (1, 'SGP_MGO_OBSERVED', 'USD', 'USD/MT'), (2, 'SGP_MGO_OBSERVED', 'SGD', 'USD/MT')");
        jdbc.update("INSERT INTO market_observations VALUES (1, '2026-11-02', 600, 'OBSERVED'), (1, '2026-11-05', 900, 'OBSERVED'), (2, '2026-11-04', 999, 'OBSERVED'), (1, '2026-11-03', 800, 'ESTIMATED')");
        for (String status : new String[]{"draft", "submitted", "approved", "rejected", "withdrawn", "purchased"})
            jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, 10.25, ?, ?, ?, NULL, NULL, 'org_a')", UUID.randomUUID(), UUID.randomUUID(), today, today, status);
        jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, 1000, ?, ?, 'submitted', NULL, NULL, 'org_b')", UUID.randomUUID(), UUID.randomUUID(), today, today);
        jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, 1000, ?, ?, 'submitted', NULL, NULL, NULL)", UUID.randomUUID(), UUID.randomUUID(), today, today);
        var dates = mock(OperationalDate.class); when(dates.today()).thenReturn(today);
        UUID pm = UUID.randomUUID();
        jdbc.execute("CREATE TABLE pm_assignments (po_user_id UUID, clerk_org_id TEXT, pm_user_id UUID)");
        jdbc.update("INSERT INTO pm_assignments SELECT user_id, clerk_org_id, ? FROM purchase_plans WHERE clerk_org_id = 'org_a'", pm);
        // Same organisation, different manager: must not count towards this team.
        UUID otherOfficer = UUID.randomUUID();
        jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, 1000, ?, ?, 'submitted', NULL, NULL, 'org_a')", UUID.randomUUID(), otherOfficer, today, today);
        jdbc.update("INSERT INTO pm_assignments VALUES (?, 'org_a', ?)", otherOfficer, UUID.randomUUID());
        // Recorded purchases: this team's purchased plan bought 9.5 MT; another team's purchase must not count.
        jdbc.execute("CREATE TABLE purchase_records (plan_id UUID, clerk_org_id TEXT, quantity_mt NUMERIC(20,3), purchased_on DATE)");
        jdbc.update("INSERT INTO purchase_records SELECT plan_id, clerk_org_id, 9.5, ? FROM purchase_plans WHERE clerk_org_id = 'org_a' AND status = 'purchased'", today);
        UUID otherPurchase = UUID.randomUUID();
        jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, 500, ?, ?, 'purchased', NULL, NULL, 'org_a')", otherPurchase, otherOfficer, today, today);
        jdbc.update("INSERT INTO purchase_records VALUES (?, 'org_a', 500, ?)", otherPurchase, today);
        var users = mock(UserAccounts.class);
        when(users.find(any())).thenReturn(java.util.Optional.of(pm));
        var controller = new ManagerOverviewController(new PurchasePlanRepository(jdbc), jdbc, dates, users);
        var result = controller.get(manager("org_a")).getBody();
        // Planned: approved + purchased. Drafts, pending, rejected and withdrawn are left out.
        assertEquals(0, new BigDecimal("20.50").compareTo(result.total_quantity_mt()));
        assertEquals(0, new BigDecimal("9.5").compareTo(result.purchased_quantity_mt()));
        // Remaining to buy (exposure basis): approved and not yet purchased.
        assertEquals(0, new BigDecimal("10.25").compareTo(result.open_quantity_mt()));
        assertEquals(0, new BigDecimal("6150").compareTo(result.exposure_usd()));
        assertEquals(LocalDate.parse("2026-11-02"), result.reference_date());
        var empty = controller.get(manager("org_empty")).getBody();
        assertEquals(0, BigDecimal.ZERO.compareTo(empty.total_quantity_mt()));
        assertEquals(0, BigDecimal.ZERO.compareTo(empty.purchased_quantity_mt()));
        jdbc.update("DELETE FROM market_observations");
        var missing = controller.get(manager("org_a")).getBody();
        assertNull(missing.exposure_usd()); assertNull(missing.reference_date());
        assertEquals(0, new BigDecimal("20.50").compareTo(missing.total_quantity_mt()));
        // The read-only transaction must never create a user record.
        verify(users, never()).resolve(any(), any());
        when(users.find(any())).thenReturn(java.util.Optional.empty());
        var unknown = controller.get(manager("org_a")).getBody();
        assertEquals(0, BigDecimal.ZERO.compareTo(unknown.total_quantity_mt()), "a manager with no record has no team yet");
        assertEquals(0, BigDecimal.ZERO.compareTo(unknown.purchased_quantity_mt()));
    }

    @Test void thirtyDaysCountsOnlyPlansApprovedInTheLastThirtyDays() {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1;NON_KEYWORDS=VALUE", "sa", ""));
        jdbc.execute("CREATE TABLE purchase_plans (plan_id UUID, user_id UUID, quantity_mt NUMERIC(20,3), purchase_deadline DATE, scenario_as_of_date DATE, status TEXT, submitted_at TIMESTAMP WITH TIME ZONE, previous_plan_id UUID, clerk_org_id TEXT)");
        jdbc.execute("CREATE TABLE users (user_id UUID PRIMARY KEY, clerk_user_id TEXT, email TEXT, display_name TEXT)");
        jdbc.execute("CREATE TABLE market_series (series_id INT, series_key TEXT, currency_code TEXT, unit TEXT)");
        jdbc.execute("CREATE TABLE market_observations (series_id INT, observation_date DATE, value NUMERIC(20,3), value_type TEXT)");
        jdbc.execute("CREATE TABLE pm_assignments (po_user_id UUID, clerk_org_id TEXT, pm_user_id UUID)");
        jdbc.execute("CREATE TABLE purchase_records (plan_id UUID, clerk_org_id TEXT, quantity_mt NUMERIC(20,3), purchased_on DATE)");
        jdbc.execute("CREATE TABLE plan_approval_decisions (plan_id UUID, clerk_org_id TEXT, decision TEXT, decided_at TIMESTAMP WITH TIME ZONE)");
        UUID pm = UUID.randomUUID(), officer = UUID.randomUUID();
        jdbc.update("INSERT INTO pm_assignments VALUES (?, 'org_a', ?)", officer, pm);
        // Day 1 of the window starts at midnight Singapore time, 29 days before today.
        var firstDay = today.minusDays(29).atStartOfDay(java.time.ZoneId.of("Asia/Singapore")).toOffsetDateTime();
        Object[][] rows = {   // MT, status, approved at, purchased MT
            {new BigDecimal("10"), "approved", firstDay, null},                       // approved in window, not bought
            {new BigDecimal("20"), "approved", firstDay.minusSeconds(1), null},       // approved just before
            {new BigDecimal("40"), "purchased", firstDay.plusDays(5), new BigDecimal("39")},  // approved in window, bought
            {new BigDecimal("80"), "purchased", firstDay.minusDays(30), new BigDecimal("79")}, // approved long ago, bought recently
            {new BigDecimal("160"), "submitted", null, null},                         // pending: never counted
        };
        for (Object[] row : rows) {
            UUID plan = UUID.randomUUID();
            jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'org_a')", plan, officer, row[0], today, today, row[1], firstDay.minusDays(40));
            if (row[2] != null) jdbc.update("INSERT INTO plan_approval_decisions VALUES (?, 'org_a', 'approved', ?)", plan, row[2]);
            if (row[3] != null) jdbc.update("INSERT INTO purchase_records VALUES (?, 'org_a', ?, ?)", plan, row[3], today.minusDays(1));
        }
        var dates = mock(OperationalDate.class); when(dates.today()).thenReturn(today);
        var users = mock(UserAccounts.class); when(users.find(any())).thenReturn(java.util.Optional.of(pm));
        var controller = new ManagerOverviewController(new PurchasePlanRepository(jdbc), jdbc, dates, users);

        var all = controller.get(manager("org_a"), "all").getBody();
        assertEquals(0, new BigDecimal("150").compareTo(all.total_quantity_mt()));
        assertEquals(0, new BigDecimal("118").compareTo(all.purchased_quantity_mt()));
        assertEquals(0, new BigDecimal("30").compareTo(all.open_quantity_mt()));

        var recent = controller.get(manager("org_a"), "30d").getBody();
        assertEquals(0, new BigDecimal("50").compareTo(recent.total_quantity_mt()), "approved in the window: 10 + 40");
        assertEquals(0, new BigDecimal("39").compareTo(recent.purchased_quantity_mt()), "a recent purchase of an old approval is left out");
        assertEquals(0, new BigDecimal("10").compareTo(recent.open_quantity_mt()), "only the recently approved plan is still to buy");
        assertEquals(422, assertThrows(ApiException.class, () -> controller.get(manager("org_a"), "7d")).status().value());
    }

    @Test void choosingOfficersNarrowsEveryFigureAndListsTheTeam() {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1;NON_KEYWORDS=VALUE", "sa", ""));
        jdbc.execute("CREATE TABLE purchase_plans (plan_id UUID, user_id UUID, quantity_mt NUMERIC(20,3), purchase_deadline DATE, scenario_as_of_date DATE, status TEXT, submitted_at TIMESTAMP WITH TIME ZONE, previous_plan_id UUID, clerk_org_id TEXT)");
        jdbc.execute("CREATE TABLE users (user_id UUID PRIMARY KEY, clerk_user_id TEXT, email TEXT, display_name TEXT)");
        jdbc.execute("CREATE TABLE market_series (series_id INT, series_key TEXT, currency_code TEXT, unit TEXT)");
        jdbc.execute("CREATE TABLE market_observations (series_id INT, observation_date DATE, value NUMERIC(20,3), value_type TEXT)");
        jdbc.execute("CREATE TABLE pm_assignments (po_user_id UUID, clerk_org_id TEXT, pm_user_id UUID)");
        jdbc.execute("CREATE TABLE purchase_records (plan_id UUID, clerk_org_id TEXT, quantity_mt NUMERIC(20,3), purchased_on DATE)");
        UUID pm = UUID.randomUUID(), rae = UUID.randomUUID(), yash = UUID.randomUUID();
        jdbc.update("INSERT INTO users VALUES (?, 'user_rae', 'rae@example.com', 'Rae Tan'), (?, 'user_yash', 'yash@example.com', NULL)", rae, yash);
        jdbc.update("INSERT INTO pm_assignments VALUES (?, 'org_a', ?), (?, 'org_a', ?)", rae, pm, yash, pm);
        UUID raeBought = UUID.randomUUID();
        jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, 100, ?, ?, 'approved', NULL, NULL, 'org_a')", UUID.randomUUID(), rae, today, today);
        jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, 50, ?, ?, 'purchased', NULL, NULL, 'org_a')", raeBought, rae, today, today);
        jdbc.update("INSERT INTO purchase_records VALUES (?, 'org_a', 48, ?)", raeBought, today);
        jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, 7, ?, ?, 'approved', NULL, NULL, 'org_a')", UUID.randomUUID(), yash, today, today);
        jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, 999, ?, ?, 'submitted', NULL, NULL, 'org_a')", UUID.randomUUID(), yash, today, today);
        var dates = mock(OperationalDate.class); when(dates.today()).thenReturn(today);
        var users = mock(UserAccounts.class); when(users.find(any())).thenReturn(java.util.Optional.of(pm));
        var controller = new ManagerOverviewController(new PurchasePlanRepository(jdbc), jdbc, dates, users);

        var everyone = controller.get(manager("org_a"), "all", null).getBody();
        assertEquals(0, new BigDecimal("157").compareTo(everyone.total_quantity_mt()));
        assertEquals(0, new BigDecimal("48").compareTo(everyone.purchased_quantity_mt()));
        assertEquals(0, new BigDecimal("-2").compareTo(everyone.purchase_difference_mt()), "48 MT bought against 50 MT planned");
        assertEquals(java.util.List.of("Rae Tan", "yash@example.com"), everyone.officers().stream().map(ManagerOverviewController.Officer::label).toList());
        assertEquals(java.util.List.of(2, 1), everyone.officers().stream().map(ManagerOverviewController.Officer::plan_count).toList());

        var onlyYash = controller.get(manager("org_a"), "all", java.util.List.of(yash)).getBody();
        assertEquals(0, new BigDecimal("7").compareTo(onlyYash.total_quantity_mt()));
        assertEquals(0, BigDecimal.ZERO.compareTo(onlyYash.purchased_quantity_mt()));
        assertEquals(0, new BigDecimal("7").compareTo(onlyYash.open_quantity_mt()));
        assertEquals(2, onlyYash.officers().size(), "the full team stays listed while filtering");

        var stranger = controller.get(manager("org_a"), "all", java.util.List.of(UUID.randomUUID())).getBody();
        assertEquals(0, BigDecimal.ZERO.compareTo(stranger.total_quantity_mt()), "someone outside the team matches nothing");
    }
}
