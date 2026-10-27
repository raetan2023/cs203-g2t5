package com.cs203.mgodataapi;

import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

// A placeholder database connection is enough for these tests: Hikari only dials out on
// first use, and the database-backed parts are stubbed below. The token decoder is stubbed
// too, so the suite never depends on the identity provider being reachable.
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:postgresql://localhost:5432/placeholder",
        "spring.datasource.username=placeholder",
        "spring.datasource.password=placeholder",
        "mgo.db.check-on-startup=false",
        // A hosted dev origin, to prove they can be added without a second CORS class.
        "mgo.frontend-origins=http://127.0.0.1:5173,http://localhost:5173,https://example.app.github.dev"})
@org.springframework.test.context.ActiveProfiles("test")
@AutoConfigureMockMvc
class MgoDataApiApplicationTests {
    @MockitoBean OperationalDate operationalDate;

    private static final String KEY = "mgo_public_demo_2026";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private UserAccounts users;

    @MockitoBean
    private PurchasePlanRepository plans;

    @MockitoBean
    private MarketDataStore marketData;

    @MockitoBean
    private ForecastRepository forecasts;

    @MockitoBean
    private PurchaseForecastRepository purchaseForecasts;


    @Test void publishedForecastRequiresClerkAndFailsClosedWithoutPublication() throws Exception {
        mvc.perform(get("/api/v1/forecast")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/forecast").header("X-API-Key", KEY)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/forecast").with(jwt())).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/forecast").with(jwt().jwt(token -> token.subject("buyer")
                        .claim("o", java.util.Map.of("id", "org_a", "rol", "buyer")))))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.status").value("unavailable"))
                .andExpect(jsonPath("$.reason").value("missing_run"))
                .andExpect(jsonPath("$.forecast").doesNotExist());
        mvc.perform(get("/api/v1/forecast?horizon_days=5").with(jwt().jwt(token ->
                        token.claim("o", java.util.Map.of("id", "org_a", "rol", "buyer")))))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test void experimentalPurchaseForecastUsesAnAuthenticatedSeparateRoute() throws Exception {
        mvc.perform(get("/api/v1/purchase-plans/forecast")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/purchase-plans/forecast").header("X-API-Key", KEY)).andExpect(status().isUnauthorized());
        // No stored news is supplied by this test repository; do not fabricate a range.
        mvc.perform(get("/api/v1/purchase-plans/forecast").with(jwt().jwt(token -> token.claim("o", java.util.Map.of("id", "org_a", "rol", "buyer")))))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.status").value("unavailable"))
                .andExpect(jsonPath("$.reason").value("missing_previous_day_news"));
        mvc.perform(get("/api/v1/purchase-plans/forecast?horizon_days=5").with(jwt().jwt(token -> token.claim("o", java.util.Map.of("id", "org_a", "rol", "buyer")))))
                .andExpect(status().isUnprocessableEntity());
    }

    @BeforeEach
    void storedMarketData() {
        when(operationalDate.today()).thenReturn(LocalDate.parse("2025-10-24"));
        for (String source : Source.ALL.keySet()) {
            when(marketData.availability(source)).thenReturn(Map.of(
                    "available", true, "records", 2L, "start", "2026-10-13", "end", "2026-10-14"));
        }
        when(marketData.rows("brent", null, null, null, 2)).thenReturn(List.of(
                Map.of("date", "2026-10-13", "value", new BigDecimal("125.78"),
                        "series", "brent", "source", "FRED", "unit", "USD/barrel"),
                Map.of("date", "2026-10-14", "value", new BigDecimal("126.55"),
                        "series", "brent", "source", "FRED", "unit", "USD/barrel")));
        when(marketData.rows("brent", null, null, null, 1)).thenReturn(List.of(
                Map.of("date", "2026-10-14", "value", new BigDecimal("126.55"),
                        "series", "brent", "source", "FRED, verified", "unit", "USD/barrel")));
    }

    @Test
    void defaultAnalysisIsExplicitlyUnavailable() throws Exception {
        UUID owner = UUID.randomUUID(), planId = UUID.randomUUID();
        when(users.resolve("analysis_owner", null)).thenReturn(owner);
        when(plans.findByIdAndUser(planId, owner, "org_a")).thenReturn(Optional.of(new PurchasePlan(planId, owner,
                new BigDecimal("100"), LocalDate.parse("2025-11-15"), LocalDate.parse("2025-10-24"))));
        for (String section : new String[]{"recommendation", "cost-impact"}) {
            mvc.perform(get("/api/v1/purchase-plans/" + section)
                    .param("plan_id", planId.toString()).param("quantity_mt", "100")
                    .param("purchase_deadline", "2025-11-15").param("scenario_as_of_date", "2025-10-24")
                    .with(jwt().jwt(token -> token.subject("analysis_owner").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer")))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.provenance").value("unavailable"))
                    .andExpect(jsonPath("$.recommendation.status").value(section.equals("recommendation") ? "ready" : "unavailable"))
                    .andExpect(jsonPath("$.cost_impact.status").value("unavailable"));
        }
    }

    @Test
    void homeHealthAndDocsArePublic() throws Exception {
        mvc.perform(get("/")).andExpect(status().isOk());
        mvc.perform(get("/health")).andExpect(jsonPath("$.status").value("ok"));
        mvc.perform(get("/openapi.json")).andExpect(status().isOk());
    }

    @Test
    void dataRequiresAKeyAndReturnsStoredData() throws Exception {
        mvc.perform(get("/api/v1/sources")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/sources").header("X-API-Key", KEY))
                .andExpect(jsonPath("$.sources[?(@.id == 'brent')].records").value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.greaterThan(0))));
        mvc.perform(get("/api/v1/data/brent?limit=2").header("X-API-Key", KEY))
                .andExpect(jsonPath("$.count").value(2))
                .andExpect(jsonPath("$.data[1].value").value(126.55));
        mvc.perform(get("/api/v1/data/brent?limit=1&format=csv").header("X-API-Key", KEY))
                .andExpect(content().string(startsWith("date,value,series,source,unit\n")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"FRED, verified\"")));
    }

    @Test
    void dataPassesFiltersToDatabaseAndRejectsReversedDates() throws Exception {
        mvc.perform(get("/api/v1/data/bunker_sales?start=2026-01-01&end=2026-08-01"
                + "&series=bunker_sales_marine_diesel_oil&limit=20").header("X-API-Key", KEY))
                .andExpect(status().isOk());
        verify(marketData).rows("bunker_sales", LocalDate.parse("2026-01-01"),
                LocalDate.parse("2026-08-01"), "bunker_sales_marine_diesel_oil", 20);
        mvc.perform(get("/api/v1/data/brent?start=2026-10-14&end=2026-10-13")
                .header("X-API-Key", KEY)).andExpect(status().isUnprocessableContent());
    }

    @Test
    void missingStoredSourceReturnsEmptyAndDatabaseOutageReturns503() throws Exception {
        when(marketData.rows("gasoil_singapore", null, null, null, 5000)).thenReturn(List.of());
        mvc.perform(get("/api/v1/data/gasoil_singapore").header("X-API-Key", KEY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(0))
                .andExpect(jsonPath("$.data").isEmpty());
        var unavailable = new ApiException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                "Stored market data is unavailable. Check the backend database connection.");
        when(marketData.rows("brent", null, null, null, 5000)).thenThrow(unavailable);
        mvc.perform(get("/api/v1/data/brent").header("X-API-Key", KEY))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.detail").value(unavailable.getMessage()));
        when(marketData.availability("brent")).thenThrow(unavailable);
        mvc.perform(get("/api/v1/sources").header("X-API-Key", KEY))
                .andExpect(status().isServiceUnavailable());
        mvc.perform(get("/")).andExpect(status().isServiceUnavailable());
        mvc.perform(get("/health")).andExpect(status().isOk());
    }

    @Test
    void rejectsUnknownSourcesAndBadParameters() throws Exception {
        mvc.perform(get("/api/v1/data/nope").header("X-API-Key", KEY)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/data/brent?limit=0").header("X-API-Key", KEY)).andExpect(status().isUnprocessableContent());
        mvc.perform(get("/api/v1/data/brent?format=xml").header("X-API-Key", KEY)).andExpect(status().isUnprocessableContent());
    }

    /** Without a valid token the plan routes say so in the API's own error shape. */
    @Test
    void purchasePlanRejectsRequestsWithoutAValidToken() throws Exception {
        mvc.perform(get("/api/v1/purchase-plans"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Please sign in again."));
        // A shared key is not a substitute for signing in.
        mvc.perform(get("/api/v1/purchase-plans").header("X-API-Key", KEY))
                .andExpect(status().isUnauthorized());
        // An unreadable or expired token is rejected by the decoder, as in production.
        when(jwtDecoder.decode("not-a-token")).thenThrow(new BadJwtException("malformed token"));
        mvc.perform(get("/api/v1/purchase-plans").header("Authorization", "Bearer not-a-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Please sign in again."));
    }

    /** A signed-in caller reaches only the plan belonging to their own user record. */
    @Test
    void purchasePlanUsesTheUserBehindTheToken() throws Exception {
        UUID userId = UUID.fromString("8a9d4260-9070-4bb1-b5af-a71f458a3f47");
        when(users.resolve("user_2abc", null)).thenReturn(userId);
        when(plans.findByUser(userId, "org_a")).thenReturn(List.of(new PurchasePlan(
                UUID.randomUUID(), userId, new BigDecimal("500"),
                LocalDate.parse("2025-11-15"), LocalDate.parse("2025-10-24"))));

        mvc.perform(get("/api/v1/purchase-plans").with(jwt().jwt(token -> token.subject("user_2abc").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plans[0].days_remaining").value(22));
    }

    /** Somebody signing in for the first time gets a user record rather than a failure. */
    @Test
    void firstRequestFromANewAccountCreatesItsUserRecord() throws Exception {
        UUID userId = UUID.randomUUID();
        when(users.resolve("user_new", null)).thenReturn(userId);
        when(plans.findByUser(userId, "org_a")).thenReturn(List.of());

        mvc.perform(get("/api/v1/purchase-plans").with(jwt().jwt(token -> token.subject("user_new").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plans").isEmpty());
        verify(users).resolve("user_new", null);
    }

    /** Plans are saved against the token's user, never a value the caller supplies. */
    @Test
    void createSavesAgainstTheTokensUser() throws Exception {
        UUID userId = UUID.randomUUID();
        when(users.resolve("user_2abc", null)).thenReturn(userId);
        when(plans.findByUser(userId, "org_a")).thenReturn(List.of());
        when(plans.insert(any(), any(), any(), any(), org.mockito.ArgumentMatchers.eq("org_a"))).thenReturn(new PurchasePlan(
                UUID.randomUUID(), userId, new BigDecimal("500"),
                LocalDate.parse("2025-11-15"), LocalDate.parse("2025-10-24")));

        mvc.perform(post("/api/v1/purchase-plans")
                        .with(jwt().jwt(token -> token.subject("user_2abc").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer"))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity_mt\": 500, \"purchase_deadline\": \"2025-11-15\"}"))
                .andExpect(status().isCreated());
        verify(plans).insert(userId, new BigDecimal("500"),
                LocalDate.parse("2025-11-15"), LocalDate.parse("2025-10-24"), "org_a");
    }

    /** Field errors still reach the form when the caller is signed in. */
    @Test
    void rejectsAQuantityOfZeroOrLess() throws Exception {
        when(users.resolve("user_2abc", null)).thenReturn(UUID.randomUUID());

        mvc.perform(post("/api/v1/purchase-plans")
                        .with(jwt().jwt(token -> token.subject("user_2abc").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer"))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity_mt\": -5, \"purchase_deadline\": \"2025-11-15\"}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.field_errors.quantity_mt").value("Quantity must be greater than zero."));
    }

    @Test
    void configReportsTheScenarioDate() throws Exception {
        mvc.perform(get("/api/v1/config").header("X-API-Key", KEY))
                .andExpect(jsonPath("$.scenario_as_of_date").value("2025-10-24"));
    }

    /** The browser's preflight must pass the API key filter and be answered for the dev origin. */
    @Test
    void allowsTheFrontendDevServerOrigin() throws Exception {
        mvc.perform(options("/api/v1/purchase-plans")
                        .header("Origin", "http://127.0.0.1:5173")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type,x-api-key,x-user-id"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://127.0.0.1:5173"));
        mvc.perform(options("/api/v1/purchase-plans")
                        .header("Origin", "http://evil.example.com")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
        // Hosted dev environments reach the API routes, which a /** mapping would not cover.
        mvc.perform(options("/api/v1/market/dashboard")
                        .header("Origin", "https://example.app.github.dev")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://example.app.github.dev"));
    }

    @Test
    void listsMultiplePlansAndAllowsAnotherCreation() throws Exception {
        UUID owner = UUID.randomUUID();
        PurchasePlan first = plan(owner);
        PurchasePlan second = plan(owner);
        when(users.resolve("buyer", null)).thenReturn(owner);
        when(plans.findByUser(owner, "org_a")).thenReturn(List.of(first, second));
        when(plans.insert(any(), any(), any(), any(), org.mockito.ArgumentMatchers.eq("org_a"))).thenReturn(plan(owner));

        mvc.perform(get("/api/v1/purchase-plans").with(jwt().jwt(t -> t.subject("buyer").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plans.length()").value(2))
                .andExpect(jsonPath("$.plans[0].plan_id").value(first.planId().toString()))
                .andExpect(jsonPath("$.plans[1].plan_id").value(second.planId().toString()));
        mvc.perform(post("/api/v1/purchase-plans").with(jwt().jwt(t -> t.subject("buyer").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer"))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity_mt\":500,\"purchase_deadline\":\"2025-11-15\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void individualOperationsUseBothSelectedPlanAndAuthenticatedOwner() throws Exception {
        UUID owner = UUID.randomUUID();
        PurchasePlan selected = plan(owner);
        UUID id = selected.planId();
        when(users.resolve("buyer", null)).thenReturn(owner);
        when(plans.findByIdAndUser(id, owner, "org_a")).thenReturn(java.util.Optional.of(selected));
        when(plans.update(id, owner, new BigDecimal("500"), LocalDate.parse("2025-11-15"),
                LocalDate.parse("2025-10-24"), "org_a")).thenReturn(java.util.Optional.of(selected));
        when(plans.delete(id, owner, "org_a")).thenReturn(true);
        String url = "/api/v1/purchase-plans/" + id;

        mvc.perform(get(url).with(jwt().jwt(t -> t.subject("buyer").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer")))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan.plan_id").value(id.toString()));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(url)
                        .with(jwt().jwt(t -> t.subject("buyer").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer"))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity_mt\":500,\"purchase_deadline\":\"2025-11-15\"}"))
                .andExpect(status().isOk());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(url)
                        .with(jwt().jwt(t -> t.subject("buyer").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer")))))
                .andExpect(status().isNoContent());
        verify(plans).findByIdAndUser(id, owner, "org_a");
        verify(plans).update(id, owner, new BigDecimal("500"), LocalDate.parse("2025-11-15"),
                LocalDate.parse("2025-10-24"), "org_a");
        verify(plans).delete(id, owner, "org_a");
    }

    @Test
    void anotherAccountCannotReadEditOrDeleteAnOwnedPlan() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        PurchasePlan selected = plan(owner);
        when(users.resolve("other", null)).thenReturn(other);
        when(plans.findByIdAndUser(selected.planId(), other, "org_a")).thenReturn(java.util.Optional.empty());
        when(plans.update(any(), any(), any(), any(), any(), org.mockito.ArgumentMatchers.eq("org_a"))).thenReturn(java.util.Optional.empty());
        String url = "/api/v1/purchase-plans/" + selected.planId();
        mvc.perform(get(url).with(jwt().jwt(t -> t.subject("other").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer")))))
                .andExpect(status().isNotFound());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(url)
                        .with(jwt().jwt(t -> t.subject("other").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer"))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity_mt\":500,\"purchase_deadline\":\"2025-11-15\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(url)
                        .with(jwt().jwt(t -> t.subject("other").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer")))))
                .andExpect(status().isNotFound());
        verify(plans, org.mockito.Mockito.times(3)).findByIdAndUser(selected.planId(), other, "org_a");
        verify(plans).update(selected.planId(), other, new BigDecimal("500"),
                LocalDate.parse("2025-11-15"), LocalDate.parse("2025-10-24"), "org_a");
        verify(plans).delete(selected.planId(), other, "org_a");
    }

    @Test
    void individualRoutesRequireAuthenticationAndIdlessWritesAreUnavailable() throws Exception {
        String url = "/api/v1/purchase-plans/" + UUID.randomUUID();
        mvc.perform(get(url)).andExpect(status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(url)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(url))
                .andExpect(status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/purchase-plans")
                        .with(jwt().jwt(t -> t.subject("buyer").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer"))))).andExpect(status().isMethodNotAllowed());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/purchase-plan")
                        .with(jwt().jwt(t -> t.subject("buyer").claim("o", java.util.Map.of("id", "org_a", "rol", "buyer"))))).andExpect(status().isForbidden());
        org.mockito.Mockito.verifyNoInteractions(plans);
    }

    private static PurchasePlan plan(UUID owner) {
        return new PurchasePlan(UUID.randomUUID(), owner, new BigDecimal("500"),
                LocalDate.parse("2025-11-15"), LocalDate.parse("2025-10-24"));
    }
}
