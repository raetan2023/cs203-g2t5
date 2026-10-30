package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.*;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Real row locks and rollback in an isolated PostgreSQL-mode database; no shared data writes. */
class PlanApprovalServiceTests {
    JdbcTemplate jdbc;
    PurchasePlanRepository plans;
    PlanApprovalService approvals;
    PlanAnalysisService analysis;
    PlanApprovalRequest choice;
    final UUID run = UUID.randomUUID();
    final java.util.concurrent.atomic.AtomicReference<BigDecimal> central = new java.util.concurrent.atomic.AtomicReference<>(new BigDecimal("1001"));
    final UUID owner = UUID.randomUUID(), id = UUID.randomUUID();
    final Instant now = Instant.parse("2026-10-27T08:00:00Z");
    final LocalDate today = LocalDate.parse("2026-10-27");

    @BeforeEach void setup() {
        var source = new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(source) {
            // H2 interprets CAST(string AS JSONB) as a JSON string literal, unlike PostgreSQL.
            // Store the same verified JSON text while keeping transactions and row locks real.
            @Override public int update(String sql, Object... values) {
                return super.update(sql.replace("CAST(? AS jsonb)", "?"), values);
            }
        };
        jdbc.execute("CREATE TABLE purchase_plans (plan_id UUID PRIMARY KEY, user_id UUID NOT NULL, quantity_mt NUMERIC NOT NULL, purchase_deadline DATE NOT NULL, scenario_as_of_date DATE NOT NULL, clerk_org_id TEXT, status TEXT NOT NULL DEFAULT 'draft', submitted_at TIMESTAMP WITH TIME ZONE, previous_plan_id UUID)");
        jdbc.execute("CREATE TABLE plan_approval_notifications (notification_id UUID PRIMARY KEY, plan_id UUID NOT NULL UNIQUE REFERENCES purchase_plans(plan_id), clerk_org_id TEXT NOT NULL, buyer_user_id UUID NOT NULL, created_at TIMESTAMP WITH TIME ZONE NOT NULL, recommendation_snapshot TEXT)");
        jdbc.execute("CREATE TABLE plan_approval_decisions (decision_id UUID PRIMARY KEY, plan_id UUID NOT NULL UNIQUE REFERENCES purchase_plans(plan_id), clerk_org_id TEXT NOT NULL, manager_user_id UUID NOT NULL, manager_clerk_user_id TEXT NOT NULL, manager_label TEXT NOT NULL, decision TEXT NOT NULL, decision_comment TEXT NOT NULL, decided_at TIMESTAMP WITH TIME ZONE NOT NULL)");
        jdbc.execute("CREATE TABLE plan_decision_notifications (notification_id UUID PRIMARY KEY, plan_id UUID UNIQUE REFERENCES purchase_plans(plan_id), clerk_org_id TEXT NOT NULL, buyer_user_id UUID NOT NULL, decision TEXT NOT NULL, created_at TIMESTAMP WITH TIME ZONE NOT NULL, seen_at TIMESTAMP WITH TIME ZONE)");
        plans = new PurchasePlanRepository(jdbc);
        OperationalDate dates = mock(OperationalDate.class);
        when(dates.today()).thenReturn(today);
        var provider = new PlanAnalysisProvider() {
            public String provenance() { return "model"; }
            public Prices prices(LocalDate date) { return prices(date, 7); }
            public Prices prices(LocalDate date, int horizon) {
                var basis = new Basis("Singapore MGO", "USD", "MT");
                return new Prices(date, Result.ready(new Reference(new BigDecimal("1000"), date, basis)),
                    Result.ready(new Forecast(new Range(new BigDecimal("950"), new BigDecimal("1050")), date.plusDays(horizon), basis,
                        "Experimental range", horizon + " calendar days", central.get(), run, "ridge-test")));
            }
            public Recommendation recommendation(PlanAnalysisService.Context context) { throw new UnsupportedOperationException(); }
        };
        analysis = new PlanAnalysisService(provider);
        var proxy = new ProxyFactory(new PlanApprovalService(plans, jdbc, dates, Clock.fixed(now, ZoneOffset.UTC), analysis,
                tools.jackson.databind.json.JsonMapper.builder().build()));
        proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(source), new AnnotationTransactionAttributeSource()));
        approvals = (PlanApprovalService) proxy.getProxy();
        jdbc.update("INSERT INTO purchase_plans VALUES (?, ?, ?, ?, ?, ?, 'draft', NULL, NULL)", id, owner, BigDecimal.TEN, today.plusDays(40), today, "org_a");
        choice = selection(7, "NORMAL");
    }
    PurchasePlan submit(UUID planId, UUID buyer, String org) { return approvals.submit(planId, buyer, org, choice); }

    PlanApprovalRequest selection(int horizon, String urgency) {
        var context = PlanAnalysisService.Context.of(plans.findByIdAndUser(id, owner, "org_a").orElseThrow(), today).withUrgency(urgency);
        var data = analysis.read(context, false, horizon, run);
        var guidance = (PlanAnalysisProvider.Guidance)((PlanAnalysisProvider.Result<?>) data.get("recommendation")).value();
        return new PlanApprovalRequest(horizon, run, guidance.recommendation_id(), (String)data.get("approval_fingerprint"), urgency,
                context.quantity_mt(), context.purchase_deadline(), context.scenario_as_of_date());
    }

    @Test void ownedValidDraftCreatesOneDurableOrganisationNotification() {
        var saved = submit(id, owner, "org_a");
        assertEquals("submitted", saved.status()); assertEquals(now, saved.submittedAt());
        assertEquals("submitted", plans.findByIdAndUser(id, owner, "org_a").orElseThrow().status());
        var inbox = approvals.notifications("org_a");
        assertEquals(1, inbox.size()); assertEquals(id.toString(), inbox.getFirst().get("plan_id"));
        assertEquals(now.toString(), inbox.getFirst().get("created_at"));
        assertTrue(approvals.notifications("org_b").isEmpty());
        assertEquals(409, assertThrows(ApiException.class, () -> submit(id, owner, "org_a")).status().value());
        assertEquals(1, approvals.notifications("org_a").size());
        assertFalse(plans.delete(id, owner, "org_a"));
    }
    @Test void selectionIsFrozenAndCannotBeReplacedByNewForecasts() {
        choice = selection(14, "HIGH");
        submit(id, owner, "org_a");
        var saved = approvals.submittedRecommendation(id, "org_a");
        assertEquals(14, saved.get("horizon_days"));
        String original = saved.toString();
        central.set(new BigDecimal("1200"));
        assertEquals(original, approvals.submittedRecommendation(id, "org_a").toString());
        assertNull(approvals.submittedRecommendation(id, "org_b"));
        assertTrue(original.contains("HIGH")); assertTrue(original.contains("1001"));
    }
    @Test void missingSelectionStaleForecastForgedRecommendationAndChangedInputsAreRejected() {
        assertEquals(422, assertThrows(ApiException.class, () -> approvals.submit(id, owner, "org_a", null)).status().value());
        var forged = new PlanApprovalRequest(7, run, "forged", choice.approval_fingerprint(), "NORMAL", choice.quantity_mt(), choice.purchase_deadline(), today);
        assertEquals(409, assertThrows(ApiException.class, () -> approvals.submit(id, owner, "org_a", forged)).status().value());
        var wrongRun = new PlanApprovalRequest(7, UUID.randomUUID(), choice.recommendation_id(), choice.approval_fingerprint(), "NORMAL", choice.quantity_mt(), choice.purchase_deadline(), today);
        assertEquals(409, assertThrows(ApiException.class, () -> approvals.submit(id, owner, "org_a", wrongRun)).status().value());
        central.set(new BigDecimal("1300"));
        assertEquals(409, assertThrows(ApiException.class, () -> submit(id, owner, "org_a")).status().value());
        central.set(new BigDecimal("1001"));
        jdbc.update("UPDATE purchase_plans SET quantity_mt=20 WHERE plan_id=?", id);
        assertEquals(409, assertThrows(ApiException.class, () -> submit(id, owner, "org_a")).status().value());
        assertEquals("draft", plans.findByIdAndUser(id, owner, "org_a").orElseThrow().status());
        assertTrue(approvals.notifications("org_a").isEmpty());
    }
    @Test void wrongOwnerWrongOrganisationAndMissingPlanAreNotFound() {
        assertEquals(404, assertThrows(ApiException.class, () -> submit(id, UUID.randomUUID(), "org_a")).status().value());
        assertEquals(404, assertThrows(ApiException.class, () -> submit(id, owner, "org_b")).status().value());
        assertEquals(404, assertThrows(ApiException.class, () -> submit(UUID.randomUUID(), owner, "org_a")).status().value());
        assertTrue(approvals.notifications("org_a").isEmpty());
    }
    @Test void invalidStoredQuantityExpiredDeadlineAndFinalStatesAreRejected() {
        jdbc.update("UPDATE purchase_plans SET purchase_deadline = ? WHERE plan_id = ?", today.minusDays(1), id);
        assertEquals(422, assertThrows(ApiException.class, () -> submit(id, owner, "org_a")).status().value());
        jdbc.update("UPDATE purchase_plans SET purchase_deadline = ?, quantity_mt = 0 WHERE plan_id = ?", today, id);
        assertEquals(422, assertThrows(ApiException.class, () -> submit(id, owner, "org_a")).status().value());
        for (String state : java.util.List.of("submitted", "approved", "rejected")) {
            jdbc.update("UPDATE purchase_plans SET quantity_mt = 10, status = ?, submitted_at = ? WHERE plan_id = ?", state, java.sql.Timestamp.from(now), id);
            assertEquals(409, assertThrows(ApiException.class, () -> submit(id, owner, "org_a")).status().value());
        }
        assertTrue(approvals.notifications("org_a").isEmpty());
    }
    @Test void failureToStoreNotificationRollsBackSubmission() {
        jdbc.execute("ALTER TABLE plan_approval_notifications ADD CONSTRAINT simulate_failure CHECK (clerk_org_id <> 'org_a')");
        assertThrows(org.springframework.dao.DataAccessException.class, () -> submit(id, owner, "org_a"));
        var plan = plans.findByIdAndUser(id, owner, "org_a").orElseThrow();
        assertEquals("draft", plan.status()); assertNull(plan.submittedAt());
        assertTrue(approvals.notifications("org_a").isEmpty());
    }
    @Test void simultaneousSubmissionsProduceOnlyOneNotification() throws Exception {
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Integer> request = () -> { start.await(); try { submit(id, owner, "org_a"); return 200; } catch (ApiException conflict) { return conflict.status().value(); } };
            var first = executor.submit(request); var second = executor.submit(request); start.countDown();
            var results = java.util.List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
            assertTrue(results.contains(200)); assertTrue(results.contains(409));
        }
        assertEquals(1, approvals.notifications("org_a").size());
    }
    PurchasePlan decide(String result, String comment, String org, String subject) {
        return approvals.decide(id, org, UUID.randomUUID(), subject, "Test Manager", new PlanDecisionRequest(result, comment, choice.approval_fingerprint()));
    }
    @Test void approvalAndItsActorTimeAndCommentArePersistedWithoutChangingTheSnapshot() {
        submit(id, owner, "org_a");
        String frozen = approvals.submittedRecommendation(id, "org_a").toString();
        var decided = decide("approved", "  Fits the budget.  ", "org_a", "user_managerA");
        assertEquals("approved", decided.status()); assertEquals(now, decided.submittedAt());
        var audit = approvals.decision(id, "org_a");
        assertEquals("approved", audit.get("decision")); assertEquals("Fits the budget.", audit.get("comment"));
        assertEquals("user_managerA", audit.get("manager_clerk_user_id")); assertEquals(now.toString(), audit.get("decided_at"));
        assertEquals(frozen, approvals.submittedRecommendation(id, "org_a").toString());
        assertNull(approvals.decision(id, "org_b"));
        assertEquals(409, assertThrows(ApiException.class, () -> decide("rejected", "A later opinion", "org_a", "user_managerB")).status().value());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM plan_approval_decisions", Integer.class));
        assertFalse(plans.delete(id, owner, "org_a"));
    }
    @Test void rejectionNeedsAReasonAndOnlySubmittedRequestsCanBeDecided() {
        assertEquals(409, assertThrows(ApiException.class, () -> decide("approved", "", "org_a", "user_managerA")).status().value());
        submit(id, owner, "org_a");
        assertEquals(404, assertThrows(ApiException.class, () -> decide("approved", "", "org_b", "user_managerA")).status().value());
        assertEquals(422, assertThrows(ApiException.class, () -> decide("rejected", " \n\t ", "org_a", "user_managerA")).status().value());
        assertEquals(422, assertThrows(ApiException.class, () -> decide("draft", "", "org_a", "user_managerA")).status().value());
        assertEquals(422, assertThrows(ApiException.class, () -> decide("approved", "x".repeat(2001), "org_a", "user_managerA")).status().value());
        assertEquals("submitted", plans.findByIdAndUser(id, owner, "org_a").orElseThrow().status());
        assertNull(approvals.decision(id, "org_a"));
        assertEquals("rejected", decide("rejected", "Outside the approved budget", "org_a", "user_managerA").status());
        assertEquals("Outside the approved budget", approvals.decision(id, "org_a").get("comment"));
    }
    @Test void reviewedFingerprintMustMatchTheSavedChoiceButNewLiveForecastsDoNotInvalidateIt() {
        submit(id, owner, "org_a");
        var bad = new PlanDecisionRequest("approved", "", "f".repeat(64));
        assertEquals(409, assertThrows(ApiException.class, () -> approvals.decide(id, "org_a", UUID.randomUUID(), "user_managerA", "Manager", bad)).status().value());
        central.set(new BigDecimal("1700"));
        assertEquals("approved", decide("approved", "", "org_a", "user_managerA").status());
    }
    @Test void auditInsertFailureRollsBackTheFinalStatus() {
        submit(id, owner, "org_a");
        jdbc.execute("ALTER TABLE plan_approval_decisions ADD CONSTRAINT simulate_audit_failure CHECK (clerk_org_id <> 'org_a')");
        assertThrows(org.springframework.dao.DataAccessException.class, () -> decide("approved", "", "org_a", "user_managerA"));
        assertEquals("submitted", plans.findByIdAndUser(id, owner, "org_a").orElseThrow().status());
        assertNull(approvals.decision(id, "org_a"));
    }
    @Test void competingManagersGetOneFinalDecisionAndOneAuditRecord() throws Exception {
        submit(id, owner, "org_a");
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var approval = executor.submit(() -> { start.await(); try { decide("approved", "", "org_a", "user_managerA"); return 200; } catch (ApiException e) { return e.status().value(); } });
            var rejection = executor.submit(() -> { start.await(); try { decide("rejected", "Budget issue", "org_a", "user_managerB"); return 200; } catch (ApiException e) { return e.status().value(); } });
            start.countDown();
            var results = java.util.List.of(approval.get(10, TimeUnit.SECONDS), rejection.get(10, TimeUnit.SECONDS));
            assertTrue(results.contains(200)); assertTrue(results.contains(409));
        }
        var audit = approvals.decision(id, "org_a");
        assertEquals(audit.get("decision"), plans.findByIdAndUser(id, owner, "org_a").orElseThrow().status());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM plan_approval_decisions", Integer.class));
    }

    @Test void planRecommendationIsIndependentOfCostHorizonAndAllInputsAreFrozen() {
        var seven = selection(7, "NORMAL"); var fourteen = selection(14, "NORMAL");
        assertEquals(seven.recommendation_id(), fourteen.recommendation_id());
        assertNotEquals(seven.approval_fingerprint(), fourteen.approval_fingerprint());
        approvals.submit(id, owner, "org_a", fourteen);
        var saved = approvals.submittedRecommendation(id, "org_a");
        var payload = (java.util.Map<?, ?>)saved.get("analysis");
        assertEquals(3, ((java.util.List<?>)payload.get("recommendation_inputs")).size());
        assertEquals(14, saved.get("horizon_days"));
    }
    @Test void shortDeadlineBuyNowCanBeSubmittedWithoutInventingAForecastCost() {
        jdbc.update("UPDATE purchase_plans SET purchase_deadline=? WHERE plan_id=?", today.plusDays(3), id);
        choice = selection(7, "NORMAL");
        assertEquals("submitted", submit(id, owner, "org_a").status());
        var payload = (java.util.Map<?, ?>)approvals.submittedRecommendation(id, "org_a").get("analysis");
        assertEquals("unavailable", ((java.util.Map<?, ?>)payload.get("cost_impact")).get("status"));
        assertEquals("BUY_NOW", ((java.util.Map<?, ?>)((java.util.Map<?, ?>)payload.get("recommendation")).get("value")).get("action"));
    }

}
