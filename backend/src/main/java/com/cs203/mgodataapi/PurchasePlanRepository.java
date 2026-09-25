package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** Reads and writes purchase_plans. One plan per user is enforced by a unique key on user_id. */
@Repository
public class PurchasePlanRepository {

    private static final RowMapper<PurchasePlan> MAPPER = (rs, rowNum) -> new PurchasePlan(
            rs.getObject("plan_id", UUID.class),
            rs.getObject("user_id", UUID.class),
            rs.getBigDecimal("quantity_mt"),
            rs.getObject("purchase_deadline", LocalDate.class),
            rs.getObject("scenario_as_of_date", LocalDate.class));

    private final JdbcTemplate jdbc;

    public PurchasePlanRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<PurchasePlan> findByUser(UUID userId) {
        List<PurchasePlan> found = jdbc.query("""
                select plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date
                from purchase_plans where user_id = ?""", MAPPER, userId);
        return found.stream().findFirst();
    }

    public PurchasePlan insert(UUID userId, BigDecimal quantityMt, LocalDate deadline, LocalDate scenarioDate) {
        return jdbc.queryForObject("""
                insert into purchase_plans (user_id, quantity_mt, purchase_deadline, scenario_as_of_date)
                values (?, ?, ?, ?)
                returning plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date""",
                MAPPER, userId, quantityMt, deadline, scenarioDate);
    }

    public Optional<PurchasePlan> update(UUID userId, BigDecimal quantityMt, LocalDate deadline, LocalDate scenarioDate) {
        List<PurchasePlan> updated = jdbc.query("""
                update purchase_plans
                set quantity_mt = ?, purchase_deadline = ?, scenario_as_of_date = ?
                where user_id = ?
                returning plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date""",
                MAPPER, quantityMt, deadline, scenarioDate, userId);
        return updated.stream().findFirst();
    }

    public boolean delete(UUID userId) {
        return jdbc.update("delete from purchase_plans where user_id = ?", userId) > 0;
    }

    /** True when the user exists in the application's users table, which owns plan rows. */
    public boolean userExists(UUID userId) {
        Integer count = jdbc.queryForObject("select count(*) from users where user_id = ?", Integer.class, userId);
        return count != null && count > 0;
    }
}
