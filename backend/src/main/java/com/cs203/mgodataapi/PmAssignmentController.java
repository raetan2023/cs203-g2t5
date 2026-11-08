package com.cs203.mgodataapi;

import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin-only through SecurityConfig. The organisation always comes from the admin's
 * token. There is deliberately no delete: an admin can only switch a PO to another PM.
 */
@RestController
@RequestMapping("/api/v1/admin/pm-assignments")
public class PmAssignmentController {
    public record AssignmentRequest(UUID pm_user_id) {}

    private final PmAssignmentService assignments;
    private final UserAccounts users;

    public PmAssignmentController(PmAssignmentService assignments, UserAccounts users) {
        this.assignments = assignments; this.users = users;
    }

    @GetMapping
    public ResponseEntity<PmAssignmentService.Overview> get(@AuthenticationPrincipal Jwt token) {
        return reply(assignments.overview(admin(token).organisationId()));
    }

    @PutMapping("/{poUserId}")
    public ResponseEntity<PmAssignmentService.Overview> put(@AuthenticationPrincipal Jwt token, @PathVariable UUID poUserId,
            @RequestBody(required = false) AssignmentRequest request) {
        var access = admin(token);
        if (request == null || request.pm_user_id() == null)
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Choose a Procurement Manager.");
        UUID adminId = users.resolve(token.getSubject(), token.getClaimAsString("email"));
        return reply(assignments.assign(access.organisationId(), poUserId, request.pm_user_id(), adminId));
    }

    private static OrganisationAccess admin(Jwt token) {
        var access = OrganisationAccess.require(token);
        if (access.role() != OrganisationAccess.Role.ADMIN)
            throw new ApiException(HttpStatus.FORBIDDEN, "Admin membership is required.");
        return access;
    }

    private static <T> ResponseEntity<T> reply(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
