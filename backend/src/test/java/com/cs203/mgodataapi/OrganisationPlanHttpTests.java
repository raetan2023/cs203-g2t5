package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:postgresql://localhost:5432/placeholder",
    "spring.datasource.username=placeholder", "spring.datasource.password=placeholder", "mgo.db.check-on-startup=false"})
@AutoConfigureMockMvc
class OrganisationPlanHttpTests {
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean UserAccounts users;
    @MockitoBean PurchasePlanRepository plans;
    @MockitoBean OperationalDate dates;
    @MockitoBean PlanAnalysisProvider provider;
    final UUID owner = UUID.randomUUID(), colleague = UUID.randomUUID(), id = UUID.randomUUID();
    final LocalDate today = LocalDate.parse("2026-10-27"), deadline = LocalDate.parse("2026-11-01");
    final String input = "{\"quantity_mt\":100,\"purchase_deadline\":\"2026-11-01\",\"clerk_org_id\":\"org_attacker\",\"user_id\":\"untrusted\"}";
    PurchasePlan plan(UUID planId, UUID creator) { return new PurchasePlan(planId, creator, new BigDecimal("100"), deadline, today); }
    RequestPostProcessor membership(String org, String role) {
        return jwt().jwt(t -> t.subject("user_buyer").claim("v", 2).claim("o", Map.of("id", org, "rol", role)));
    }
    @BeforeEach void setup() {
        when(dates.today()).thenReturn(today);
        when(users.resolve("user_buyer", null)).thenReturn(owner);
    }
    @Test void noSessionIs401AndMissingOrUnsupportedMembershipIs403() throws Exception {
        mvc.perform(get("/api/v1/organisation")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/purchase-plans")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/organisation").with(jwt().jwt(t -> t.subject("user").claim("app_role", "admin"))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.detail").exists());
        for (String role : List.of("member", "unknown")) {
            mvc.perform(get("/api/v1/purchase-plans").with(membership("org_a", role))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(plans, users);
    }
    @Test void capabilitiesReflectAllFourRolesWithoutImplicitAdminBusinessAccess() throws Exception {
        for (String role : List.of("buyer", "manager", "analyst", "admin")) {
            mvc.perform(get("/api/v1/organisation").with(membership("org_a", role)))
                    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(jsonPath("$.organisation_id").value("org_a"))
                    .andExpect(jsonPath("$.role").value("org:" + role))
                    .andExpect(jsonPath("$.can_read_plans").value(!role.equals("admin")))
                    .andExpect(jsonPath("$.can_write_plans").value(role.equals("buyer")));
        }
        verifyNoInteractions(plans, users);
    }
    @Test void buyerCanHaveMultiplePlansAndClientFieldsCannotOverrideTokenScope() throws Exception {
        var first = plan(id, owner);var second = plan(UUID.randomUUID(), owner);
        when(plans.findByUser(owner, "org_a")).thenReturn(List.of(first, second));
        when(plans.insert(owner, new BigDecimal("100"), deadline, today, "org_a")).thenReturn(first, second);
        mvc.perform(get("/api/v1/purchase-plans").with(membership("org_a", "buyer")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.plans.length()").value(2));
        for (int i = 0; i < 2; i++) {
            mvc.perform(post("/api/v1/purchase-plans").with(membership("org_a", "buyer"))
                    .contentType(MediaType.APPLICATION_JSON).content(input)).andExpect(status().isCreated());
        }
        verify(plans, times(2)).insert(owner, new BigDecimal("100"), deadline, today, "org_a");
        verify(plans, never()).findByOrganisation(anyString());
    }
    @Test void buyerCannotReadUpdateDeleteOrAnalyzeTheSameOwnersPlanInAnotherOrganisation() throws Exception {
        when(plans.findByIdAndUser(id, owner, "org_a")).thenReturn(Optional.of(plan(id, owner)));
        String path = "/api/v1/purchase-plans/" + id;
        mvc.perform(get(path).with(membership("org_a", "buyer"))).andExpect(status().isOk());
        mvc.perform(get(path).with(membership("org_b", "buyer"))).andExpect(status().isNotFound());
        mvc.perform(put(path).with(membership("org_b", "buyer")).contentType(MediaType.APPLICATION_JSON).content(input))
                .andExpect(status().isNotFound());
        mvc.perform(delete(path).with(membership("org_b", "buyer"))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/purchase-plans/cost-impact").with(membership("org_b", "buyer"))
                .param("plan_id", id.toString()).param("quantity_mt", "100")
                .param("purchase_deadline", deadline.toString()).param("scenario_as_of_date", today.toString()))
                .andExpect(status().isNotFound());
        verify(plans, times(4)).findByIdAndUser(id, owner, "org_b");
        verify(plans).update(id, owner, new BigDecimal("100"), deadline, today, "org_b");
        verify(plans).delete(id, owner, "org_b");
    }
    @Test void managersAndAnalystsReadOrganisationPlansButCannotMutateThem() throws Exception {
        when(plans.findByOrganisation("org_a")).thenReturn(List.of(plan(id, colleague)));
        when(plans.findByIdAndOrganisation(id, "org_a")).thenReturn(Optional.of(plan(id, colleague)));
        for (String role : List.of("manager", "analyst")) {
            mvc.perform(get("/api/v1/purchase-plans").with(membership("org_a", role)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.plans[0].plan_id").value(id.toString()));
            mvc.perform(get("/api/v1/purchase-plans/" + id).with(membership("org_a", role))).andExpect(status().isOk());
            mvc.perform(get("/api/v1/purchase-plans/" + id).with(membership("org_b", role))).andExpect(status().isNotFound());
            mvc.perform(post("/api/v1/purchase-plans").with(membership("org_a", role))
                    .contentType(MediaType.APPLICATION_JSON).content(input)).andExpect(status().isForbidden());
            mvc.perform(put("/api/v1/purchase-plans/" + id).with(membership("org_a", role))
                    .contentType(MediaType.APPLICATION_JSON).content(input)).andExpect(status().isForbidden());
            mvc.perform(delete("/api/v1/purchase-plans/" + id).with(membership("org_a", role))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(users);
        verify(plans, never()).insert(any(), any(), any(), any(), any());
        verify(plans, never()).update(any(), any(), any(), any(), any(), any());
        verify(plans, never()).delete(any(), any(), any());
    }
    @Test void recommendationPreservesUrgencyAndOrganisationReadPermissions() throws Exception {
        when(provider.provenance()).thenReturn("unavailable");
        when(provider.prices(eq(today), anyInt())).thenReturn(new PlanAnalysisProvider.Prices(today,
                PlanAnalysisProvider.Result.unavailable("missing_reference", "No current reference"),
                PlanAnalysisProvider.Result.unavailable("missing_forecast", "No current forecast")));
        when(plans.findByIdAndUser(id, owner, "org_a")).thenReturn(Optional.of(plan(id, owner)));
        when(plans.findByIdAndOrganisation(id, "org_a")).thenReturn(Optional.of(plan(id, colleague)));
        for (String role : List.of("buyer", "manager", "analyst")) {
            mvc.perform(get("/api/v1/purchase-plans/recommendation").with(membership("org_a", role))
                    .param("plan_id", id.toString()).param("quantity_mt", "100")
                    .param("purchase_deadline", deadline.toString()).param("scenario_as_of_date", today.toString())
                    .param("urgency", "HIGH"))
                    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(jsonPath("$.context.urgency").value("HIGH"))
                    .andExpect(jsonPath("$.recommendation.value.action").value("MONITOR"))
                    .andExpect(jsonPath("$.recommendation.value.evidence.urgency").value("HIGH"));
            mvc.perform(get("/api/v1/purchase-plans/recommendation").with(membership("org_b", role))
                    .param("plan_id", id.toString()).param("quantity_mt", "100")
                    .param("purchase_deadline", deadline.toString()).param("scenario_as_of_date", today.toString())
                    .param("urgency", "HIGH")).andExpect(status().isNotFound());
        }
        mvc.perform(get("/api/v1/purchase-plans/recommendation").with(membership("org_a", "admin")))
                .andExpect(status().isForbidden());
    }
    @Test void adminMembershipDoesNotBypassPlanPolicy() throws Exception {
        mvc.perform(get("/api/v1/purchase-plans").with(membership("org_a", "admin"))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/purchase-plans").with(membership("org_a", "admin"))
                .contentType(MediaType.APPLICATION_JSON).content(input)).andExpect(status().isForbidden());
        verifyNoInteractions(plans, users);
    }
}
