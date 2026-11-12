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
 * Hourly housekeeping for plans past their purchase deadline:
 * <ul>
 * <li>requests still waiting for a decision after their purchase deadline are rejected, each in its own
 * transaction through {@link PlanApprovalService#rejectOverdue}, so one failure skips only that request;
 * requests whose officer has no manager are left until an admin assigns one;</li>
 * <li>approved plans not bought by the deadline are closed, since the approved price is out of date.</li>
 * </ul>
 */
@Configuration
@EnableScheduling
public class OverdueRequestRejector {
    private static final Logger log = LoggerFactory.getLogger(OverdueRequestRejector.class);

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
        if (!enabled) return;
        rejectDue();
        closeExpired();
    }

    /** Returns how many requests were rejected. */
    public int rejectDue() {
        // A request can be decided up to and including its deadline day (Singapore); after that it is rejected.
        var lastDeadline = dates.today().minusDays(1);
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

    /** Closes approved plans whose purchase deadline (Singapore date) has passed unbought. Returns how many. */
    public int closeExpired() {
        int closed = jdbc.update("""
                update purchase_plans set status = 'closed', closed_reason = 'deadline_passed', closed_at = now()
                where status = 'approved' and purchase_deadline < ?""", dates.today());
        if (closed > 0) log.info("Closed {} approved plan(s) not bought by their deadline.", closed);
        return closed;
    }
}
