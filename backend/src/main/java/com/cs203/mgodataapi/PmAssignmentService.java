package com.cs203.mgodataapi;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Which procurement manager oversees each procurement officer in an organisation. */
@Service
public class PmAssignmentService {
    /** {@code label} is the name when known; {@code email} helps tell apart people with the same name. */
    public record Officer(UUID user_id, String label, String email, UUID pm_user_id) {}
    public record Manager(UUID user_id, String label, String email, int officer_count) {}
    public record Overview(List<Officer> officers, List<Manager> managers) {}

    private final JdbcTemplate jdbc;

    public PmAssignmentService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Overview overview(String organisationId) {
        var officers = jdbc.query("""
                select m.user_id, %s as label, u.email, a.pm_user_id
                from organisation_members m
                join users u on u.user_id = m.user_id
                left join pm_assignments a on a.po_user_id = m.user_id and a.clerk_org_id = m.clerk_org_id
                where m.clerk_org_id = ? and m.role = 'org:officer'
                order by label, m.user_id""".formatted(UserAccounts.labelOf("u")), (rs, row) -> new Officer(rs.getObject("user_id", UUID.class),
                    rs.getString("label"), rs.getString("email"), rs.getObject("pm_user_id", UUID.class)), organisationId);
        var managers = jdbc.query("""
                select m.user_id, %s as label, u.email, count(a.po_user_id) as officer_count
                from organisation_members m
                join users u on u.user_id = m.user_id
                left join pm_assignments a on a.pm_user_id = m.user_id and a.clerk_org_id = m.clerk_org_id
                where m.clerk_org_id = ? and m.role = 'org:manager'
                group by m.user_id, u.email, u.clerk_user_id, u.display_name
                order by label, m.user_id""".formatted(UserAccounts.labelOf("u")), (rs, row) -> new Manager(rs.getObject("user_id", UUID.class),
                    rs.getString("label"), rs.getString("email"), rs.getInt("officer_count")), organisationId);
        return new Overview(officers, managers);
    }

    /** Gives a PO their PM, or switches to a new one; a PO always keeps exactly one row. */
    @Transactional
    public Overview assign(String organisationId, UUID officerId, UUID managerId, UUID adminId) {
        // Locking both members stops a role change landing between this check and the save.
        Map<UUID, String> roles = jdbc.queryForList("""
                select user_id, role from organisation_members
                where clerk_org_id = ? and user_id in (?, ?) for share""", organisationId, officerId, managerId)
                .stream().collect(Collectors.toMap(row -> (UUID) row.get("user_id"), row -> (String) row.get("role")));
        if (!"org:officer".equals(roles.get(officerId)))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "This person is not a Procurement Officer in your organisation.");
        if (!"org:manager".equals(roles.get(managerId)))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "This person is not a Procurement Manager in your organisation.");
        jdbc.update("""
                insert into pm_assignments (po_user_id, clerk_org_id, pm_user_id, assigned_by_user_id) values (?, ?, ?, ?)
                on conflict (po_user_id, clerk_org_id) do update
                  set pm_user_id = excluded.pm_user_id, assigned_by_user_id = excluded.assigned_by_user_id, assigned_at = now()
                  where pm_assignments.pm_user_id is distinct from excluded.pm_user_id""",
                officerId, organisationId, managerId, adminId);
        return overview(organisationId);
    }
}
