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
class PlanLifecycleHttpTests {
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean PlanLifecycleService lifecycle;
    @MockitoBean PlanApprovalService approvals;
    @MockitoBean PurchasePlanRepository plans;
    @MockitoBean UserAccounts users;
    @MockitoBean OperationalDate dates;
    final UUID id = UUID.randomUUID(), buyer = UUID.randomUUID(), notification = UUID.randomUUID();
    final LocalDate today = LocalDate.parse("2026-10-29");
    final String root = "/api/v1/purchase-plans";
    RequestPostProcessor member(String role, String org) { return jwt().jwt(token -> token.subject("user_buyer").claim("o", Map.of("id", org, "rol", role))); }
    PurchasePlan plan(String state) { return new PurchasePlan(id, buyer, BigDecimal.TEN, today.plusDays(10), today.minusDays(1), state, Instant.parse("2026-10-28T08:00:00Z")); }
    @BeforeEach void setup() { when(users.resolve("user_buyer", null)).thenReturn(buyer); when(dates.today()).thenReturn(today); }

    @Test void allLifecycleWritesRequireAuthenticatedBuyerMembership() throws Exception {
        for (String suffix : List.of("/" + id + "/withdraw", "/" + id + "/revise", "/" + id + "/purchase", "/my-notifications/" + notification + "/seen")) {
            mvc.perform(post(root + suffix).contentType("application/json").content("{}")) .andExpect(status().isUnauthorized());
            mvc.perform(post(root + suffix).with(jwt()).contentType("application/json").content("{}")) .andExpect(status().isForbidden());
            for (String role : List.of("manager", "analyst", "admin", "unknown"))
                mvc.perform(post(root + suffix).with(member(role, "org_a")).contentType("application/json").content("{}")) .andExpect(status().isForbidden());
        }
        verifyNoInteractions(lifecycle, users);
    }

