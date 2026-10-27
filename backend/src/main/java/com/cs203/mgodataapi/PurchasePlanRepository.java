package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** Reads and writes purchase_plans. Every query is organisation-scoped; buyer mutations also require the owner. */
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

    public List<PurchasePlan> findByUser(UUID userId, String organisationId) {
        return jdbc.query("""
                select plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date
                from purchase_plans where user_id = ? and clerk_org_id = ?
                order by purchase_deadline, plan_id""", MAPPER, userId, requireOrganisation(organisationId));
    }

    public Optional<PurchasePlan> findByIdAndUser(UUID planId, UUID userId, String organisationId) {
        return jdbc.query("""
                select plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date
                from purchase_plans where plan_id = ? and user_id = ? and clerk_org_id = ?""", MAPPER, planId, userId, requireOrganisation(organisationId))
                .stream().findFirst();
    }

    public PurchasePlan insert(UUID userId, BigDecimal quantityMt, LocalDate deadline, LocalDate scenarioDate, String organisationId) {
        return jdbc.queryForObject("""
                insert into purchase_plans (user_id, quantity_mt, purchase_deadline, scenario_as_of_date, clerk_org_id)
                values (?, ?, ?, ?, ?)
                returning plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date""",
                MAPPER, userId, quantityMt, deadline, scenarioDate, requireOrganisation(organisationId));
    }

    public Optional<PurchasePlan> update(UUID planId, UUID userId, BigDecimal quantityMt, LocalDate deadline, LocalDate scenarioDate, String organisationId) {
        List<PurchasePlan> updated = jdbc.query("""
                update purchase_plans
                set quantity_mt = ?, purchase_deadline = ?, scenario_as_of_date = ?
                where plan_id = ? and user_id = ? and clerk_org_id = ?
                returning plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date""",
                MAPPER, quantityMt, deadline, scenarioDate, planId, userId, requireOrganisation(organisationId));
        return updated.stream().findFirst();
    }

    public boolean delete(UUID planId, UUID userId, String organisationId) {
        return jdbc.update("delete from purchase_plans where plan_id = ? and user_id = ? and clerk_org_id = ?", planId, userId, requireOrganisation(organisationId)) > 0;
    }

    public List<PurchasePlan> findByOrganisation(String organisationId) {
        return jdbc.query("""
                select plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date
                from purchase_plans where clerk_org_id = ?
                order by purchase_deadline, plan_id""", MAPPER, requireOrganisation(organisationId));
    }

    public Optional<PurchasePlan> findByIdAndOrganisation(UUID planId, String organisationId) {
        return jdbc.query("""
                select plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date
                from purchase_plans where plan_id = ? and clerk_org_id = ?""",
                MAPPER, planId, requireOrganisation(organisationId)).stream().findFirst();
    }

    private static String requireOrganisation(String id) {
        if (id == null || !id.matches("org_[A-Za-z0-9]+")) {
            throw new IllegalArgumentException("An explicit Clerk organisation is required.");
        }
        return id;
    }

}
