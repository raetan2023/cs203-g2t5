package com.cs203.mgodataapi;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:postgresql://localhost:5432/placeholder", "spring.datasource.username=placeholder",
        "spring.datasource.password=placeholder", "mgo.db.check-on-startup=false",
        "mgo.clerk.webhook-secret=whsec_dGVzdC1zaWduaW5nLXNlY3JldC0zMi1ieXRlcyEhISE="})
@AutoConfigureMockMvc
class ClerkWebhookHttpTests {
    @Autowired MockMvc mvc;
    @Autowired ClerkWebhookVerifier verifier;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean ClerkMembershipSync sync;
    @MockitoBean ClerkMemberDirectory directory;

    final String body = """
            {"type":"organizationMembership.updated","data":{"role":"org:manager",
             "organization":{"id":"org_a"},"public_user_data":{"user_id":"user_pm","identifier":"pm@example.com"}}}""";

    MockHttpServletRequestBuilder signed(String content, String signatureOverride) {
        long now = System.currentTimeMillis() / 1000;
        String signature = signatureOverride != null ? signatureOverride
                : "v1," + Base64.getEncoder().encodeToString(verifier.sign("msg_1." + now + "." + content));
        return post("/api/v1/webhooks/clerk").contentType("application/json").content(content.getBytes(StandardCharsets.UTF_8))
                .header("svix-id", "msg_1").header("svix-timestamp", String.valueOf(now)).header("svix-signature", signature);
    }

    @Test void signedEventIsAppliedWithoutSignInTokenOrApiKey() throws Exception {
        mvc.perform(signed(body, null)).andExpect(status().isNoContent());
        verify(sync).apply(eq("organizationMembership.updated"), argThat(data -> "org:manager".equals(data.get("role"))));
    }

    @Test void unsignedOrForgedEventsAreRejectedBeforeAnythingIsSaved() throws Exception {
        mvc.perform(post("/api/v1/webhooks/clerk").contentType("application/json").content(body))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.detail").exists());
        mvc.perform(signed(body, "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")).andExpect(status().isUnauthorized());
        verifyNoInteractions(sync);
    }

    @Test void signedButMalformedBodyIsABadRequest() throws Exception {
        mvc.perform(signed("not json", null)).andExpect(status().isBadRequest());
        verifyNoInteractions(sync);
    }

    @Test void memberSyncIsAdminOnlyAndScopedToTheTokenOrganisation() throws Exception {
        for (String role : List.of("officer", "manager"))
            mvc.perform(post("/api/v1/admin/members/sync").with(jwt().jwt(t -> t.subject("user_x")
                    .claim("o", Map.of("id", "org_a", "rol", role))))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/members/sync")).andExpect(status().isUnauthorized());
        verifyNoInteractions(directory, sync);

        var members = List.of(new ClerkMembershipSync.Membership("org_a", "user_po", "org:officer", null, null));
        when(directory.members("org_a")).thenReturn(members);
        when(sync.replaceOrganisation("org_a", members)).thenReturn(Map.of("saved", 1, "removed", 0));
        mvc.perform(post("/api/v1/admin/members/sync").with(jwt().jwt(t -> t.subject("user_admin")
                        .claim("o", Map.of("id", "org_a", "rol", "admin")))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(1));
        verify(directory).members("org_a");
    }
}
