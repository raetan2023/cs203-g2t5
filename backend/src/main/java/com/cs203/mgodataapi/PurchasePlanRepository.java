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
            rs.getObject("scenario_as_of_date", LocalDate.class),
            rs.getString("status"),
            rs.getTimestamp("submitted_at") == null ? null : rs.getTimestamp("submitted_at").toInstant(),
            rs.getObject("previous_plan_id", UUID.class));

    private static final String COLUMNS = """
            select p.plan_id, p.user_id, p.quantity_mt, p.purchase_deadline, p.scenario_as_of_date, p.status, p.submitted_at, p.previous_plan_id
            from purchase_plans p
            """;
    static final String ASSIGNED_TO_MANAGER = """
            exists (select 1 from pm_assignments a
                    where a.po_user_id = p.user_id and a.clerk_org_id = p.clerk_org_id and a.pm_user_id = ?)""";
    /**
     * A manager sees plans of their current officers, plans they decided, and requests that were withdrawn
     * from them because the officer stopped being an officer. Takes the manager's id three times.
     */
    static final String VISIBLE_TO_MANAGER = "(" + ASSIGNED_TO_MANAGER + """
             or exists (select 1 from plan_approval_decisions d
                        where d.plan_id = p.plan_id and d.clerk_org_id = p.clerk_org_id and d.manager_user_id = ?)
             or exists (select 1 from plan_withdrawals mw
                        where mw.plan_id = p.plan_id and mw.clerk_org_id = p.clerk_org_id and mw.manager_user_id = ?))""";

    private final JdbcTemplate jdbc;

    public PurchasePlanRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<PurchasePlan> findByUser(UUID userId, String organisationId) {
        return jdbc.query("""
                select plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date, status, submitted_at, previous_plan_id
                from purchase_plans where user_id = ? and clerk_org_id = ?
                order by purchase_deadline, plan_id""", MAPPER, userId, requireOrganisation(organisationId));
    }

    public Optional<PurchasePlan> findByIdAndUser(UUID planId, UUID userId, String organisationId) {
        return jdbc.query("""
                select plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date, status, submitted_at, previous_plan_id
                from purchase_plans where plan_id = ? and user_id = ? and clerk_org_id = ?""", MAPPER, planId, userId, requireOrganisation(organisationId))
                .stream().findFirst();
    }

    public PurchasePlan insert(UUID userId, BigDecimal quantityMt, LocalDate deadline, LocalDate scenarioDate, String organisationId) {
        return jdbc.queryForObject("""
                insert into purchase_plans (user_id, quantity_mt, purchase_deadline, scenario_as_of_date, clerk_org_id)
                values (?, ?, ?, ?, ?)
                returning plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date, status, submitted_at, previous_plan_id""",
                MAPPER, userId, quantityMt, deadline, scenarioDate, requireOrganisation(organisationId));
    }

    public Optional<PurchasePlan> update(UUID planId, UUID userId, BigDecimal quantityMt, LocalDate deadline, LocalDate scenarioDate, String organisationId) {
        List<PurchasePlan> updated = jdbc.query("""
                update purchase_plans
                set quantity_mt = ?, purchase_deadline = ?, scenario_as_of_date = ?
                where plan_id = ? and user_id = ? and clerk_org_id = ? and status = 'draft'
                returning plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date, status, submitted_at, previous_plan_id""",
                MAPPER, quantityMt, deadline, scenarioDate, planId, userId, requireOrganisation(organisationId));
        return updated.stream().findFirst();
    }

    public boolean delete(UUID planId, UUID userId, String organisationId) {
        return jdbc.update("delete from purchase_plans where plan_id = ? and user_id = ? and clerk_org_id = ? and status = 'draft'", planId, userId, requireOrganisation(organisationId)) > 0;
    }

    public List<PurchasePlan> findByOrganisation(String organisationId) {
        return jdbc.query("""
                select plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date, status, submitted_at, previous_plan_id
                from purchase_plans where clerk_org_id = ?
                order by purchase_deadline, plan_id""", MAPPER, requireOrganisation(organisationId));
    }

    public Optional<PurchasePlan> findByIdAndOrganisation(UUID planId, String organisationId) {
        return jdbc.query("""
                select plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date, status, submitted_at, previous_plan_id
                from purchase_plans where plan_id = ? and clerk_org_id = ?""",
                MAPPER, planId, requireOrganisation(organisationId)).stream().findFirst();
    }

    /** Plans of the manager's current officers, plus any plan this manager personally decided. */
    public List<PurchasePlan> findForManager(UUID managerId, String organisationId) {
        return jdbc.query(COLUMNS + "where p.clerk_org_id = ? and " + VISIBLE_TO_MANAGER + " order by p.purchase_deadline, p.plan_id",
                MAPPER, requireOrganisation(organisationId), managerId, managerId, managerId);
    }

    public Optional<PurchasePlan> findByIdForManager(UUID planId, UUID managerId, String organisationId) {
        return jdbc.query(COLUMNS + "where p.plan_id = ? and p.clerk_org_id = ? and " + VISIBLE_TO_MANAGER,
                MAPPER, planId, requireOrganisation(organisationId), managerId, managerId, managerId).stream().findFirst();
    }

    /** Current officers only: past decisions for someone else's team are not this manager's exposure. */
    public List<PurchasePlan> findAssignedToManager(UUID managerId, String organisationId) {
        return jdbc.query(COLUMNS + "where p.clerk_org_id = ? and " + ASSIGNED_TO_MANAGER + " order by p.purchase_deadline, p.plan_id",
                MAPPER, requireOrganisation(organisationId), managerId);
    }

    private static final String APPROVED_SINCE = """
             and exists (select 1 from plan_approval_decisions d
                         where d.plan_id = p.plan_id and d.clerk_org_id = p.clerk_org_id
                           and d.decision = 'approved' and d.decided_at >= ?)""";

    /** Plans in the organisation that a manager approved on or after {@code since} (an admin's overview). */
    public java.util.Set<UUID> approvedSince(String organisationId, java.time.Instant since) {
        return new java.util.HashSet<>(jdbc.queryForList("select p.plan_id from purchase_plans p where p.clerk_org_id = ? "
                + APPROVED_SINCE, UUID.class, requireOrganisation(organisationId), java.sql.Timestamp.from(since)));
    }

    /** Everyone who is currently a procurement officer in the organisation. */
    public List<UUID> officerMembers(String organisationId) {
        return jdbc.queryForList("select user_id from organisation_members where clerk_org_id = ? and role = 'org:officer'",
                UUID.class, requireOrganisation(organisationId));
    }

    /** The officers this manager oversees, with how each is shown: name, else email, else Clerk ID. */
    public List<java.util.Map.Entry<UUID, String>> officersForManager(UUID managerId, String organisationId) {
        return jdbc.query("select a.po_user_id, " + UserAccounts.labelOf("u") + """
                 as label from pm_assignments a join users u on u.user_id = a.po_user_id
                where a.pm_user_id = ? and a.clerk_org_id = ? order by label, a.po_user_id""",
                (rs, n) -> java.util.Map.entry(rs.getObject("po_user_id", UUID.class), rs.getString("label")),
                managerId, requireOrganisation(organisationId));
    }

    /** Why each closed plan in the organisation was closed: role_change or deadline_passed. */
    public java.util.Map<UUID, String> closedReasons(String organisationId) {
        var result = new java.util.HashMap<UUID, String>();
        jdbc.query("select plan_id, closed_reason from purchase_plans where clerk_org_id = ? and status = 'closed' and closed_reason is not null",
                (org.springframework.jdbc.core.RowCallbackHandler) rs -> result.put(rs.getObject("plan_id", UUID.class), rs.getString("closed_reason")),
                requireOrganisation(organisationId));
        return result;
    }

    /** Each officer's current PM in the organisation; officers without one are absent. */
    public java.util.Map<UUID, UUID> managersByOfficer(String organisationId) {
        var result = new java.util.HashMap<UUID, UUID>();
        jdbc.query("select po_user_id, pm_user_id from pm_assignments where clerk_org_id = ?",
                (org.springframework.jdbc.core.RowCallbackHandler) rs -> result.put(rs.getObject("po_user_id", UUID.class), rs.getObject("pm_user_id", UUID.class)),
                requireOrganisation(organisationId));
        return result;
    }

    /** Withdrawn plans leave officer and manager lists this long after being withdrawn. Admins still see them. */
    public static final java.time.Duration WITHDRAWN_VISIBLE_FOR = java.time.Duration.ofDays(5);

    /** Plans in the organisation withdrawn before {@code cutoff}. */
    public java.util.Set<UUID> withdrawnBefore(String organisationId, java.time.Instant cutoff) {
        return new java.util.HashSet<>(jdbc.queryForList(
                "select plan_id from plan_withdrawals where clerk_org_id = ? and withdrawn_at < ?",
                UUID.class, requireOrganisation(organisationId), java.sql.Timestamp.from(cutoff)));
    }

    /** Plans of the manager's current officers that a manager approved on or after {@code since}. */
    public java.util.Set<UUID> approvedSinceForManager(UUID managerId, String organisationId, java.time.Instant since) {
        return new java.util.HashSet<>(jdbc.queryForList("select p.plan_id from purchase_plans p where p.clerk_org_id = ? and "
                + ASSIGNED_TO_MANAGER + APPROVED_SINCE, UUID.class, requireOrganisation(organisationId), managerId, java.sql.Timestamp.from(since)));
    }

    /** Locks a plan only for the manager its officer currently reports to. */
    public Optional<PurchasePlan> lockAssignedToManager(UUID planId, UUID managerId, String organisationId) {
        return jdbc.query(COLUMNS + "where p.plan_id = ? and p.clerk_org_id = ? and " + ASSIGNED_TO_MANAGER + " for update",
                MAPPER, planId, requireOrganisation(organisationId), managerId).stream().findFirst();
    }

    public boolean hasManager(UUID officerId, String organisationId) {
        Integer count = jdbc.queryForObject("select count(*) from pm_assignments where po_user_id = ? and clerk_org_id = ?",
                Integer.class, officerId, requireOrganisation(organisationId));
        return count != null && count > 0;
    }

    public Optional<PurchasePlan> lockOwned(UUID planId, UUID userId, String organisationId) {
        return jdbc.query("""
                select plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date, status, submitted_at, previous_plan_id
                from purchase_plans where plan_id = ? and user_id = ? and clerk_org_id = ? for update""",
                MAPPER, planId, userId, requireOrganisation(organisationId)).stream().findFirst();
    }

    public int markDecided(UUID planId, String organisationId, String decision) {
        if (!java.util.Set.of("approved", "rejected").contains(decision)) throw new IllegalArgumentException("Invalid decision");
        return jdbc.update("""
                update purchase_plans set status = ?
                where plan_id = ? and clerk_org_id = ? and status = 'submitted'""",
                decision, planId, requireOrganisation(organisationId));
    }

    public int markSubmitted(UUID planId, UUID userId, String organisationId, java.time.Instant submittedAt) {
        return jdbc.update("""
                update purchase_plans set status = 'submitted', submitted_at = ?
                where plan_id = ? and user_id = ? and clerk_org_id = ? and status = 'draft'""",
                java.sql.Timestamp.from(submittedAt), planId, userId, requireOrganisation(organisationId));
    }

    public PurchasePlan insertRevision(PurchasePlan source, String organisationId, LocalDate today) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into purchase_plans (plan_id, user_id, quantity_mt, purchase_deadline, scenario_as_of_date,
                    clerk_org_id, previous_plan_id)
                values (?, ?, ?, ?, ?, ?, ?)""", id, source.userId(), source.quantityMt(), source.purchaseDeadline(),
                today, requireOrganisation(organisationId), source.planId());
        return findByIdAndUser(id, source.userId(), organisationId).orElseThrow();
    }

    public int transitionOwned(UUID planId, UUID userId, String organisationId, String from, String to) {
        if (!("submitted".equals(from) && "withdrawn".equals(to))
                && !("approved".equals(from) && "purchased".equals(to)))
            throw new IllegalArgumentException("Invalid lifecycle transition");
        return jdbc.update("""
                update purchase_plans set status = ?
                where plan_id = ? and user_id = ? and clerk_org_id = ? and status = ?""",
                to, planId, userId, requireOrganisation(organisationId), from);
    }

    private static String requireOrganisation(String id) {
        if (id == null || !id.matches("org_[A-Za-z0-9]+")) {
            throw new IllegalArgumentException("An explicit Clerk organisation is required.");
        }
        return id;
    }

}
