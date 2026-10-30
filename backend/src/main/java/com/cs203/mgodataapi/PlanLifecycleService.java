package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.math.MathContext;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Final states keep their submission and audit history; revisions always get a new ID. */
@Service
public class PlanLifecycleService {
    public record WithdrawalRequest(String reason) {}
    public record PurchaseRequest(LocalDate purchased_on, String supplier, BigDecimal quantity_mt,
            BigDecimal price_usd_per_mt, String note) {}

    private final PurchasePlanRepository plans;
    private final PlanApprovalService approvals;
    private final JdbcTemplate jdbc;
    private final OperationalDate dates;
    private final Clock clock;

    public PlanLifecycleService(PurchasePlanRepository plans, PlanApprovalService approvals, JdbcTemplate jdbc,
            OperationalDate dates, Clock clock) {
        this.plans = plans; this.approvals = approvals; this.jdbc = jdbc; this.dates = dates; this.clock = clock;
    }

    @Transactional
    public PurchasePlan withdraw(UUID id, UUID buyer, String org, WithdrawalRequest request) {
        var plan = owned(id, buyer, org, "submitted");
        String reason = request == null || request.reason() == null ? "" : request.reason().strip();
        if (reason.length() > 2000) invalid(Map.of("reason", "Use at most 2000 characters."));
        transition(plan, org, "withdrawn");
        jdbc.update("""
                insert into plan_withdrawals (plan_id, clerk_org_id, buyer_user_id, reason, withdrawn_at)
                values (?, ?, ?, ?, ?)""", id, org, buyer, reason, Timestamp.from(clock.instant()));
        return plans.findByIdAndUser(id, buyer, org).orElseThrow();
    }

    @Transactional
    public PurchasePlan revise(UUID id, UUID buyer, String org) {
        var plan = plans.lockOwned(id, buyer, org).orElseThrow(PlanLifecycleService::notFound);
        if (!Set.of("rejected", "withdrawn").contains(plan.status()))
            throw new ApiException(HttpStatus.CONFLICT, "Only rejected or withdrawn plans can be copied to a new draft.");
        // Preserve even an elapsed deadline; the draft must be edited before it can be submitted.
        return plans.insertRevision(plan, org, dates.today());
    }

