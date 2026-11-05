package com.cs203.mgodataapi;

import java.util.List;
import java.util.Map;
import java.util.UUID;
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
class AdminAccessHttpTests {
    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder decoder;
    RequestPostProcessor member(String org, String role) {
        return jwt().jwt(token -> token.subject("user_admin").claim("o", Map.of("id", org, "rol", role)));
    }
    @Test void everyAdminEndpointRejectsSignedOutAndOtherRolesBeforeCallingServices() throws Exception {
        for (String path : List.of("/api/v1/admin/status", "/api/v1/admin/retraining")) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(get(path).header("X-API-Key", "mgo_public_demo_2026")).andExpect(status().isUnauthorized());
            for (String role : List.of("buyer", "manager", "analyst", "unknown"))
                mvc.perform(get(path).with(member("org_a", role))).andExpect(status().isForbidden());
        }
        for (String role : List.of("buyer", "manager", "analyst", "unknown"))
            mvc.perform(post("/api/v1/admin/retraining").with(member("org_a", role)).contentType("application/json")
                    .content("{\"request_id\":\"" + UUID.randomUUID() + "\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/retraining")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/status").with(jwt())).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/status").with(jwt().jwt(token -> token.subject("user_admin")
                .claim("o", Map.of("id", "org_a", "rol", "admin")).claim("org_id", "org_b"))))
                .andExpect(status().isForbidden());
    }
    @Test void organisationAdminCannotUseRemovedPlatformControls() throws Exception {
        mvc.perform(get("/api/v1/admin/status").with(member("org_a", "admin"))).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/admin/retraining").with(member("org_a", "admin")).contentType("application/json")
                .content("{}")).andExpect(status().isNotFound());
    }
}
