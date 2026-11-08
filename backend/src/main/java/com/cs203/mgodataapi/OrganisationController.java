package com.cs203.mgodataapi;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OrganisationController {
    private static final Logger log = LoggerFactory.getLogger(OrganisationController.class);
    private final OrganisationMembers members;

    public OrganisationController(OrganisationMembers members) {
        this.members = members;
    }

    @GetMapping("/api/v1/organisation")
    public ResponseEntity<Map<String, Object>> current(@AuthenticationPrincipal Jwt token) {
        var access = OrganisationAccess.require(token);
        // Every member loads this on sign-in, so it keeps the stored role current. The
        // token stays authoritative, so a failed copy must not block access.
        try {
            members.sync(token.getSubject(), token.getClaimAsString("email"), access);
        } catch (RuntimeException failure) {
            log.warn("Could not record the organisation role for this member.", failure);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of(
                "organisation_id", access.organisationId(), "role", access.roleKey(),
                "can_read_plans", access.canReadPlans(), "can_write_plans", access.canWritePlans(),
                "plan_scope", access.ownPlansOnly() ? "own" : "organisation"));
    }
}
