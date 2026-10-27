package com.cs203.mgodataapi;

import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;

/** Active membership from an already verified Clerk JWT; never from request fields. */
public record OrganisationAccess(String organisationId, Role role) {
    public enum Role { BUYER, MANAGER, ANALYST, ADMIN }

    public static Optional<OrganisationAccess> from(Jwt token) {
        if (token == null || token.getSubject() == null || token.getSubject().isBlank()) return Optional.empty();
        Object id, rawRole;
        boolean compact = token.getClaims().containsKey("o");
        if (compact) {
            if (!(token.getClaim("o") instanceof Map<?, ?> org)) return Optional.empty();
            id = org.get("id"); rawRole = org.get("rol");
        } else {
            // v2 uses the compact 'o' claim. Do not substitute user metadata or a
            // conflicting legacy claim when an active v2 organisation is absent.
            if (token.getClaim("v") instanceof Number version && version.intValue() >= 2) return Optional.empty();
            id = token.getClaim("org_id"); rawRole = token.getClaim("org_role");
        }
        if (!(id instanceof String organisation) || !organisation.matches("org_[A-Za-z0-9]+")
                || !(rawRole instanceof String roleName)) return Optional.empty();
        String name = compact ? roleName : roleName.startsWith("org:") ? roleName.substring(4) : "";
        Role role = switch (name) {
            case "buyer" -> Role.BUYER;
            case "manager" -> Role.MANAGER;
            case "analyst" -> Role.ANALYST;
            case "admin" -> Role.ADMIN;
            default -> null;
        };
        if (role == null) return Optional.empty();
        if (compact && ((token.hasClaim("org_id") && !organisation.equals(token.getClaim("org_id")))
                || (token.hasClaim("org_role") && !("org:" + name).equals(token.getClaim("org_role"))))) {
            return Optional.empty();
        }
        return Optional.of(new OrganisationAccess(organisation, role));
    }

    public static OrganisationAccess require(Jwt token) {
        return from(token).orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN,
                "Select an organisation with a supported membership role."));
    }

    public static OrganisationAccess requirePlanReader(Jwt token) {
        var access = require(token);
        if (!access.canReadPlans()) throw new ApiException(HttpStatus.FORBIDDEN, "Your organisation role cannot view purchase plans.");
        return access;
    }

    public static OrganisationAccess requireBuyer(Jwt token) {
        var access = require(token);
        if (!access.canWritePlans()) throw new ApiException(HttpStatus.FORBIDDEN, "Only buyers can change their own purchase plans.");
        return access;
    }

    public static boolean allows(Authentication auth, Set<Role> roles) {
        return auth != null && auth.isAuthenticated() && auth.getPrincipal() instanceof Jwt token
                && from(token).map(access -> roles.contains(access.role())).orElse(false);
    }

    public boolean ownPlansOnly() { return role == Role.BUYER; }
    public boolean canReadPlans() { return role != Role.ADMIN; }
    public boolean canWritePlans() { return role == Role.BUYER; }
    public String roleKey() { return "org:" + role.name().toLowerCase(java.util.Locale.ROOT); }
}