    @Test void notificationsAreBuyerOnlyAndIgnoreForgedScope() throws Exception {
        mvc.perform(get(root + "/my-notifications")).andExpect(status().isUnauthorized());
        for (String role : List.of("manager", "analyst", "admin", "unknown"))
            mvc.perform(get(root + "/my-notifications").with(member(role, "org_a"))).andExpect(status().isForbidden());
        verifyNoInteractions(lifecycle, users);
        when(lifecycle.buyerNotifications(buyer, "org_a")).thenReturn(List.of(Map.of("notification_id", notification.toString(), "decision", "rejected")));
        when(lifecycle.unreadCount(buyer, "org_a")).thenReturn(1L);
        mvc.perform(get(root + "/my-notifications").with(member("buyer", "org_a")).param("user_id", "attacker").param("clerk_org_id", "org_attacker"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.unread_count").value(1)).andExpect(jsonPath("$.notifications[0].decision").value("rejected"));
        mvc.perform(get(root + "/my-notifications").with(member("buyer", "org_b")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.notifications").isEmpty());
        mvc.perform(post(root + "/my-notifications/" + notification + "/seen").with(member("buyer", "org_a")))
                .andExpect(status().isNoContent()).andExpect(header().string("Cache-Control", "no-store"));
        verify(lifecycle).markSeen(notification, buyer, "org_a");
    }

    @Test void writesUseVerifiedOwnerAndOrganisationAndReturnActiveDate() throws Exception {
        when(lifecycle.withdraw(eq(id), eq(buyer), eq("org_a"), any())).thenReturn(plan("withdrawn"));
        when(lifecycle.revise(id, buyer, "org_a")).thenReturn(new PurchasePlan(UUID.randomUUID(), buyer, BigDecimal.TEN, today.plusDays(10), today, "draft", null, id));
        when(lifecycle.recordPurchase(eq(id), eq(buyer), eq("org_a"), any())).thenReturn(plan("purchased"));
        mvc.perform(post(root + "/" + id + "/withdraw").with(member("buyer", "org_a")).contentType("application/json")
                .content("{\"reason\":\"Changed schedule\",\"clerk_org_id\":\"org_attacker\",\"user_id\":\"attacker\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.plan.status").value("withdrawn"))
                .andExpect(jsonPath("$.plan.scenario_as_of_date").value(today.toString()));
        verify(lifecycle).withdraw(eq(id), eq(buyer), eq("org_a"), argThat(body -> "Changed schedule".equals(body.reason())));
        mvc.perform(post(root + "/" + id + "/revise").with(member("buyer", "org_a")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.plan.previous_plan_id").value(id.toString()))
                .andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(post(root + "/" + id + "/purchase").with(member("buyer", "org_a")).contentType("application/json")
                .content("{\"purchased_on\":\"2026-10-29\",\"supplier\":\"A\",\"quantity_mt\":5.25,\"price_usd_per_mt\":900.12,\"total_usd\":1,\"clerk_org_id\":\"org_attacker\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.plan.status").value("purchased"))
                .andExpect(header().string("Cache-Control", "no-store"));
        verify(lifecycle).recordPurchase(eq(id), eq(buyer), eq("org_a"), argThat(body -> body.quantity_mt().compareTo(new BigDecimal("5.25")) == 0
                && body.price_usd_per_mt().compareTo(new BigDecimal("900.12")) == 0));
    }

    @Test void domainErrorsHaveExpectedStatusAndFieldErrors() throws Exception {
        for (var status : List.of(org.springframework.http.HttpStatus.NOT_FOUND, org.springframework.http.HttpStatus.CONFLICT, org.springframework.http.HttpStatus.UNPROCESSABLE_CONTENT)) {
            when(lifecycle.withdraw(eq(id), eq(buyer), eq("org_a"), any())).thenThrow(new ApiException(status, "Reload or correct inputs", Map.of("reason", "Invalid reason")));
            mvc.perform(post(root + "/" + id + "/withdraw").with(member("buyer", "org_a")))
                    .andExpect(status().is(status.value())).andExpect(jsonPath("$.detail").value("Reload or correct inputs"))
                    .andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(jsonPath("$.field_errors.reason").value("Invalid reason"));
        }
        doThrow(new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "Not found"))
                .when(lifecycle).markSeen(notification, buyer, "org_b");
        mvc.perform(post(root + "/my-notifications/" + notification + "/seen").with(member("buyer", "org_b"))).andExpect(status().isNotFound());
    }

    @Test void malformedPurchaseFieldsReturn422WithoutCallingTheService() throws Exception {
        for (String body : List.of("{", "{\"purchased_on\":\"2026-02-31\"}", "{\"quantity_mt\":\"not-a-number\"}"))
            mvc.perform(post(root + "/" + id + "/purchase").with(member("buyer", "org_a")).contentType("application/json").content(body))
                    .andExpect(status().isUnprocessableContent()).andExpect(header().string("Cache-Control", "no-store"));
        verifyNoInteractions(lifecycle);
    }

    @Test void authorizedSubmissionReadersGetOutcomesButOtherBuyersAndOrganisationsDoNot() throws Exception {
        when(plans.findByIdAndUser(id, buyer, "org_a")).thenReturn(Optional.of(plan("purchased")));
        when(plans.findByIdAndOrganisation(id, "org_a")).thenReturn(Optional.of(plan("purchased")));
        when(lifecycle.purchase(id, "org_a")).thenReturn(Map.of("supplier", "A", "total_usd", new BigDecimal("9000")));
        when(lifecycle.revisions(id, "org_a")).thenReturn(List.of(UUID.randomUUID().toString()));
        for (String role : List.of("buyer", "manager", "analyst"))
            mvc.perform(get(root + "/" + id + "/submission").with(member(role, "org_a")))
                    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(jsonPath("$.purchase.supplier").value("A"))
                    .andExpect(jsonPath("$.revision_plan_ids.length()").value(1));
        mvc.perform(get(root + "/" + id + "/submission").with(member("admin", "org_a"))).andExpect(status().isForbidden());
        for (String role : List.of("buyer", "manager", "analyst"))
            mvc.perform(get(root + "/" + id + "/submission").with(member(role, "org_b"))).andExpect(status().isNotFound());
        when(users.resolve("user_buyer", null)).thenReturn(UUID.randomUUID());
        mvc.perform(get(root + "/" + id + "/submission").with(member("buyer", "org_a"))).andExpect(status().isNotFound());
        verify(lifecycle, never()).purchase(id, "org_b");
    }
}
