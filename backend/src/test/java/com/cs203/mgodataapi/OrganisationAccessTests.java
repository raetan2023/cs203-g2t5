package com.cs203.mgodataapi;

import static org.junit.jupiter.api.Assertions.*;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class OrganisationAccessTests {
    Jwt token(Map<String, Object> claims) {
        return Jwt.withTokenValue("test").header("alg", "RS256").subject("user_a")
                .claims(values -> values.putAll(claims)).build();
    }
    @Test void readsOnlyRecognisedActiveMembershipRolesFromV2() {
        for (String role : new String[]{"buyer", "manager", "analyst", "admin"}) {
            var access = OrganisationAccess.require(token(Map.of("v", 2, "o", Map.of("id", "org_a", "rol", role))));
            assertEquals("org_a", access.organisationId());
            assertEquals("org:" + role, access.roleKey());
            assertEquals(role.equals("buyer"), access.canWritePlans());
            assertEquals(!role.equals("admin"), access.canReadPlans());
        }
    }
    @Test void supportsExplicitLegacyOrganisationClaims() {
        var access = OrganisationAccess.require(token(Map.of("org_id", "org_a", "org_role", "org:buyer")));
        assertTrue(access.ownPlansOnly());
    }
    @Test void rejectsMissingUnknownMalformedAndConflictingClaims() {
        for (Map<String, Object> claims : java.util.List.<Map<String, Object>>of(
                Map.of("app_role", "admin"), Map.of("o", Map.of("id", "org_a", "rol", "member")),
                Map.of("o", Map.of("id", "org_a", "rol", "org:admin")),
                Map.of("o", Map.of("id", "org_a", "rol", 5)), Map.of("o", "invalid"),
                Map.of("o", Map.of("id", "org_a OR 1=1", "rol", "buyer")),
                Map.of("o", Map.of("rol", "admin")),
                Map.of("v", 2, "org_id", "org_a", "org_role", "org:admin"),
                Map.of("o", Map.of("id", "org_a", "rol", "buyer"), "org_id", "org_b"),
                Map.of("o", Map.of("id", "org_a", "rol", "buyer"), "org_role", "org:admin"))) {
            assertTrue(OrganisationAccess.from(token(claims)).isEmpty(), claims.toString());
        }
        assertTrue(OrganisationAccess.from(null).isEmpty());
    }
}
