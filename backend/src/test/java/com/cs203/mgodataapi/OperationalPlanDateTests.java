package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class OperationalPlanDateTests {
    final PurchasePlanRepository plans = mock(PurchasePlanRepository.class);
    final UserAccounts users = mock(UserAccounts.class);
    final OperationalDate dates = mock(OperationalDate.class);
    final PlanAnalysisService analysis = mock(PlanAnalysisService.class);
    final UUID owner = UUID.randomUUID(), id = UUID.randomUUID();
    final LocalDate today = LocalDate.parse("2026-10-26");
    final Jwt token = Jwt.withTokenValue("test").header("alg", "RS256").subject("buyer").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer")).build();
    final PurchasePlanController controller = new PurchasePlanController(plans, users, dates, analysis);

    OperationalPlanDateTests() {
        when(users.resolve("buyer", null)).thenReturn(owner);
        when(dates.today()).thenReturn(today);
    }

    @Test void oldPlansRemainReadableAndBecomeOverdueWithoutChangingStoredDate() {
        var plan = new PurchasePlan(id, owner, BigDecimal.TEN, today.minusDays(2), LocalDate.parse("2025-10-24"));
        when(plans.findByUser(owner, "org_a")).thenReturn(List.of(plan));
        var response = controller.get(token).get("plans").get(0);
        assertEquals(-2L, response.get("days_remaining"));
        assertEquals(today.toString(), response.get("scenario_as_of_date"));
        assertEquals(LocalDate.parse("2025-10-24"), plan.scenarioAsOfDate());
        verify(plans, never()).update(any(), any(), any(), any(), any(), org.mockito.ArgumentMatchers.eq("org_a"));
    }

    @Test void todayIsValidButYesterdayCannotBeCreatedOrSaved() {
        var plan = new PurchasePlan(id, owner, BigDecimal.TEN, today, today);
        when(plans.insert(owner, BigDecimal.TEN, today, today, "org_a")).thenReturn(plan);
        assertEquals(201, controller.create(token, new PurchasePlanRequest(BigDecimal.TEN, today)).getStatusCode().value());
        assertThrows(ApiException.class, () -> controller.create(token, new PurchasePlanRequest(BigDecimal.TEN, today.minusDays(1))));
        assertThrows(ApiException.class, () -> controller.update(id, token, new PurchasePlanRequest(BigDecimal.TEN, today.minusDays(1))));
        verify(plans, never()).update(any(), any(), any(), any(), any(), org.mockito.ArgumentMatchers.eq("org_a"));
    }

    @Test void discardsAnalysisThatCrossesSingaporeMidnight() {
        var plan = new PurchasePlan(id, owner, BigDecimal.TEN, today.plusDays(3), today);
        when(plans.findByIdAndUser(id, owner, "org_a")).thenReturn(Optional.of(plan));
        when(dates.today()).thenReturn(today, today.plusDays(1));
        when(analysis.read(any(), anyBoolean())).thenReturn(Map.of());
        var request = mock(jakarta.servlet.http.HttpServletRequest.class);
        when(request.getRequestURI()).thenReturn("/api/v1/purchase-plans/recommendation");
        assertThrows(ApiException.class, () -> controller.analyze(token, id, BigDecimal.TEN, plan.purchaseDeadline(), today, request));
    }
}
