package com.cs203.mgodataapi;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Applies Clerk membership and user changes to {@code users} and
 * {@code organisation_members}. Every operation is safe to repeat, because Clerk may
 * deliver the same event more than once.
 */
@Service
public class ClerkMembershipSync {
    private static final Logger log = LoggerFactory.getLogger(ClerkMembershipSync.class);
    static final Set<String> ROLES = Set.of("org:officer", "org:manager", "org:admin");

    private final JdbcTemplate jdbc;
    private final OrganisationMembers members;

    public ClerkMembershipSync(JdbcTemplate jdbc, OrganisationMembers members) {
        this.jdbc = jdbc;
        this.members = members;
    }

    /** One membership as Clerk describes it, in both webhook events and the member list. */
    public record Membership(String organisationId, String clerkUserId, String role, String email) {
        static Membership from(Map<?, ?> data) {
            var organisation = data.get("organization") instanceof Map<?, ?> o ? o : Map.of();
            var user = data.get("public_user_data") instanceof Map<?, ?> u ? u : Map.of();
            return new Membership(text(organisation.get("id")), text(user.get("user_id")),
                    text(data.get("role")), ClerkMembershipSync.email(user.get("identifier")));
        }

        boolean valid() {
            return organisationId != null && organisationId.matches("org_[A-Za-z0-9]+")
                    && clerkUserId != null && !clerkUserId.isBlank();
        }
    }

    /** Handles one verified webhook event; unknown event types are ignored. */
    @Transactional
    public void apply(String type, Map<?, ?> data) {
        switch (type == null ? "" : type) {
            case "organizationMembership.created", "organizationMembership.updated" -> save(Membership.from(data));
            case "organizationMembership.deleted" -> remove(Membership.from(data));
            case "user.created", "user.updated" -> updateEmail(text(data.get("id")), primaryEmail(data));
            // Keep the user row so their plans and decisions stay on record; only
            // their access goes.
            case "user.deleted" -> removeAllMemberships(text(data.get("id")));
            default -> { }
        }
    }

    /**
     * Makes the stored members of one organisation match Clerk's full list. Called only
     * with a complete list, so anyone missing from it has left.
     */
    @Transactional
    public Map<String, Integer> replaceOrganisation(String organisationId, List<Membership> current) {
        Set<UUID> kept = new HashSet<>();
        int saved = 0;
        for (var membership : current) {
            if (!membership.valid() || !organisationId.equals(membership.organisationId())) continue;
            UUID userId = save(membership);
            if (userId != null) { kept.add(userId); saved++; }
        }
        var stored = jdbc.queryForList("select user_id from organisation_members where clerk_org_id = ?",
                UUID.class, organisationId);
        int removed = 0;
        for (UUID userId : stored) {
            if (kept.contains(userId)) continue;
            removed += jdbc.update("delete from organisation_members where user_id = ? and clerk_org_id = ?",
                    userId, organisationId);
        }
        return Map.of("saved", saved, "removed", removed);
    }

    /** Returns the user's ID, or null when the membership no longer grants app access. */
    UUID save(Membership membership) {
        if (!membership.valid()) {
            log.warn("Ignored a Clerk membership without a valid organisation or user.");
            return null;
        }
        if (!ROLES.contains(membership.role())) {
            // A role the app does not support grants no access, like being removed.
            remove(membership);
            return null;
        }
        UUID userId = upsertUser(membership.clerkUserId(), membership.email());
        members.save(userId, membership.organisationId(), membership.role());
        return userId;
    }

    void remove(Membership membership) {
        if (!membership.valid()) return;
        jdbc.update("""
                delete from organisation_members where clerk_org_id = ?
                  and user_id = (select user_id from users where clerk_user_id = ?)""",
                membership.organisationId(), membership.clerkUserId());
    }

    private void removeAllMemberships(String clerkUserId) {
        if (clerkUserId == null) return;
        jdbc.update("delete from organisation_members where user_id = (select user_id from users where clerk_user_id = ?)",
                clerkUserId);
    }

    private UUID upsertUser(String clerkUserId, String email) {
        String usable = available(email, clerkUserId);
        return jdbc.queryForObject("""
                insert into users (clerk_user_id, email) values (?, ?)
                on conflict (clerk_user_id) do update set email = coalesce(excluded.email, users.email)
                returning user_id""", UUID.class, clerkUserId, usable);
    }

    private void updateEmail(String clerkUserId, String email) {
        String usable = available(email, clerkUserId);
        if (clerkUserId == null || usable == null) return;
        jdbc.update("update users set email = ? where clerk_user_id = ?", usable, clerkUserId);
    }

    /**
     * Emails are unique. If another account already holds this one (e.g. a re-invited
     * person whose old account was deleted), keep the existing row and skip the email
     * rather than fail the whole event.
     */
    private String available(String email, String clerkUserId) {
        if (email == null) return null;
        Integer taken = jdbc.queryForObject(
                "select count(*) from users where email = ? and clerk_user_id <> ?", Integer.class, email, clerkUserId);
        if (taken != null && taken > 0) {
            log.warn("Skipped an email that already belongs to another user record.");
            return null;
        }
        return email;
    }

    static String primaryEmail(Map<?, ?> data) {
        Object primary = data.get("primary_email_address_id");
        if (!(data.get("email_addresses") instanceof List<?> addresses)) return null;
        for (Object entry : addresses) {
            if (entry instanceof Map<?, ?> address && primary != null && primary.equals(address.get("id")))
                return email(address.get("email_address"));
        }
        return null;
    }

    static String email(Object value) {
        String text = text(value);
        return text != null && text.contains("@") ? text : null;
    }

    static String text(Object value) {
        return value instanceof String s && !s.isBlank() ? s.strip() : null;
    }
}
