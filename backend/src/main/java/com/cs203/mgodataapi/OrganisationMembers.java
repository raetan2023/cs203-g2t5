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
        if (!"org:officer".equals(role)) closeOfficerWork(userId, organisationId);
        jdbc.update("""
                delete from pm_assignments where clerk_org_id = ?
                  and ((pm_user_id = ? and ? <> 'org:manager') or (po_user_id = ? and ? <> 'org:officer'))""",
                organisationId, userId, role, userId, role);
    }

    /** Shown on requests withdrawn because their officer stopped being an officer. */
    static final String ROLE_CHANGE_REASON = "Withdrawn automatically: the officer is no longer a procurement officer.";

    /**
     * Someone who stops being an officer (promoted, made admin, or gone) can no longer act on their plans,
     * and nobody else can. So their pending requests are withdrawn, and the manager who was reviewing them
     * still sees them as withdrawn; their approved plans that were not bought yet are closed. Call this
     * before their PM assignment is removed. Repeating it changes nothing.
     */
    @Transactional
    public void closeOfficerWork(UUID userId, String organisationId) {
        var reviewer = jdbc.queryForList("select pm_user_id from pm_assignments where po_user_id = ? and clerk_org_id = ?",
                UUID.class, userId, organisationId).stream().findFirst().orElse(null);
        var pending = jdbc.queryForList("select plan_id from purchase_plans where user_id = ? and clerk_org_id = ? and status = 'submitted'",
                UUID.class, userId, organisationId);
        for (UUID planId : pending) {
            if (jdbc.update("update purchase_plans set status = 'withdrawn' where plan_id = ? and clerk_org_id = ? and status = 'submitted'",
                    planId, organisationId) != 1) continue;
            jdbc.update("""
                    insert into plan_withdrawals (plan_id, clerk_org_id, buyer_user_id, reason, manager_user_id)
                    values (?, ?, ?, ?, ?)""", planId, organisationId, userId, ROLE_CHANGE_REASON, reviewer);
        }
        jdbc.update("""
                update purchase_plans set status = 'closed', closed_reason = 'role_change', closed_at = now()
                where user_id = ? and clerk_org_id = ? and status = 'approved'""", userId, organisationId);
    }
}
