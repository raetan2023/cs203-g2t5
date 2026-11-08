package com.cs203.mgodataapi;

import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lets an organisation admin copy the full member list from Clerk, for members who
 * joined before the webhook existed or if events were missed. Admin-only through
 * SecurityConfig; the organisation always comes from the admin's token.
 */
@RestController
public class MemberSyncController {
    private final ClerkMemberDirectory directory;
    private final ClerkMembershipSync sync;

    public MemberSyncController(ClerkMemberDirectory directory, ClerkMembershipSync sync) {
        this.directory = directory; this.sync = sync;
    }

    @PostMapping("/api/v1/admin/members/sync")
    public ResponseEntity<Map<String, Integer>> syncMembers(@AuthenticationPrincipal Jwt token) {
        var access = OrganisationAccess.require(token);
        // Fetch everything first, so no database transaction waits on the network.
        var current = directory.members(access.organisationId());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(sync.replaceOrganisation(access.organisationId(), current));
    }
}
