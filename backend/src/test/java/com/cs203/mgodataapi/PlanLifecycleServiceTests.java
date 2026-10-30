package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import static org.junit.jupiter.api.Assertions.*;

/** Executes real SQL, row locks and transaction rollback on an isolated database. */
class PlanLifecycleServiceTests {
    JdbcTemplate jdbc;
    PurchasePlanRepository plans;
    PlanApprovalService approvals;
    PlanLifecycleService lifecycle;
    DataSourceTransactionManager transactions;
    final UUID id = UUID.randomUUID(), buyer = UUID.randomUUID();
    // 16:30 UTC is the following calendar day in Singapore.
    final Instant now = Instant.parse("2026-10-28T16:30:00Z");
    final LocalDate today = LocalDate.parse("2026-10-29");
    final String fingerprint = "a".repeat(64);
    final Clock clock = Clock.fixed(now, ZoneOffset.UTC);
    final String snapshot = """
            {"horizon_days":7,"analysis":{"approval_fingerprint":"%s",
            "cost_impact":{"status":"ready","value":{"reference_total":10000,"central_total":10500,"forecast_total":{"lower":9500,"upper":11500}}}}}
            """.formatted(fingerprint);

    @BeforeEach void setup() {
        var source = new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(source);
        transactions = new DataSourceTransactionManager(source);
        jdbc.execute("""
                CREATE TABLE purchase_plans (plan_id UUID PRIMARY KEY, user_id UUID NOT NULL,
                quantity_mt NUMERIC(30,6) NOT NULL, purchase_deadline DATE NOT NULL, scenario_as_of_date DATE NOT NULL,
                clerk_org_id TEXT, status TEXT NOT NULL DEFAULT 'draft', submitted_at TIMESTAMP WITH TIME ZONE,
                previous_plan_id UUID REFERENCES purchase_plans(plan_id))""");
        jdbc.execute("""
                CREATE TABLE plan_approval_notifications (notification_id UUID PRIMARY KEY,
                plan_id UUID UNIQUE REFERENCES purchase_plans(plan_id), clerk_org_id TEXT, buyer_user_id UUID,
                created_at TIMESTAMP WITH TIME ZONE, recommendation_snapshot TEXT)""");
        jdbc.execute("""
                CREATE TABLE plan_approval_decisions (decision_id UUID PRIMARY KEY, plan_id UUID UNIQUE REFERENCES purchase_plans(plan_id),
                clerk_org_id TEXT, manager_user_id UUID, manager_clerk_user_id TEXT, manager_label TEXT,
                decision TEXT, decision_comment TEXT, decided_at TIMESTAMP WITH TIME ZONE)""");
        jdbc.execute("""
                CREATE TABLE plan_decision_notifications (notification_id UUID PRIMARY KEY,
                plan_id UUID UNIQUE REFERENCES purchase_plans(plan_id), clerk_org_id TEXT, buyer_user_id UUID,
                decision TEXT, created_at TIMESTAMP WITH TIME ZONE, seen_at TIMESTAMP WITH TIME ZONE)""");
        jdbc.execute("""
                CREATE TABLE plan_withdrawals (plan_id UUID PRIMARY KEY REFERENCES purchase_plans(plan_id), clerk_org_id TEXT, buyer_user_id UUID,
                reason TEXT, withdrawn_at TIMESTAMP WITH TIME ZONE)""");
        jdbc.execute("""
                CREATE TABLE purchase_records (purchase_id UUID PRIMARY KEY, plan_id UUID UNIQUE REFERENCES purchase_plans(plan_id),
                clerk_org_id TEXT, buyer_user_id UUID, purchased_on DATE, supplier TEXT,
                quantity_mt NUMERIC(30,6), price_usd_per_mt NUMERIC(30,6), note TEXT, recorded_at TIMESTAMP WITH TIME ZONE)""");
        plans = new PurchasePlanRepository(jdbc);
        var dates = new OperationalDate(clock);
        approvals = transactional(new PlanApprovalService(plans, jdbc, dates, clock, null, tools.jackson.databind.json.JsonMapper.builder().build()));
        lifecycle = transactional(new PlanLifecycleService(plans, approvals, jdbc, dates, clock));
        jdbc.update("""
                INSERT INTO purchase_plans (plan_id,user_id,quantity_mt,purchase_deadline,scenario_as_of_date,clerk_org_id,status,submitted_at)
                VALUES (?,?,10,?,?,'org_a','submitted',?)""", id, buyer, today.plusDays(7), today.minusDays(1), java.sql.Timestamp.from(now.minusSeconds(3600)));
        jdbc.update("INSERT INTO plan_approval_notifications VALUES (?,?, 'org_a', ?, ?, ?)", UUID.randomUUID(), id, buyer, java.sql.Timestamp.from(now.minusSeconds(3600)), snapshot);
    }
    @SuppressWarnings("unchecked") <T> T transactional(T service) {
        var proxy = new ProxyFactory(service);
        proxy.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        return (T) proxy.getProxy();
    }
    PurchasePlan decide(String outcome) {
        return approvals.decide(id, "org_a", UUID.randomUUID(), "user_manager", "Manager", new PlanDecisionRequest(outcome, "Budget reviewed", fingerprint));
    }
    PlanLifecycleService.PurchaseRequest purchase() {
        return new PlanLifecycleService.PurchaseRequest(today, "  Supplier A  ", new BigDecimal("5.25"), new BigDecimal("900.12"), "  Invoice 123  ");
    }
    void status(String state) { jdbc.update("UPDATE purchase_plans SET status=? WHERE plan_id=?", state, id); }
    void error(int status, org.junit.jupiter.api.function.Executable action) {
        assertEquals(status, assertThrows(ApiException.class, action).status().value());
    }

