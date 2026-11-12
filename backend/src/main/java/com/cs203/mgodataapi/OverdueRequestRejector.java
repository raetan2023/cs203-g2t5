package com.cs203.mgodataapi;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Rejects requests still waiting for a decision five days after their purchase deadline. Each runs in
 * its own transaction through {@link PlanApprovalService#rejectOverdue}, so one failure skips only
 * that request. Requests whose officer has no manager are left until an admin assigns one.
 */
@Configuration
@EnableScheduling
public class OverdueRequestRejector {
    private static final Logger log = LoggerFactory.getLogger(OverdueRequestRejector.class);
    public static final int DAYS_AFTER_DEADLINE = 5;

    private final JdbcTemplate jdbc;
    private final PlanApprovalService approvals;
    private final OperationalDate dates;
    private final boolean enabled;

    public OverdueRequestRejector(JdbcTemplate jdbc, PlanApprovalService approvals, OperationalDate dates,
            @Value("${mgo.overdue-rejection.enabled:true}") boolean enabled) {
        this.jdbc = jdbc; this.approvals = approvals; this.dates = dates; this.enabled = enabled;
    }

    /** Hourly, first run a few minutes after start-up. */
    @Scheduled(initialDelayString = "PT5M", fixedDelayString = "PT1H")
    public void run() {
        if (enabled) rejectDue();
    }

    /** Returns how many requests were rejected. */
    public int rejectDue() {
        var lastDeadline = dates.today().minusDays(DAYS_AFTER_DEADLINE);
        var due = jdbc.query("""
                select p.plan_id, p.clerk_org_id, a.pm_user_id from purchase_plans p
                join pm_assignments a on a.po_user_id = p.user_id and a.clerk_org_id = p.clerk_org_id
                where p.status = 'submitted' and p.purchase_deadline <= ?""",
                (rs, n) -> new Object[] { rs.getObject("plan_id", UUID.class), rs.getString("clerk_org_id"), rs.getObject("pm_user_id", UUID.class) },
                lastDeadline);
        int rejected = 0;
        for (var row : due) {
            try {
                if (approvals.rejectOverdue((UUID) row[0], (String) row[1], (UUID) row[2], lastDeadline)) rejected++;
            } catch (RuntimeException failure) {
                log.warn("Could not reject an overdue request automatically; it will be tried again next hour.", failure);
            }
        }
        if (rejected > 0) log.info("Rejected {} overdue request(s) automatically.", rejected);
        return rejected;
    }
}
