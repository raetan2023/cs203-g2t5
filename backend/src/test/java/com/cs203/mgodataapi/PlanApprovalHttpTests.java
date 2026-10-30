package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:postgresql://localhost:5432/placeholder", "spring.datasource.username=placeholder", "spring.datasource.password=placeholder", "mgo.db.check-on-startup=false"})
@AutoConfigureMockMvc
class PlanApprovalHttpTests {
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean PlanApprovalService approvals;
    @MockitoBean PlanLifecycleService lifecycle;
    @MockitoBean UserAccounts users;
    @MockitoBean PurchasePlanRepository plans;
    @MockitoBean OperationalDate dates;
    final UUID id = UUID.randomUUID(), owner = UUID.randomUUID();
    final String path = "/api/v1/purchase-plans/" + id + "/submit";
    final String inbox = "/api/v1/purchase-plans/approval-notifications";
    RequestPostProcessor member(String org, String role) { return jwt().jwt(token -> token.subject("user_buyer").claim("o", Map.of("id", org, "rol", role))); }
    @BeforeEach void setup() { when(users.resolve("user_buyer", null)).thenReturn(owner); when(dates.today()).thenReturn(LocalDate.parse("2026-10-27")); }
    @Test void onlyBuyerWithVerifiedMembershipCanSubmit() throws Exception {
        mvc.perform(post(path)).andExpect(status().isUnauthorized());
        mvc.perform(post(path).with(jwt())).andExpect(status().isForbidden());
        for (String role : List.of("manager", "analyst", "admin", "unknown"))
            mvc.perform(post(path).with(member("org_a", role))).andExpect(status().isForbidden());
        verifyNoInteractions(approvals, users);
        when(approvals.submit(eq(id), eq(owner), eq("org_a"), any(PlanApprovalRequest.class))).thenReturn(new PurchasePlan(id, owner, BigDecimal.TEN,
                LocalDate.parse("2026-11-01"), LocalDate.parse("2026-10-27"), "submitted", Instant.parse("2026-10-27T08:00:00Z")));
        mvc.perform(post(path).contentType("application/json").content("{\"clerk_org_id\":\"org_attacker\",\"user_id\":\"attacker\"}").with(member("org_a", "buyer")))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.plan.status").value("submitted"));
        verify(approvals).submit(eq(id), eq(owner), eq("org_a"), any(PlanApprovalRequest.class));
    }
    @Test void submittedRecommendationHasTheSameOwnerAndOrganisationIsolationAsPlans() throws Exception {
        String endpoint = "/api/v1/purchase-plans/" + id + "/submission";
        mvc.perform(get(endpoint)).andExpect(status().isUnauthorized());
        mvc.perform(get(endpoint).with(member("org_a", "admin"))).andExpect(status().isForbidden());
        mvc.perform(get(endpoint).with(member("org_b", "buyer"))).andExpect(status().isNotFound());
        verifyNoInteractions(approvals);
        var saved = new PurchasePlan(id, owner, BigDecimal.TEN, LocalDate.parse("2026-11-01"), LocalDate.parse("2026-10-27"));
        when(plans.findByIdAndUser(id, owner, "org_a")).thenReturn(Optional.of(saved));
        when(plans.findByIdAndOrganisation(id, "org_a")).thenReturn(Optional.of(saved));
        when(approvals.submittedRecommendation(id, "org_a")).thenReturn(Map.of("horizon_days", 14));
        when(approvals.decision(id, "org_a")).thenReturn(Map.of("decision", "rejected", "comment", "Budget"));
        for (String role : List.of("buyer", "manager", "analyst"))
            mvc.perform(get(endpoint).with(member("org_a", role))).andExpect(status().isOk())
                    .andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(jsonPath("$.submission.horizon_days").value(14))
                    .andExpect(jsonPath("$.decision.comment").value("Budget"));
        mvc.perform(get(endpoint).with(member("org_b", "manager"))).andExpect(status().isNotFound());
    }

    @Test void inboxIsManagerOnlyAndUsesVerifiedOrganisation() throws Exception {
        mvc.perform(get(inbox)).andExpect(status().isUnauthorized());
        mvc.perform(get(inbox).with(jwt())).andExpect(status().isForbidden());
        for (String role : List.of("buyer", "analyst", "admin"))
            mvc.perform(get(inbox).with(member("org_a", role))).andExpect(status().isForbidden());
        verifyNoInteractions(approvals);
        when(approvals.notifications("org_a")).thenReturn(List.of(Map.of("plan_id", id.toString())));
        mvc.perform(get(inbox).param("clerk_org_id", "org_attacker").with(member("org_a", "manager")))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.notifications[0].plan_id").value(id.toString()));
        mvc.perform(get(inbox).with(member("org_b", "manager"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.notifications").isEmpty());
        verify(approvals).notifications("org_a"); verify(approvals).notifications("org_b");
    }
    @Test void submittedPlanCannotBeEditedOrDeletedByItsBuyer() throws Exception {
        when(plans.findByIdAndUser(id, owner, "org_a")).thenReturn(Optional.of(new PurchasePlan(id, owner, BigDecimal.TEN,
                LocalDate.parse("2026-11-01"), LocalDate.parse("2026-10-27"), "submitted", Instant.now())));
        mvc.perform(put("/api/v1/purchase-plans/" + id).with(member("org_a", "buyer"))
                .contentType("application/json").content("{\"quantity_mt\":20,\"purchase_deadline\":\"2026-11-01\"}"))
                .andExpect(status().isConflict());
        mvc.perform(delete("/api/v1/purchase-plans/" + id).with(member("org_a", "buyer"))).andExpect(status().isConflict());
    }
    @Test void decisionsAreManagerOnlyAndUseVerifiedActorAndOrganisation() throws Exception {
        String endpoint = "/api/v1/purchase-plans/" + id + "/decision";
        String input = "{\"decision\":\"approved\",\"comment\":\"Within budget\",\"approval_fingerprint\":\"" + "a".repeat(64) + "\",\"clerk_org_id\":\"org_attacker\",\"manager_clerk_user_id\":\"user_attacker\"}";
        mvc.perform(post(endpoint).contentType("application/json").content(input)).andExpect(status().isUnauthorized());
        mvc.perform(post(endpoint).with(jwt()).contentType("application/json").content(input)).andExpect(status().isForbidden());
        for (String role : List.of("buyer", "analyst", "admin", "unknown"))
            mvc.perform(post(endpoint).with(member("org_a", role)).contentType("application/json").content(input)).andExpect(status().isForbidden());
        verifyNoInteractions(approvals, users);
        when(approvals.decide(eq(id), eq("org_a"), eq(owner), eq("user_buyer"), eq("user_buyer"), any(PlanDecisionRequest.class)))
                .thenReturn(new PurchasePlan(id, owner, BigDecimal.TEN, LocalDate.parse("2026-11-01"), LocalDate.parse("2026-10-27"), "approved", Instant.parse("2026-10-27T08:00:00Z")));
        mvc.perform(post(endpoint).with(member("org_a", "manager")).contentType("application/json").content(input))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.plan.status").value("approved"));
        verify(approvals).decide(eq(id), eq("org_a"), eq(owner), eq("user_buyer"), eq("user_buyer"),
                argThat(request -> request.decision().equals("approved") && request.comment().equals("Within budget")));
    }

}
