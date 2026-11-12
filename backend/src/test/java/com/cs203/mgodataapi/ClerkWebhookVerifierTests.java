package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ClerkWebhookVerifierTests {
    static final String SECRET = "whsec_" + Base64.getEncoder().encodeToString("test-signing-secret-32-bytes!!!!".getBytes(StandardCharsets.UTF_8));
    static final long NOW = 1_762_600_000L;
    final ClerkWebhookVerifier verifier = new ClerkWebhookVerifier(SECRET, Clock.fixed(Instant.ofEpochSecond(NOW), ZoneOffset.UTC));
    final String body = "{\"type\":\"organizationMembership.created\",\"data\":{}}";

    String signature(String id, long timestamp, String content) {
        return "v1," + Base64.getEncoder().encodeToString(verifier.sign(id + "." + timestamp + "." + content));
    }

    HttpStatus statusOf(Runnable call) {
        var failure = assertThrows(ApiException.class, call::run);
        return failure.status();
    }

    @Test void acceptsACurrentValidSignatureEvenAmongOthers() {
        assertDoesNotThrow(() -> verifier.verify("msg_1", String.valueOf(NOW), signature("msg_1", NOW, body), body));
        assertDoesNotThrow(() -> verifier.verify("msg_1", String.valueOf(NOW - 200),
                "v1,AAAA " + signature("msg_1", NOW - 200, body), body));
    }

    @Test void rejectsTamperedReplayedOrIncompleteRequests() {
        String good = signature("msg_1", NOW, body);
        assertEquals(HttpStatus.UNAUTHORIZED, statusOf(() -> verifier.verify("msg_1", String.valueOf(NOW), good, body.replace("created", "deleted"))));
        assertEquals(HttpStatus.UNAUTHORIZED, statusOf(() -> verifier.verify("msg_2", String.valueOf(NOW), good, body)));
        long old = NOW - ClerkWebhookVerifier.TOLERANCE_SECONDS - 1;
        assertEquals(HttpStatus.UNAUTHORIZED, statusOf(() -> verifier.verify("msg_1", String.valueOf(old), signature("msg_1", old, body), body)));
        long future = NOW + ClerkWebhookVerifier.TOLERANCE_SECONDS + 1;
        assertEquals(HttpStatus.UNAUTHORIZED, statusOf(() -> verifier.verify("msg_1", String.valueOf(future), signature("msg_1", future, body), body)));
        assertEquals(HttpStatus.UNAUTHORIZED, statusOf(() -> verifier.verify(null, String.valueOf(NOW), good, body)));
        assertEquals(HttpStatus.UNAUTHORIZED, statusOf(() -> verifier.verify("msg_1", "soon", good, body)));
        assertEquals(HttpStatus.UNAUTHORIZED, statusOf(() -> verifier.verify("msg_1", String.valueOf(NOW), good.replace("v1,", "v2,"), body)));
        assertEquals(HttpStatus.UNAUTHORIZED, statusOf(() -> verifier.verify("msg_1", String.valueOf(NOW), "v1,not-base64!", body)));
    }

    @Test void aSignatureFromAnotherSecretIsRejected() {
        var other = new ClerkWebhookVerifier("whsec_" + Base64.getEncoder().encodeToString("another-secret-another-secret-12".getBytes(StandardCharsets.UTF_8)),
                Clock.fixed(Instant.ofEpochSecond(NOW), ZoneOffset.UTC));
        String forged = "v1," + Base64.getEncoder().encodeToString(other.sign("msg_1." + NOW + "." + body));
        assertEquals(HttpStatus.UNAUTHORIZED, statusOf(() -> verifier.verify("msg_1", String.valueOf(NOW), forged, body)));
    }

    @Test void missingSecretMeansNotConfigured() {
        var unset = new ClerkWebhookVerifier("", Clock.systemUTC());
        assertFalse(unset.configured());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, statusOf(() -> unset.verify("msg_1", String.valueOf(NOW), "v1,AAAA", body)));
        assertThrows(IllegalStateException.class, () -> new ClerkWebhookVerifier("whsec_***", Clock.systemUTC()));
    }

    @Test void readsEmailsAndMembershipsFromClerkPayloads() {
        var membership = ClerkMembershipSync.Membership.from(java.util.Map.of(
                "role", "org:manager", "organization", java.util.Map.of("id", "org_abc"),
                "public_user_data", java.util.Map.of("user_id", "user_1", "identifier", "pm@example.com")));
        assertEquals(new ClerkMembershipSync.Membership("org_abc", "user_1", "org:manager", "pm@example.com", null), membership);
        assertTrue(membership.valid());
        assertNull(ClerkMembershipSync.Membership.from(java.util.Map.of("public_user_data", java.util.Map.of("identifier", "+6591234567"))).email());
        assertFalse(ClerkMembershipSync.Membership.from(java.util.Map.of("organization", java.util.Map.of("id", "bad org"))).valid());
        assertEquals("b@example.com", ClerkMembershipSync.primaryEmail(java.util.Map.of("primary_email_address_id", "e2",
                "email_addresses", java.util.List.of(java.util.Map.of("id", "e1", "email_address", "a@example.com"),
                        java.util.Map.of("id", "e2", "email_address", "b@example.com")))));
    }

    @Test void readsANameFromClerkFirstAndLastNames() {
        assertEquals("Rae Tan", ClerkMembershipSync.name(java.util.Map.of("first_name", " Rae ", "last_name", "Tan")));
        assertEquals("Rae", ClerkMembershipSync.name(java.util.Map.of("first_name", "Rae")));
        assertEquals("Tan", ClerkMembershipSync.name(java.util.Map.of("last_name", "Tan")));
        assertNull(ClerkMembershipSync.name(java.util.Map.of("first_name", "  ")));
        var membership = ClerkMembershipSync.Membership.from(java.util.Map.of(
                "organization", java.util.Map.of("id", "org_abc"), "role", "org:officer",
                "public_user_data", java.util.Map.of("user_id", "user_2", "identifier", "rae@example.com", "first_name", "Rae", "last_name", "Tan")));
        assertEquals("Rae Tan", membership.name());
    }
}
