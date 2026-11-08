package com.cs203.mgodataapi;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Keeps a copy of each member's organisation role so admins can list people and the
 * backend can check PM assignments. Clerk remains the source of truth: requests are
 * still authorised from the verified token, never from this table.
 */
@Service
public class OrganisationMembers {

    private final JdbcTemplate jdbc;
    private final UserAccounts users;

    public OrganisationMembers(JdbcTemplate jdbc, UserAccounts users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    /** Records the role from a verified token, creating the user record when it is new. */
    @Transactional
    public UUID sync(String subject, String email, OrganisationAccess access) {
        UUID userId = users.resolve(subject, email);
        save(userId, access.organisationId(), access.roleKey());
        return userId;
    }

    /**
     * Inserts or updates one membership; repeating the same call changes nothing. A
     * PM assignment only stays while the PM is a manager and the PO an officer, so a
     * role change away from either drops it and the admin sees the PO as unassigned.
     */
    @Transactional
    public void save(UUID userId, String organisationId, String role) {
        jdbc.update("""
                insert into organisation_members (user_id, clerk_org_id, role) values (?, ?, ?)
                on conflict (user_id, clerk_org_id) do update
                  set role = excluded.role, updated_at = now()
                  where organisation_members.role is distinct from excluded.role""",
                userId, organisationId, role);
        jdbc.update("""
                delete from pm_assignments where clerk_org_id = ?
                  and ((pm_user_id = ? and ? <> 'org:manager') or (po_user_id = ? and ? <> 'org:officer'))""",
                organisationId, userId, role, userId, role);
    }
}
