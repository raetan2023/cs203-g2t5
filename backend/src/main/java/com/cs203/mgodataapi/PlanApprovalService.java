package com.cs203.mgodataapi;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Submission and durable organisation-manager notification commit or roll back together. */
@Service
public class PlanApprovalService {
    private final PurchasePlanRepository plans;
    private final JdbcTemplate jdbc;
    private final OperationalDate dates;
    private final Clock clock;
    private final PlanAnalysisService analysis;
    private final tools.jackson.databind.json.JsonMapper mapper;

    public PlanApprovalService(PurchasePlanRepository plans, JdbcTemplate jdbc, OperationalDate dates, Clock clock, PlanAnalysisService analysis, tools.jackson.databind.json.JsonMapper mapper) {
        this.plans = plans; this.jdbc = jdbc; this.dates = dates; this.clock = clock; this.analysis = analysis; this.mapper = mapper;
    }

    @Transactional
    public PurchasePlan submit(UUID planId, UUID owner, String orgId, PlanApprovalRequest selection) {
        PurchasePlan plan = plans.lockOwned(planId, owner, orgId).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "No saved purchase plan was found."));
        if (!"draft".equals(plan.status()))
            throw new ApiException(HttpStatus.CONFLICT, "Only a draft plan can be submitted.");
        if (!plans.hasManager(owner, orgId))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "You don't have a Procurement Manager yet. Ask your admin to assign one.");
        var today = dates.today();
        if (plan.quantityMt().signum() <= 0 || plan.purchaseDeadline().isBefore(today))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Update the plan quantity and deadline before submitting.");
        if (selection == null || selection.horizon_days() == null || !java.util.Set.of(7, 14, 30).contains(selection.horizon_days())
                || selection.run_id() == null || selection.recommendation_id() == null || selection.approval_fingerprint() == null
                || !selection.approval_fingerprint().matches("[a-f0-9]{64}"))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Select a loaded recommendation and forecast horizon before requesting approval.");
        var context = PlanAnalysisService.Context.of(plan, today).withUrgency(selection.urgency());
        RecommendationPolicy.validate(context);
        if (selection.quantity_mt() == null || selection.purchase_deadline() == null || selection.scenario_as_of_date() == null
                || !context.matches(new PlanAnalysisService.Context(planId, selection.quantity_mt(), selection.purchase_deadline(), selection.scenario_as_of_date(), selection.urgency())))
            throw new ApiException(HttpStatus.CONFLICT, "Your saved plan or planning date changed. Reload the recommendation.");
        var verified = analysis.read(context, false, selection.horizon_days(), selection.run_id());
        var guidance = (PlanAnalysisProvider.Result<?>) verified.get("recommendation");
        var forecast = (PlanAnalysisProvider.Result<?>) verified.get("forecast");
        var cost = (PlanAnalysisProvider.Result<?>) verified.get("cost_impact");
        var reference = (PlanAnalysisProvider.Result<?>) verified.get("reference");
        var recommendation = guidance != null && "ready".equals(guidance.status())
                ? (PlanAnalysisProvider.Guidance) guidance.value() : null;
        boolean referenceOnly = recommendation != null && "BUY_NOW".equals(recommendation.action())
                && reference != null && "ready".equals(reference.status()) && cost != null
                && "unavailable".equals(cost.status()) && "unsupported_horizon".equals(cost.reason());
        if (!"model".equals(verified.get("provenance")) || recommendation == null
                || forecast == null || !"ready".equals(forecast.status()) || cost == null || (!"ready".equals(cost.status()) && !referenceOnly))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "A current priced recommendation is required. Forecast costs must be available unless buying now uses the observed reference price.");
        if (!selection.recommendation_id().equals(recommendation.recommendation_id())
                || !selection.approval_fingerprint().equals(verified.get("approval_fingerprint")) || !today.equals(dates.today()))
            throw new ApiException(HttpStatus.CONFLICT, "The recommendation or forecast changed. Reload it and confirm your selection again.");
        var decisions = jdbc.queryForList("""
                select decision, action, run_id from plan_recommendation_decisions
                where plan_id = ? and buyer_user_id = ? and clerk_org_id = ?
                  and recommendation_id = ?
                order by decided_at desc, decision_id desc limit 1""",
                planId, owner, orgId, selection.recommendation_id());
        if (decisions.isEmpty() || !"accept".equals(decisions.getFirst().get("decision"))
                || !selection.run_id().equals(decisions.getFirst().get("run_id"))
                || !recommendation.action().equals(decisions.getFirst().get("action"))) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "Accept the current recommendation before submitting it for manager approval.");
        }
        String snapshot;
        try { snapshot = mapper.writeValueAsString(Map.of("horizon_days", selection.horizon_days(), "analysis", verified)); }
        catch (Exception failure) { throw new IllegalStateException("The recommendation could not be saved.", failure); }
        Instant submittedAt = clock.instant();
        if (plans.markSubmitted(planId, owner, orgId, submittedAt) != 1)
            throw new ApiException(HttpStatus.CONFLICT, "The plan changed. Reload it before submitting.");
        jdbc.update("""
                insert into plan_approval_notifications
                (notification_id, plan_id, clerk_org_id, buyer_user_id, created_at, recommendation_snapshot)
                values (?, ?, ?, ?, ?, CAST(? AS jsonb))""", UUID.randomUUID(), planId, orgId, owner, java.sql.Timestamp.from(submittedAt), snapshot);
        return new PurchasePlan(planId, owner, plan.quantityMt(), plan.purchaseDeadline(), today, "submitted", submittedAt, plan.previousPlanId());
    }

    @Transactional
    public PurchasePlan decide(UUID planId, String orgId, UUID manager, String managerSubject, String managerLabel, PlanDecisionRequest request) {
        var plan = plans.lockAssignedToManager(planId, manager, orgId).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "No saved purchase plan was found."));
        if (!"submitted".equals(plan.status()))
            throw new ApiException(HttpStatus.CONFLICT, "Only a submitted request can be decided. Reload to see its current status.");
        if (request == null || request.decision() == null || !java.util.Set.of("approved", "rejected").contains(request.decision()))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Choose approve or reject.");
        String comment = request.comment() == null ? "" : request.comment().strip();
        if (comment.length() > 2000 || ("rejected".equals(request.decision()) && comment.isBlank()))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Provide a rejection reason; comments must be at most 2000 characters.");
        var snapshot = submittedRecommendation(planId, orgId);
        if (snapshot == null) throw new ApiException(HttpStatus.CONFLICT, "This earlier plan-only request has no saved recommendation to approve.");
        var savedAnalysis = snapshot.get("analysis") instanceof Map<?, ?> values ? values : Map.of();
        if (request.approval_fingerprint() == null || !request.approval_fingerprint().matches("[a-f0-9]{64}")
                || !request.approval_fingerprint().equals(savedAnalysis.get("approval_fingerprint")))
            throw new ApiException(HttpStatus.CONFLICT, "The reviewed recommendation changed. Reload it before deciding.");
        Instant decidedAt = clock.instant();
        if (plans.markDecided(planId, orgId, request.decision()) != 1)
            throw new ApiException(HttpStatus.CONFLICT, "Another manager has already decided this request.");
        // The locked plan and unique plan_id make the first decision final. If audit
        // persistence fails, the status update rolls back with the same transaction.
        jdbc.update("""
                insert into plan_approval_decisions
                (decision_id, plan_id, clerk_org_id, manager_user_id, manager_clerk_user_id, manager_label, decision, decision_comment, decided_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)""", UUID.randomUUID(), planId, orgId, manager,
                managerSubject, managerLabel, request.decision(), comment, java.sql.Timestamp.from(decidedAt));
        jdbc.update("""
                insert into plan_decision_notifications
                (notification_id, plan_id, clerk_org_id, buyer_user_id, decision, created_at)
                values (?, ?, ?, ?, ?, ?)""", UUID.randomUUID(), planId, orgId, plan.userId(), request.decision(), java.sql.Timestamp.from(decidedAt));
        return new PurchasePlan(planId, plan.userId(), plan.quantityMt(), plan.purchaseDeadline(), dates.today(), request.decision(), plan.submittedAt(), plan.previousPlanId());
    }

    public static final String AUTOMATIC_LABEL = "Bunker Buddy (automatic)";
    public static final String AUTOMATIC_SUBJECT = "system";
    public static final String AUTOMATIC_REASON = "Rejected automatically: no decision within 5 days of the purchase deadline.";

    /**
     * Rejects one request that is still waiting for a decision and whose deadline is on or before
     * {@code lastDeadline}. Recorded like a manager's rejection, under the officer's current manager,
     * and the officer is notified. Returns false when the request changed in the meantime.
     */
    @Transactional
    public boolean rejectOverdue(UUID planId, String orgId, UUID manager, java.time.LocalDate lastDeadline) {
        var plan = plans.lockAssignedToManager(planId, manager, orgId).orElse(null);
        if (plan == null || !"submitted".equals(plan.status()) || plan.purchaseDeadline().isAfter(lastDeadline)) return false;
        if (plans.markDecided(planId, orgId, "rejected") != 1) return false;
        Instant decidedAt = clock.instant();
        jdbc.update("""
                insert into plan_approval_decisions
                (decision_id, plan_id, clerk_org_id, manager_user_id, manager_clerk_user_id, manager_label, decision, decision_comment, decided_at)
                values (?, ?, ?, ?, ?, ?, 'rejected', ?, ?)""", UUID.randomUUID(), planId, orgId, manager,
                AUTOMATIC_SUBJECT, AUTOMATIC_LABEL, AUTOMATIC_REASON, java.sql.Timestamp.from(decidedAt));
        jdbc.update("""
                insert into plan_decision_notifications
                (notification_id, plan_id, clerk_org_id, buyer_user_id, decision, created_at)
                values (?, ?, ?, ?, 'rejected', ?)""", UUID.randomUUID(), planId, orgId, plan.userId(), java.sql.Timestamp.from(decidedAt));
        return true;
    }

    public Map<String, Object> decision(UUID planId, String orgId) {
        var rows = jdbc.query("""
                select d.decision_id, d.decision, d.decision_comment, d.manager_clerk_user_id, d.decided_at,
                    case when d.manager_clerk_user_id = 'system' then d.manager_label
                         else coalesce((select nullif(trim(u.display_name), '') from users u where u.user_id = d.manager_user_id), d.manager_label) end as manager_label
                from plan_approval_decisions d where d.plan_id = ? and d.clerk_org_id = ?""", (rs, row) -> Map.<String, Object>of(
                    "decision_id", rs.getObject("decision_id", UUID.class).toString(),
                    "decision", rs.getString("decision"), "comment", rs.getString("decision_comment"),
                    "manager_clerk_user_id", rs.getString("manager_clerk_user_id"), "manager_label", rs.getString("manager_label"),
                    "decided_at", rs.getTimestamp("decided_at").toInstant().toString()), planId, orgId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    /** Called only after the controller authorizes the plan in the active organisation. */
    public String buyerLabel(UUID planId, String orgId) {
        var rows = jdbc.query("""
                SELECT %s AS buyer_label
                FROM purchase_plans p JOIN users u ON u.user_id = p.user_id
                WHERE p.plan_id = ? AND p.clerk_org_id = ?
                """.formatted(UserAccounts.labelOf("u")), (rs, n) -> rs.getString("buyer_label"), planId, orgId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public Map<String, Object> submittedRecommendation(UUID planId, String orgId) {
        var rows = jdbc.query("""
                select recommendation_snapshot from plan_approval_notifications
                where plan_id = ? and clerk_org_id = ?""", (rs, row) -> rs.getString(1), planId, orgId);
        if (rows.isEmpty() || rows.getFirst() == null) return null;
        try { return mapper.readValue(rows.getFirst(), new tools.jackson.core.type.TypeReference<Map<String, Object>>() {}); }
        catch (Exception failure) { throw new IllegalStateException("The submitted recommendation could not be read.", failure); }
    }

    /**
     * The caller must be an active manager; only that manager's visible plans appear. Only requests
     * still waiting for a decision, and withdrawn ones, are listed: decided requests need no action.
     */
    public List<Map<String, Object>> notifications(String orgId, UUID manager) {
        if (orgId == null || !orgId.matches("org_[A-Za-z0-9]+"))
            throw new IllegalArgumentException("An explicit Clerk organisation is required.");
        return jdbc.query("""
                select n.notification_id, n.plan_id, n.created_at, p.quantity_mt, p.purchase_deadline, p.status, p.user_id as buyer_user_id,
                    coalesce((select %s from users u where u.user_id = p.user_id), 'Unknown officer') as buyer_label
                from plan_approval_notifications n
                join purchase_plans p on p.plan_id = n.plan_id and p.clerk_org_id = n.clerk_org_id
                where n.clerk_org_id = ? and p.status in ('submitted', 'withdrawn')
                  and not exists (select 1 from plan_withdrawals w where w.plan_id = p.plan_id
                                  and w.clerk_org_id = p.clerk_org_id and w.withdrawn_at < ?) and """.formatted(UserAccounts.labelOf("u")) + " " + PurchasePlanRepository.VISIBLE_TO_MANAGER + """

                order by n.created_at desc, n.notification_id desc limit 500""", (rs, row) -> Map.<String, Object>of(
                    "buyer_user_id", rs.getObject("buyer_user_id", UUID.class).toString(),
                    "notification_id", rs.getObject("notification_id", UUID.class).toString(),
                    "plan_id", rs.getObject("plan_id", UUID.class).toString(),
                    "created_at", rs.getTimestamp("created_at").toInstant().toString(),
                    "quantity_mt", rs.getBigDecimal("quantity_mt"),
                    "purchase_deadline", rs.getObject("purchase_deadline", java.time.LocalDate.class).toString(),
                    "status", rs.getString("status"), "buyer_label", rs.getString("buyer_label")),
                orgId, java.sql.Timestamp.from(clock.instant().minus(PurchasePlanRepository.WITHDRAWN_VISIBLE_FOR)), manager, manager, manager);
    }
}
