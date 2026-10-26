package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.json.JsonMapper;

/** Real local HTTP server, fixture prices, stubbed identity/database. No shared data is written. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:postgresql://localhost:5432/placeholder", "spring.datasource.username=placeholder",
    "spring.datasource.password=placeholder", "mgo.db.check-on-startup=false", "mgo.analysis.fixture-enabled=true" })
@ActiveProfiles("analysis-fixture")
class PlanAnalysisHttpTests {
    @Value("${local.server.port}") int port;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean UserAccounts users;
    @MockitoBean PurchasePlanRepository plans;
    final UUID owner = UUID.randomUUID(), other = UUID.randomUUID(), planId = UUID.randomUUID();
    final PurchasePlan plan = new PurchasePlan(planId, owner, new BigDecimal("100"), LocalDate.parse("2025-11-15"), LocalDate.parse("2025-09-01"));
    final HttpClient client = HttpClient.newHttpClient();
    @BeforeEach void setup() {
        when(decoder.decode("owner-token")).thenReturn(Jwt.withTokenValue("owner-token").header("alg", "RS256").subject("owner").build());
        when(decoder.decode("other-token")).thenReturn(Jwt.withTokenValue("other-token").header("alg", "RS256").subject("other").build());
        when(users.resolve("owner", null)).thenReturn(owner);
        when(users.resolve("other", null)).thenReturn(other);
        when(plans.findByIdAndUser(planId, owner)).thenReturn(Optional.of(plan));
        when(plans.findByIdAndUser(planId, other)).thenReturn(Optional.empty());
        when(plans.findByUser(owner)).thenReturn(java.util.List.of(plan));
    }
    String path(String endpoint) {
        return "/api/v1/purchase-plans/" + endpoint + "?plan_id=" + planId + "&quantity_mt=100&purchase_deadline=2025-11-15&scenario_as_of_date=2025-10-24";
    }
    HttpResponse<String> get(String path, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (token != null) request.header("Authorization", "Bearer " + token);
        return client.send(request.GET().build(), HttpResponse.BodyHandlers.ofString());
    }
    @Test void calculatesFixtureOverHttpWithoutGuidance() throws Exception {
        var response = get(path("cost-impact"), "owner-token");
        assertEquals(200, response.statusCode(), response.body());
        assertEquals("no-store", response.headers().firstValue("cache-control").orElse(""));
        var body = new JsonMapper().readTree(response.body());
        assertEquals("fixture", body.path("provenance").asText());
        assertEquals(70000, body.path("cost_impact").path("value").path("reference_total").asInt());
        assertEquals(-2000, body.path("cost_impact").path("value").path("difference_total").path("lower").asInt());
        assertEquals("2025-10-30", body.path("cost_impact").path("value").path("target_date").asText());
        assertEquals("unavailable", body.path("recommendation").path("status").asText());
        var recommendation = get(path("recommendation"), "owner-token");
        assertEquals(200, recommendation.statusCode());
        assertTrue(recommendation.body().contains("No approved recommendation provider"));
    }
    @Test void rejectsMissingAuthenticationAndOtherOwners() throws Exception {
        for (String endpoint : new String[]{"recommendation", "cost-impact"}) {
            assertEquals(401, get(path(endpoint), null).statusCode());
            assertEquals(404, get(path(endpoint), "other-token").statusCode());
        }
        verify(plans, never()).findByUser(any());
    }
    @Test void rejectsOldInputsAndScenario() throws Exception {
        for (String stale : new String[]{path("cost-impact").replace("quantity_mt=100", "quantity_mt=101"),
                path("cost-impact").replace("2025-10-24", "2025-10-25"),
                path("recommendation").replace("2025-11-15", "2025-11-16")})
            assertEquals(409, get(stale, "owner-token").statusCode());
    }
    @Test void anotherAccountWithItsOwnPlanCannotSelectTheFirstAccountsPlan() throws Exception {
        UUID otherPlanId = UUID.randomUUID();
        when(plans.findByIdAndUser(otherPlanId, other)).thenReturn(Optional.of(new PurchasePlan(otherPlanId, other, new BigDecimal("250"),
                plan.purchaseDeadline(), plan.scenarioAsOfDate())));
        assertEquals(404, get(path("cost-impact"), "other-token").statusCode());
        var response = get(path("cost-impact").replace(planId.toString(), otherPlanId.toString()).replace("quantity_mt=100", "quantity_mt=250"), "other-token");
        assertEquals(200, response.statusCode());
        var body = new JsonMapper().readTree(response.body());
        assertEquals(otherPlanId.toString(), body.path("context").path("plan_id").asText());
        assertEquals(175000, body.path("cost_impact").path("value").path("reference_total").asInt());
    }
    @Test void detectsDeletionDuringAnalysis() throws Exception {
        when(plans.findByIdAndUser(planId, owner)).thenReturn(Optional.of(plan), Optional.empty());
        assertEquals(409, get(path("cost-impact"), "owner-token").statusCode());
    }
    @Test void readsActiveScenarioInsteadOfStoredScenario() throws Exception {
        var body = new JsonMapper().readTree(get("/api/v1/purchase-plans", "owner-token").body());
        assertEquals(22, body.path("plans").get(0).path("days_remaining").asInt());
        assertEquals("2025-10-24", body.path("plans").get(0).path("scenario_as_of_date").asText());
    }
    @Test void selectsAnotherPlanOfTheSameOwner() throws Exception {
        UUID secondId = UUID.randomUUID();
        PurchasePlan second = new PurchasePlan(secondId, owner, new BigDecimal("250"),
                plan.purchaseDeadline(), plan.scenarioAsOfDate());
        when(plans.findByIdAndUser(secondId, owner)).thenReturn(Optional.of(second));
        var response = get(path("cost-impact").replace(planId.toString(), secondId.toString())
                .replace("quantity_mt=100", "quantity_mt=250"), "owner-token");
        assertEquals(200, response.statusCode());
        var body = new JsonMapper().readTree(response.body());
        assertEquals(secondId.toString(), body.path("context").path("plan_id").asText());
        assertEquals(175000, body.path("cost_impact").path("value").path("reference_total").asInt());
        assertEquals(404, get(path("cost-impact").replace(planId.toString(), UUID.randomUUID().toString()),
                "owner-token").statusCode());
    }
}
