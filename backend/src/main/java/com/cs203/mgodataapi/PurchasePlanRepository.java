package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** Reads and writes purchase_plans. Every lookup and mutation is scoped to the authenticated owner. */
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

    public List<PurchasePlan> findByUser(UUID userId) {
        return jdbc.query("""
                select plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date
                from purchase_plans where user_id = ?
                order by purchase_deadline, plan_id""", MAPPER, userId);
    }

    public Optional<PurchasePlan> findByIdAndUser(UUID planId, UUID userId) {
        return jdbc.query("""
                select plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date
                from purchase_plans where plan_id = ? and user_id = ?""", MAPPER, planId, userId)
                .stream().findFirst();
    }

    public PurchasePlan insert(UUID userId, BigDecimal quantityMt, LocalDate deadline, LocalDate scenarioDate) {
        return jdbc.queryForObject("""
                insert into purchase_plans (user_id, quantity_mt, purchase_deadline, scenario_as_of_date)
                values (?, ?, ?, ?)
                returning plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date""",
                MAPPER, userId, quantityMt, deadline, scenarioDate);
    }

    public Optional<PurchasePlan> update(UUID planId, UUID userId, BigDecimal quantityMt, LocalDate deadline, LocalDate scenarioDate) {
        List<PurchasePlan> updated = jdbc.query("""
                update purchase_plans
                set quantity_mt = ?, purchase_deadline = ?, scenario_as_of_date = ?
                where plan_id = ? and user_id = ?
                returning plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date""",
                MAPPER, quantityMt, deadline, scenarioDate, planId, userId);
        return updated.stream().findFirst();
    }

    public boolean delete(UUID planId, UUID userId) {
        return jdbc.update("delete from purchase_plans where plan_id = ? and user_id = ?", planId, userId) > 0;
    }
}
