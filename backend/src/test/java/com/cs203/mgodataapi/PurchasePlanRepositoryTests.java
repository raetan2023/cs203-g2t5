package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Execute scoping SQL on an isolated database; no shared Supabase writes. */
class PurchasePlanRepositoryTests {
    JdbcTemplate jdbc;
    PurchasePlanRepository repository;
    final UUID buyer = UUID.randomUUID(), colleague = UUID.randomUUID();
    final LocalDate date = LocalDate.parse("2026-11-01");
    UUID first, second, otherBuyer, otherOrg, legacy;

    @BeforeEach void database() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE purchase_plans (plan_id UUID PRIMARY KEY, user_id UUID NOT NULL, quantity_mt NUMERIC NOT NULL, purchase_deadline DATE NOT NULL, scenario_as_of_date DATE NOT NULL, clerk_org_id TEXT, status TEXT NOT NULL DEFAULT 'draft', submitted_at TIMESTAMP WITH TIME ZONE, previous_plan_id UUID)");
        repository = new PurchasePlanRepository(jdbc);
        first = row(buyer, "org_a"); second = row(buyer, "org_a");
        otherBuyer = row(colleague, "org_a"); otherOrg = row(buyer, "org_b"); legacy = row(buyer, null);
    }
    UUID row(UUID owner, String org) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO purchase_plans (plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date, clerk_org_id) VALUES (?, ?, ?, ?, ?, ?)", id, owner,
                BigDecimal.TEN, java.sql.Date.valueOf(date), java.sql.Date.valueOf(date), org);
        return id;
    }
    @Test void multiplePlansRemainAvailableToTheirOwnerInsideOneOrganisation() {
        assertEquals(2, repository.findByUser(buyer, "org_a").size());
        assertEquals(1, repository.findByUser(buyer, "org_b").size());
        assertEquals(3, repository.findByOrganisation("org_a").size());
        assertTrue(repository.findByOrganisation("org_empty").isEmpty());
    }
    @Test void exactPlanReadsRejectOtherOwnersOtherOrganisationsAndLegacyNullRows() {
        assertTrue(repository.findByIdAndUser(first, buyer, "org_a").isPresent());
        assertTrue(repository.findByIdAndUser(first, colleague, "org_a").isEmpty());
        assertTrue(repository.findByIdAndUser(first, buyer, "org_b").isEmpty());
        assertTrue(repository.findByIdAndUser(legacy, buyer, "org_a").isEmpty());
        assertTrue(repository.findByIdAndOrganisation(otherBuyer, "org_a").isPresent());
        assertTrue(repository.findByIdAndOrganisation(otherOrg, "org_a").isEmpty());
        assertTrue(repository.findByIdAndOrganisation(legacy, "org_a").isEmpty());
    }
    @Test void deletionRequiresBothOwnerAndOrganisationAndDoesNotAffectAnotherPlan() {
        assertFalse(repository.delete(first, colleague, "org_a"));
        assertFalse(repository.delete(first, buyer, "org_b"));
        assertFalse(repository.delete(legacy, buyer, "org_a"));
        assertTrue(repository.delete(first, buyer, "org_a"));
        assertTrue(repository.findByIdAndUser(second, buyer, "org_a").isPresent());
        assertTrue(repository.findByIdAndUser(otherOrg, buyer, "org_b").isPresent());
        assertFalse(repository.delete(first, buyer, "org_a"));
    }
    @Test void insertsBindVerifiedOrganisationAndUpdatesCannotChangeOrganisation() {
        // PostgreSQL RETURNING is checked at the JDBC boundary (H2 does not support it).
        JdbcTemplate writer = mock(JdbcTemplate.class);
        var store = new PurchasePlanRepository(writer);
        store.insert(buyer, BigDecimal.TEN, date, date, "org_a");
        verify(writer).queryForObject(argThat(sql -> sql.contains("scenario_as_of_date, clerk_org_id)")
                        && sql.contains("values (?, ?, ?, ?, ?)")),
                org.mockito.ArgumentMatchers.<RowMapper<PurchasePlan>>any(), eq(buyer), eq(BigDecimal.TEN), eq(date), eq(date), eq("org_a"));
        when(writer.query(anyString(), org.mockito.ArgumentMatchers.<RowMapper<PurchasePlan>>any(),
                any(), any(), any(), any(), any(), any())).thenReturn(List.of());
        assertTrue(store.update(first, buyer, BigDecimal.ONE, date, date, "org_a").isEmpty());
        verify(writer).query(argThat(sql -> sql.contains("where plan_id = ? and user_id = ? and clerk_org_id = ?")
                        && !sql.contains("set clerk_org_id")), org.mockito.ArgumentMatchers.<RowMapper<PurchasePlan>>any(),
                eq(BigDecimal.ONE), eq(date), eq(date), eq(first), eq(buyer), eq("org_a"));
    }
    @Test void missingOrganisationIsNeverAnUnscopedFallback() {
        assertThrows(IllegalArgumentException.class, () -> repository.findByUser(buyer, null));
        assertThrows(IllegalArgumentException.class, () -> repository.findByOrganisation(""));
        assertThrows(IllegalArgumentException.class, () -> repository.insert(buyer, BigDecimal.TEN, date, date, null));
    }
}