    @Test void decisionsNotifyOnlyTheOwningBuyerAndSeenIsIdempotent() {
        for (String outcome : List.of("approved", "rejected")) {
            if (outcome.equals("rejected")) {
                jdbc.update("DELETE FROM plan_decision_notifications"); jdbc.update("DELETE FROM plan_approval_decisions"); status("submitted");
            }
            decide(outcome);
            var notifications = lifecycle.buyerNotifications(buyer, "org_a");
            assertEquals(1, notifications.size()); assertEquals(1, lifecycle.unreadCount(buyer, "org_a"));
            var item = notifications.getFirst();
            assertEquals(outcome, item.get("decision")); assertEquals("Budget reviewed", item.get("comment"));
            assertEquals("Manager", item.get("manager_label")); assertNull(item.get("seen_at"));
            assertTrue(lifecycle.buyerNotifications(buyer, "org_b").isEmpty());
            assertTrue(lifecycle.buyerNotifications(UUID.randomUUID(), "org_a").isEmpty());
            UUID notification = UUID.fromString((String) item.get("notification_id"));
            error(404, () -> lifecycle.markSeen(notification, UUID.randomUUID(), "org_a"));
            error(404, () -> lifecycle.markSeen(notification, buyer, "org_b"));
            assertEquals(1, lifecycle.unreadCount(buyer, "org_a"));
            lifecycle.markSeen(notification, buyer, "org_a"); lifecycle.markSeen(notification, buyer, "org_a");
            assertEquals(0, lifecycle.unreadCount(buyer, "org_a"));
            assertEquals(now.toString(), lifecycle.buyerNotifications(buyer, "org_a").getFirst().get("seen_at"));
        }
    }

    @Test void notificationInsertFailureRollsBackBothDecisionAndStatus() {
        jdbc.execute("ALTER TABLE plan_decision_notifications ADD CONSTRAINT fail_notify CHECK (clerk_org_id <> 'org_a')");
        assertThrows(org.springframework.dao.DataAccessException.class, () -> decide("approved"));
        assertEquals("submitted", plans.findByIdAndUser(id, buyer, "org_a").orElseThrow().status());
        assertNull(approvals.decision(id, "org_a"));
    }

