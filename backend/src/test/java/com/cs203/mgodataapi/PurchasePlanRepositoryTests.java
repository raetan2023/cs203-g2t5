package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

/** Verify SQL ownership predicates and bindings without contacting shared Supabase. */
class PurchasePlanRepositoryTests {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PurchasePlanRepository repository = new PurchasePlanRepository(jdbc);
    private final UUID owner = UUID.randomUUID();
    private final UUID id = UUID.randomUUID();
    private final LocalDate date = LocalDate.parse("2025-10-24");

    @Test
    void collectionReturnsAllRowsAndFiltersByOwner() {
        PurchasePlan first = new PurchasePlan(id, owner, BigDecimal.TEN, date, date);
        PurchasePlan second = new PurchasePlan(UUID.randomUUID(), owner, BigDecimal.ONE, date, date);
        when(jdbc.query(anyString(), org.mockito.ArgumentMatchers.<RowMapper<PurchasePlan>>any(), eq(owner)))
                .thenReturn(List.of(first, second));
        assertEquals(List.of(first, second), repository.findByUser(owner));
        verify(jdbc).query(argThat(sql -> sql.contains("where user_id = ?")
                && sql.contains("order by purchase_deadline, plan_id")),
                org.mockito.ArgumentMatchers.<RowMapper<PurchasePlan>>any(), eq(owner));
    }

    @Test
    void readAndUpdateBindPlanIdAndOwnerAndHandleMissingRows() {
        assertTrue(repository.findByIdAndUser(id, owner).isEmpty());
        verify(jdbc).query(argThat(sql -> sql.contains("where plan_id = ? and user_id = ?")),
                org.mockito.ArgumentMatchers.<RowMapper<PurchasePlan>>any(), eq(id), eq(owner));
        assertTrue(repository.update(id, owner, BigDecimal.TEN, date, date).isEmpty());
        verify(jdbc).query(argThat(sql -> sql.contains("update purchase_plans")
                && sql.contains("where plan_id = ? and user_id = ?")),
                org.mockito.ArgumentMatchers.<RowMapper<PurchasePlan>>any(),
                eq(BigDecimal.TEN), eq(date), eq(date), eq(id), eq(owner));
    }

    @Test
    void deleteTargetsOnlyTheSelectedOwnedRow() {
        String sql = "delete from purchase_plans where plan_id = ? and user_id = ?";
        when(jdbc.update(sql, id, owner)).thenReturn(1, 0);
        assertTrue(repository.delete(id, owner));
        assertFalse(repository.delete(id, owner));
        verify(jdbc, times(2)).update(sql, id, owner);
    }
}
