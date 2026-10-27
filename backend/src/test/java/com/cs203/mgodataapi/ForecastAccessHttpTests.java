package com.cs203.mgodataapi;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** Real Spring filters and controller; no database, model service or Clerk network calls. */
@SpringBootTest(properties = {"spring.datasource.url=jdbc:postgresql://localhost:5432/placeholder",
    "spring.datasource.username=placeholder", "spring.datasource.password=placeholder", "mgo.db.check-on-startup=false"})
@AutoConfigureMockMvc
class ForecastAccessHttpTests {
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean ForecastService forecasts;
    static final String PATH = "/api/v1/forecast";

    @BeforeEach void response() {
        when(forecasts.read(anyInt())).thenReturn(new ForecastService.Unavailable(
                "unavailable", "missing_run", "No forecast has been published.", null));
    }
    RequestPostProcessor member(String org, String role) {
        return jwt().jwt(token -> token.subject("user_test").claim("v", 2)
                .claim("o", Map.of("id", org, "rol", role)));
    }
    @Test void signedOutAndApiKeyOnlyRequestsAre401WithoutCallingForecasts() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Please sign in again."));
        mvc.perform(get(PATH).header("X-API-Key", "mgo_public_demo_2026"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(forecasts);
    }
    @Test void invalidBearerTokenIs401WithoutCallingForecasts() throws Exception {
        when(decoder.decode("invalid-token")).thenThrow(new BadJwtException("invalid token"));
        mvc.perform(get(PATH).header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized());
        verify(decoder).decode("invalid-token");
        verifyNoInteractions(forecasts);
    }
    @Test void buyersManagersAndAnalystsCanReadAllSupportedHorizons() throws Exception {
        for (String role : List.of("buyer", "manager", "analyst")) {
            for (int horizon : List.of(7, 14, 30)) {
                mvc.perform(get(PATH).param("horizon_days", Integer.toString(horizon))
                        .with(member("org_a", role)))
                        .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                        .andExpect(jsonPath("$.status").value("unavailable"))
                        .andExpect(jsonPath("$.reason").value("missing_run"));
            }
        }
        for (int horizon : List.of(7, 14, 30)) verify(forecasts, times(3)).read(horizon);
    }
    @Test void adminIs403AndDoesNotInheritBusinessForecastAccess() throws Exception {
        mvc.perform(get(PATH).with(member("org_a", "admin"))).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Your organisation role does not allow this action."));
        verifyNoInteractions(forecasts);
    }
    @Test void missingInvalidOrConflictingOrganisationClaimsAre403() throws Exception {
        for (Map<String, Object> claims : List.<Map<String, Object>>of(
                Map.of(), Map.of("app_role", "buyer"),
                Map.of("o", Map.of("id", "org_a")), Map.of("o", Map.of("rol", "buyer")),
                Map.of("o", Map.of("id", "", "rol", "buyer")),
                Map.of("o", Map.of("id", "invalid_org", "rol", "buyer")),
                Map.of("o", Map.of("id", "org_a", "rol", "member")),
                Map.of("o", Map.of("id", "org_a", "rol", "unknown")),
                Map.of("o", Map.of("id", "org_a", "rol", 5)), Map.of("o", "malformed"),
                Map.of("o", Map.of("id", "org_a", "rol", "buyer"), "org_id", "org_other"),
                Map.of("o", Map.of("id", "org_a", "rol", "buyer"), "org_role", "org:admin"),
                Map.of("v", 2, "org_id", "org_a", "org_role", "org:buyer"))) {
            mvc.perform(get(PATH).with(jwt().jwt(token -> token.subject("user_test")
                            .claims(values -> values.putAll(claims)))))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.detail").exists());
        }
        verifyNoInteractions(forecasts);
    }
    @Test void explicitLegacyMembershipClaimsRemainSupported() throws Exception {
        mvc.perform(get(PATH).with(jwt().jwt(token -> token.subject("user_test")
                        .claim("org_id", "org_a").claim("org_role", "org:buyer"))))
                .andExpect(status().isOk());
        verify(forecasts).read(7);
    }
    @Test void sharedPublicationsRemainAvailableToPermittedMembersOfDifferentOrganisations() throws Exception {
        for (String org : List.of("org_a", "org_b"))
            mvc.perform(get(PATH).with(member(org, "buyer"))).andExpect(status().isOk());
        verify(forecasts, times(2)).read(7);
    }
}