    @Test void unreadCountIncludesOlderDecisionsOutsideTheListWindow() {
        for (int i = 0; i < 101; i++) {
            UUID planId = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO purchase_plans (plan_id,user_id,quantity_mt,purchase_deadline,scenario_as_of_date,clerk_org_id,status,submitted_at)
                    VALUES (?,?,10,?,?,'org_a','approved',?)""", planId, buyer, today, today, java.sql.Timestamp.from(now));
            jdbc.update("INSERT INTO plan_approval_decisions VALUES (?,?, 'org_a', ?, 'user_manager', 'Manager', 'approved', '', ?)",
                    UUID.randomUUID(), planId, UUID.randomUUID(), java.sql.Timestamp.from(now));
            jdbc.update("INSERT INTO plan_decision_notifications VALUES (?,?, 'org_a', ?, 'approved', ?, NULL)",
                    UUID.randomUUID(), planId, buyer, java.sql.Timestamp.from(now.minusSeconds(i)));
        }
        assertEquals(100, lifecycle.buyerNotifications(buyer, "org_a").size());
        assertEquals(101, lifecycle.unreadCount(buyer, "org_a"));
        assertEquals(0, lifecycle.unreadCount(buyer, "org_b"));
    }

    @Test void revisionKeepsTheEarlierRejectionReasonAndSnapshot() {
        decide("rejected");
        var originalSnapshot = approvals.submittedRecommendation(id, "org_a");
        var copy = lifecycle.revise(id, buyer, "org_a");
        assertEquals("Budget reviewed", approvals.decision(copy.previousPlanId(), "org_a").get("comment"));
        assertEquals(originalSnapshot, approvals.submittedRecommendation(id, "org_a"));
        assertNull(approvals.decision(copy.planId(), "org_a"));
        assertEquals("rejected", plans.findByIdAndUser(id, buyer, "org_a").orElseThrow().status());
    }

    @Test void withdrawalPreservesFrozenSubmissionAndRemainsVisibleInManagerInbox() {
        var withdrawn = lifecycle.withdraw(id, buyer, "org_a", new PlanLifecycleService.WithdrawalRequest("  Changed schedule  "));
        assertEquals("withdrawn", withdrawn.status());
        assertEquals("Changed schedule", lifecycle.withdrawal(id, "org_a").get("reason"));
        assertNull(lifecycle.withdrawal(id, "org_b"));
        assertNotNull(approvals.submittedRecommendation(id, "org_a"));
        assertEquals("withdrawn", approvals.notifications("org_a").getFirst().get("status"));
        error(409, () -> decide("approved"));
        assertTrue(lifecycle.buyerNotifications(buyer, "org_a").isEmpty());
        assertFalse(plans.delete(id, buyer, "org_a"));
    }

    @Test void withdrawnAndRejectedPlansCanBeCopiedWithoutChangingTheOriginal() {
        for (String outcome : List.of("withdrawn", "rejected")) {
            status(outcome);
            jdbc.update("UPDATE purchase_plans SET purchase_deadline=? WHERE plan_id=?", today.minusDays(1), id);
            var copy = lifecycle.revise(id, buyer, "org_a");
            assertNotEquals(id, copy.planId()); assertEquals(id, copy.previousPlanId());
            assertEquals("draft", copy.status()); assertNull(copy.submittedAt());
            assertEquals(today, copy.scenarioAsOfDate()); assertEquals(today.minusDays(1), copy.purchaseDeadline());
            assertEquals(0, BigDecimal.TEN.compareTo(copy.quantityMt()));
            assertEquals(outcome, plans.findByIdAndUser(id, buyer, "org_a").orElseThrow().status());
            assertTrue(lifecycle.revisions(id, "org_a").contains(copy.planId().toString()));
            assertTrue(lifecycle.revisions(id, "org_b").isEmpty());
            assertNull(approvals.submittedRecommendation(copy.planId(), "org_a"));
            assertEquals(id.toString(), copy.toResponse().get("previous_plan_id"));
        }
    }

    @Test void ownerOrganisationAndStatusAreCheckedBeforeEveryMutation() {
        error(404, () -> lifecycle.withdraw(id, UUID.randomUUID(), "org_a", null));
        error(404, () -> lifecycle.withdraw(id, buyer, "org_b", null));
        error(404, () -> lifecycle.revise(id, UUID.randomUUID(), "org_a"));
        error(404, () -> lifecycle.revise(id, buyer, "org_b"));
        error(404, () -> lifecycle.recordPurchase(id, UUID.randomUUID(), "org_a", purchase()));
        error(404, () -> lifecycle.recordPurchase(id, buyer, "org_b", purchase()));
        error(404, () -> lifecycle.withdraw(UUID.randomUUID(), buyer, "org_a", null));
        for (String state : List.of("draft", "submitted", "approved", "rejected", "withdrawn", "purchased")) {
            status(state);
            if (!state.equals("submitted")) error(409, () -> lifecycle.withdraw(id, buyer, "org_a", null));
            if (!state.equals("approved")) error(409, () -> lifecycle.recordPurchase(id, buyer, "org_a", purchase()));
            if (!Set.of("rejected", "withdrawn").contains(state)) error(409, () -> lifecycle.revise(id, buyer, "org_a"));
        }
    }

    @Test void withdrawalReasonIsOptionalButBoundedAndInsertFailureRollsBack() {
        error(422, () -> lifecycle.withdraw(id, buyer, "org_a", new PlanLifecycleService.WithdrawalRequest("x".repeat(2001))));
        jdbc.execute("ALTER TABLE plan_withdrawals ADD CONSTRAINT fail_withdraw CHECK (reason <> '')");
        assertThrows(org.springframework.dao.DataAccessException.class, () -> lifecycle.withdraw(id, buyer, "org_a", null));
        assertEquals("submitted", plans.findByIdAndUser(id, buyer, "org_a").orElseThrow().status());
        jdbc.execute("ALTER TABLE plan_withdrawals DROP CONSTRAINT fail_withdraw");
        lifecycle.withdraw(id, buyer, "org_a", null);
        assertEquals("", lifecycle.withdrawal(id, "org_a").get("reason"));
    }

    @Test void decisionAndWithdrawalRaceHasOneWinnerAndNoPartialAudit() throws Exception {
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var decision = executor.submit(() -> { start.await(); try { decide("approved"); return 200; } catch (ApiException e) { return e.status().value(); } });
            var withdrawal = executor.submit(() -> { start.await(); try { lifecycle.withdraw(id, buyer, "org_a", null); return 200; } catch (ApiException e) { return e.status().value(); } });
            start.countDown();
            assertEquals(Set.of(200, 409), Set.of(decision.get(10, TimeUnit.SECONDS), withdrawal.get(10, TimeUnit.SECONDS)));
        }
        boolean withdrawn = "withdrawn".equals(plans.findByIdAndUser(id, buyer, "org_a").orElseThrow().status());
        assertEquals(withdrawn, lifecycle.withdrawal(id, "org_a") != null);
        assertEquals(!withdrawn, approvals.decision(id, "org_a") != null);
        assertEquals(withdrawn ? 0 : 1, lifecycle.unreadCount(buyer, "org_a"));
    }

    @Test void purchaseIsImmutableComputesExactActualCostAndUsesFrozenComparison() {
        decide("approved");
        var saved = lifecycle.recordPurchase(id, buyer, "org_a", purchase());
        assertEquals("purchased", saved.status());
        var actual = lifecycle.purchase(id, "org_a");
        assertEquals("Supplier A", actual.get("supplier")); assertEquals("Invoice 123", actual.get("note"));
        assertEquals(0, new BigDecimal("4725.6300").compareTo((BigDecimal) actual.get("total_usd")));
        assertNull(lifecycle.purchase(id, "org_b"));
        var comparison = lifecycle.comparison(saved, "org_a", actual);
        assertEquals(false, comparison.get("same_quantity"));
        assertEquals(new BigDecimal("10000"), comparison.get("reference_total"));
        assertEquals(0, new BigDecimal("5250").compareTo((BigDecimal) comparison.get("reference_total_for_actual_quantity")));
        assertEquals(0, new BigDecimal("-524.37").compareTo((BigDecimal) comparison.get("actual_minus_adjusted_reference")));
        error(409, () -> lifecycle.recordPurchase(id, buyer, "org_a", purchase()));
        error(409, () -> lifecycle.revise(id, buyer, "org_a"));
        assertFalse(plans.delete(id, buyer, "org_a"));
        assertEquals("approved", lifecycle.buyerNotifications(buyer, "org_a").getFirst().get("decision"));
    }

    @Test void invalidPurchaseFieldsAndSingaporeApprovalDateAreValidated() {
        decide("approved");
        // Approval was on 29 Oct SGT although UTC was still 28 Oct.
        var request = new PlanLifecycleService.PurchaseRequest(today.minusDays(1), " ", BigDecimal.ZERO, new BigDecimal("-1"), "x".repeat(2001));
        var error = assertThrows(ApiException.class, () -> lifecycle.recordPurchase(id, buyer, "org_a", request));
        assertEquals(422, error.status().value()); assertEquals(5, error.fieldErrors().size());
        error(422, () -> lifecycle.recordPurchase(id, buyer, "org_a", null));
        error(422, () -> lifecycle.recordPurchase(id, buyer, "org_a", new PlanLifecycleService.PurchaseRequest(today.plusDays(1), "A", BigDecimal.ONE, BigDecimal.ONE, null)));
        error(422, () -> lifecycle.recordPurchase(id, buyer, "org_a", new PlanLifecycleService.PurchaseRequest(today, "A", new BigDecimal("0.0000001"), BigDecimal.ONE, null)));
        error(422, () -> lifecycle.recordPurchase(id, buyer, "org_a", new PlanLifecycleService.PurchaseRequest(today, "A", BigDecimal.ONE, new BigDecimal("1e1000"), null)));
        assertNull(lifecycle.purchase(id, "org_a"));
        assertEquals("approved", plans.findByIdAndUser(id, buyer, "org_a").orElseThrow().status());
    }

    @Test void failedPurchaseInsertRollsBackAndConcurrentRecordsCannotDuplicate() throws Exception {
        decide("approved");
        jdbc.execute("ALTER TABLE purchase_records ADD CONSTRAINT fail_purchase CHECK (supplier <> 'Supplier A')");
        assertThrows(org.springframework.dao.DataAccessException.class, () -> lifecycle.recordPurchase(id, buyer, "org_a", purchase()));
        assertEquals("approved", plans.findByIdAndUser(id, buyer, "org_a").orElseThrow().status());
        jdbc.execute("ALTER TABLE purchase_records DROP CONSTRAINT fail_purchase");
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Integer> request = () -> { start.await(); try { lifecycle.recordPurchase(id, buyer, "org_a", purchase()); return 201; } catch (ApiException e) { return e.status().value(); } };
            var a = executor.submit(request); var b = executor.submit(request); start.countDown();
            assertEquals(Set.of(201, 409), Set.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS)));
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM purchase_records", Integer.class));
    }

    @Test void overdueApprovedPlansCanRecordAndReferenceOnlySnapshotsNeverInventAModelEstimate() {
        decide("approved");
        jdbc.update("UPDATE purchase_plans SET purchase_deadline=? WHERE plan_id=?", today.minusDays(1), id);
        jdbc.update("""
                UPDATE plan_approval_notifications SET recommendation_snapshot=? WHERE plan_id=?""",
                """
                {"analysis":{"cost_impact":{"status":"unavailable","reason":"unsupported_horizon"},
                "recommendation":{"status":"ready","value":{"evidence":{"buy_now_cost_usd":10000}}}}}
                """, id);
        var plan = lifecycle.recordPurchase(id, buyer, "org_a", purchase());
        var comparison = lifecycle.comparison(plan, "org_a", lifecycle.purchase(id, "org_a"));
        assertEquals(new BigDecimal("10000"), comparison.get("reference_total"));
        assertNull(comparison.get("central_total")); assertNull(comparison.get("actual_minus_estimate"));
    }
}
