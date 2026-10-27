package com.cs203.mgodataapi;

import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OrganisationController {
    @GetMapping("/api/v1/organisation")
    public ResponseEntity<Map<String, Object>> current(@AuthenticationPrincipal Jwt token) {
        var access = OrganisationAccess.require(token);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of(
                "organisation_id", access.organisationId(), "role", access.roleKey(),
                "can_read_plans", access.canReadPlans(), "can_write_plans", access.canWritePlans(),
                "plan_scope", access.role() == OrganisationAccess.Role.ADMIN ? "none"
                        : access.ownPlansOnly() ? "own" : "organisation"));
    }
}
