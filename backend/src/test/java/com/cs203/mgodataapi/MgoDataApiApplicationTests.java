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
import java.util.UUID;

import org.junit.jupiter.api.Test;
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
        "mgo.db.check-on-startup=false"})
@AutoConfigureMockMvc
class MgoDataApiApplicationTests {

    private static final String KEY = "mgo_public_demo_2026";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private UserAccounts users;

    @MockitoBean
    private PurchasePlanRepository plans;

    @Test
    void homeHealthAndDocsArePublic() throws Exception {
        mvc.perform(get("/")).andExpect(status().isOk());
        mvc.perform(get("/health")).andExpect(jsonPath("$.status").value("ok"));
        mvc.perform(get("/openapi.json")).andExpect(status().isOk());
    }

    @Test
    void dataRequiresAKeyAndReturnsSnapshotData() throws Exception {
        mvc.perform(get("/api/v1/sources")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/sources").header("X-API-Key", KEY))
                .andExpect(jsonPath("$.sources[?(@.id == 'brent')].records").value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.greaterThan(0))));
        mvc.perform(get("/api/v1/data/brent?limit=2").header("X-API-Key", KEY))
                .andExpect(jsonPath("$.count").value(2));
        mvc.perform(get("/api/v1/data/brent?limit=1&format=csv").header("X-API-Key", KEY))
                .andExpect(content().string(startsWith("date,value,series,source,unit\n")));
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
        mvc.perform(get("/api/v1/purchase-plan"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Please sign in again."));
        // A shared key is not a substitute for signing in.
        mvc.perform(get("/api/v1/purchase-plan").header("X-API-Key", KEY))
                .andExpect(status().isUnauthorized());
        // An unreadable or expired token is rejected by the decoder, as in production.
        when(jwtDecoder.decode("not-a-token")).thenThrow(new BadJwtException("malformed token"));
        mvc.perform(get("/api/v1/purchase-plan").header("Authorization", "Bearer not-a-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Please sign in again."));
    }

    /** A signed-in caller reaches only the plan belonging to their own user record. */
    @Test
    void purchasePlanUsesTheUserBehindTheToken() throws Exception {
        UUID userId = UUID.fromString("8a9d4260-9070-4bb1-b5af-a71f458a3f47");
        when(users.resolve("user_2abc", null)).thenReturn(userId);
        when(plans.findByUser(userId)).thenReturn(Optional.of(new PurchasePlan(
                UUID.randomUUID(), userId, new BigDecimal("500"),
                LocalDate.parse("2025-11-15"), LocalDate.parse("2025-10-24"))));

        mvc.perform(get("/api/v1/purchase-plan").with(jwt().jwt(token -> token.subject("user_2abc"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan.days_remaining").value(22));
    }

    /** Somebody signing in for the first time gets a user record rather than a failure. */
    @Test
    void firstRequestFromANewAccountCreatesItsUserRecord() throws Exception {
        UUID userId = UUID.randomUUID();
        when(users.resolve("user_new", null)).thenReturn(userId);
        when(plans.findByUser(userId)).thenReturn(Optional.empty());

        mvc.perform(get("/api/v1/purchase-plan").with(jwt().jwt(token -> token.subject("user_new"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan").doesNotExist());
        verify(users).resolve("user_new", null);
    }

    /** Plans are saved against the token's user, never a value the caller supplies. */
    @Test
    void createSavesAgainstTheTokensUser() throws Exception {
        UUID userId = UUID.randomUUID();
        when(users.resolve("user_2abc", null)).thenReturn(userId);
        when(plans.findByUser(userId)).thenReturn(Optional.empty());
        when(plans.insert(any(), any(), any(), any())).thenReturn(new PurchasePlan(
                UUID.randomUUID(), userId, new BigDecimal("500"),
                LocalDate.parse("2025-11-15"), LocalDate.parse("2025-10-24")));

        mvc.perform(post("/api/v1/purchase-plan")
                        .with(jwt().jwt(token -> token.subject("user_2abc")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity_mt\": 500, \"purchase_deadline\": \"2025-11-15\"}"))
                .andExpect(status().isCreated());
        verify(plans).insert(userId, new BigDecimal("500"),
                LocalDate.parse("2025-11-15"), LocalDate.parse("2025-10-24"));
    }

    /** Field errors still reach the form when the caller is signed in. */
    @Test
    void rejectsAQuantityOfZeroOrLess() throws Exception {
        when(users.resolve("user_2abc", null)).thenReturn(UUID.randomUUID());

        mvc.perform(post("/api/v1/purchase-plan")
                        .with(jwt().jwt(token -> token.subject("user_2abc")))
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
        mvc.perform(options("/api/v1/purchase-plan")
                        .header("Origin", "http://127.0.0.1:5173")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type,x-api-key,x-user-id"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://127.0.0.1:5173"));
        mvc.perform(options("/api/v1/purchase-plan")
                        .header("Origin", "http://evil.example.com")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
    }
}