    @Transactional
    public PurchasePlan recordPurchase(UUID id, UUID buyer, String org, PurchaseRequest request) {
        var plan = owned(id, buyer, org, "approved");
        var decision = approvals.decision(id, org);
        if (decision == null || !"approved".equals(decision.get("decision")))
            throw new ApiException(HttpStatus.CONFLICT, "The saved approval is missing. Reload the plan.");
        LocalDate approvedOn = Instant.parse((String) decision.get("decided_at"))
                .atZone(ZoneId.of("Asia/Singapore")).toLocalDate();
        var errors = new LinkedHashMap<String, String>();
        if (request == null) { invalid(Map.of("purchase", "Enter the purchase details.")); }
        if (request.purchased_on() == null || request.purchased_on().isBefore(approvedOn)
                || request.purchased_on().isAfter(dates.today()))
            errors.put("purchased_on", "Choose a date on or after approval and no later than today (Singapore).");
        String supplier = request.supplier() == null ? "" : request.supplier().strip();
        String note = request.note() == null ? "" : request.note().strip();
        if (supplier.isEmpty() || supplier.length() > 200) errors.put("supplier", "Enter a supplier of at most 200 characters.");
        if (!positiveAmount(request.quantity_mt())) errors.put("quantity_mt", "Enter a positive quantity with at most 6 decimal places and 12 whole digits.");
        if (!positiveAmount(request.price_usd_per_mt())) errors.put("price_usd_per_mt", "Enter a positive USD/MT price with at most 6 decimal places and 12 whole digits.");
        if (note.length() > 2000) errors.put("note", "Use at most 2000 characters.");
        if (!errors.isEmpty()) invalid(errors);
        transition(plan, org, "purchased");
        jdbc.update("""
                insert into purchase_records (purchase_id, plan_id, clerk_org_id, buyer_user_id, purchased_on,
                    supplier, quantity_mt, price_usd_per_mt, note, recorded_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", UUID.randomUUID(), id, org, buyer,
                request.purchased_on(), supplier, request.quantity_mt().stripTrailingZeros(), request.price_usd_per_mt().stripTrailingZeros(), note, Timestamp.from(clock.instant()));
        return plans.findByIdAndUser(id, buyer, org).orElseThrow();
    }

    private static boolean positiveAmount(BigDecimal value) {
        if (value == null || value.signum() <= 0) return false;
        var normalized = value.stripTrailingZeros();
        return normalized.scale() <= 6 && normalized.precision() - normalized.scale() <= 12;
    }

    private PurchasePlan owned(UUID id, UUID buyer, String org, String status) {
        var plan = plans.lockOwned(id, buyer, org).orElseThrow(PlanLifecycleService::notFound);
        if (!status.equals(plan.status()))
            throw new ApiException(HttpStatus.CONFLICT, "This action requires a plan with status '" + status + "'. Reload to see its current status.");
        return plan;
    }

    private void transition(PurchasePlan plan, String org, String target) {
        if (plans.transitionOwned(plan.planId(), plan.userId(), org, plan.status(), target) != 1)
            throw new ApiException(HttpStatus.CONFLICT, "The plan changed. Reload before continuing.");
    }

    public List<Map<String, Object>> buyerNotifications(UUID buyer, String org) {
        return jdbc.query("""
                select n.notification_id, n.plan_id, n.decision, n.created_at, n.seen_at,
                    p.quantity_mt, p.purchase_deadline, d.manager_label, d.decision_comment
                from plan_decision_notifications n
                join purchase_plans p on p.plan_id = n.plan_id and p.clerk_org_id = n.clerk_org_id and p.user_id = n.buyer_user_id
                join plan_approval_decisions d on d.plan_id = n.plan_id and d.clerk_org_id = n.clerk_org_id
                where n.buyer_user_id = ? and n.clerk_org_id = ?
                order by n.created_at desc, n.notification_id desc limit 100""", (rs, row) -> {
            var item = new LinkedHashMap<String, Object>();
            item.put("notification_id", rs.getObject("notification_id", UUID.class).toString());
            item.put("plan_id", rs.getObject("plan_id", UUID.class).toString());
            item.put("decision", rs.getString("decision"));
            item.put("created_at", rs.getTimestamp("created_at").toInstant().toString());
            item.put("seen_at", rs.getTimestamp("seen_at") == null ? null : rs.getTimestamp("seen_at").toInstant().toString());
            item.put("quantity_mt", rs.getBigDecimal("quantity_mt"));
            item.put("purchase_deadline", rs.getObject("purchase_deadline", LocalDate.class).toString());
            item.put("manager_label", rs.getString("manager_label"));
            item.put("comment", rs.getString("decision_comment"));
            return (Map<String, Object>) item;
        }, buyer, org);
    }

    /** Count all unread rows, even when the latest-100 list omits older decisions. */
    public long unreadCount(UUID buyer, String org) {
        return jdbc.queryForObject("""
                select count(*) from plan_decision_notifications
                where buyer_user_id = ? and clerk_org_id = ? and seen_at is null""", Long.class, buyer, org);
    }

    @Transactional
    public void markSeen(UUID notification, UUID buyer, String org) {
        if (jdbc.update("""
                update plan_decision_notifications set seen_at = coalesce(seen_at, ?)
                where notification_id = ? and buyer_user_id = ? and clerk_org_id = ?""",
                Timestamp.from(clock.instant()), notification, buyer, org) != 1) throw notFound();
    }

    /** Called only after the submission controller has authorized access to this plan. */
    public Map<String, Object> withdrawal(UUID id, String org) {
        var rows = jdbc.query("""
                select w.reason, w.withdrawn_at from plan_withdrawals w
                where w.plan_id = ? and w.clerk_org_id = ?""", (rs, row) -> Map.<String, Object>of(
                    "reason", rs.getString("reason"), "withdrawn_at", rs.getTimestamp("withdrawn_at").toInstant().toString()), id, org);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public List<String> revisions(UUID id, String org) {
        return jdbc.query("select plan_id from purchase_plans where previous_plan_id = ? and clerk_org_id = ? order by plan_id",
                (rs, row) -> rs.getObject("plan_id", UUID.class).toString(), id, org);
    }

    public Map<String, Object> purchase(UUID id, String org) {
        var rows = jdbc.query("""
                select purchase_id, purchased_on, supplier, quantity_mt, price_usd_per_mt, note, recorded_at
                from purchase_records where plan_id = ? and clerk_org_id = ?""", (rs, row) -> {
            var result = new LinkedHashMap<String, Object>();
            result.put("purchase_id", rs.getObject("purchase_id", UUID.class).toString());
            result.put("purchased_on", rs.getObject("purchased_on", LocalDate.class).toString());
            result.put("supplier", rs.getString("supplier"));
            var quantity = rs.getBigDecimal("quantity_mt");
            var price = rs.getBigDecimal("price_usd_per_mt");
            result.put("quantity_mt", quantity); result.put("price_usd_per_mt", price);
            result.put("total_usd", quantity.multiply(price));
            result.put("note", rs.getString("note"));
            result.put("recorded_at", rs.getTimestamp("recorded_at").toInstant().toString());
            return (Map<String, Object>) result;
        }, id, org);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    /** Compare against the frozen submission, never a freshly published forecast. */
    public Map<String, Object> comparison(PurchasePlan plan, String org, Map<String, Object> purchase) {
        if (purchase == null) return null;
        var snapshot = approvals.submittedRecommendation(plan.planId(), org);
        var analysis = map(map(snapshot).get("analysis"));
        var impact = readyValue(analysis.get("cost_impact"));
        var evidence = map(readyValue(analysis.get("recommendation")).get("evidence"));
        BigDecimal reference = number(impact.get("reference_total"));
        if (reference == null) reference = number(evidence.get("buy_now_cost_usd"));
        BigDecimal estimate = number(impact.get("central_total"));
        var actual = (BigDecimal) purchase.get("total_usd");
        var quantity = (BigDecimal) purchase.get("quantity_mt");
        var result = new LinkedHashMap<String, Object>();
        result.put("currency", "USD"); result.put("planned_quantity_mt", plan.quantityMt());
        result.put("actual_quantity_mt", quantity);
        result.put("same_quantity", plan.quantityMt().compareTo(quantity) == 0);
        result.put("reference_total", reference); result.put("central_total", estimate);
        result.put("forecast_total", impact.get("forecast_total"));
        result.put("actual_total", actual);
        result.put("actual_minus_reference", reference == null ? null : actual.subtract(reference));
        result.put("actual_minus_estimate", estimate == null ? null : actual.subtract(estimate));
        // Quantity-adjusted totals keep a smaller delivery from being presented as a price saving.
        BigDecimal adjustedReference = adjusted(reference, plan.quantityMt(), quantity);
        BigDecimal adjustedEstimate = adjusted(estimate, plan.quantityMt(), quantity);
        result.put("reference_total_for_actual_quantity", adjustedReference);
        result.put("estimate_total_for_actual_quantity", adjustedEstimate);
        result.put("actual_minus_adjusted_reference", adjustedReference == null ? null : actual.subtract(adjustedReference));
        result.put("actual_minus_adjusted_estimate", adjustedEstimate == null ? null : actual.subtract(adjustedEstimate));
        return result;
    }

    private static BigDecimal adjusted(BigDecimal total, BigDecimal planned, BigDecimal actual) {
        return total == null || planned.signum() <= 0 ? null : total.multiply(actual).divide(planned, MathContext.DECIMAL128);
    }
    private static Map<?, ?> map(Object value) { return value instanceof Map<?, ?> fields ? fields : Map.of(); }
    private static Map<?, ?> readyValue(Object value) {
        var result = map(value); return "ready".equals(result.get("status")) ? map(result.get("value")) : Map.of();
    }
    private static BigDecimal number(Object value) { return value instanceof Number n ? new BigDecimal(n.toString()) : null; }
    private static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND, "No matching purchase plan or notification was found."); }
    private static void invalid(Map<String, String> errors) {
        throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Please check your inputs.", errors);
    }
}
