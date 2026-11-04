package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Team means the verified active organisation, consistent with plan and decision access. */
@RestController
public class ManagerOverviewController {
    private final PurchasePlanRepository plans;
    private final JdbcTemplate jdbc;
    private final OperationalDate dates;

    public ManagerOverviewController(PurchasePlanRepository plans, JdbcTemplate jdbc, OperationalDate dates) {
        this.plans = plans; this.jdbc = jdbc; this.dates = dates;
    }

    public record Reference(BigDecimal price, LocalDate date) {}
    public record Overview(int plan_count, BigDecimal total_quantity_mt, BigDecimal open_quantity_mt,
            long pending_approval_count, BigDecimal reference_price_usd_per_mt,
            LocalDate reference_date, BigDecimal exposure_usd) {}

    @GetMapping("/api/v1/purchase-plans/manager-overview")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ResponseEntity<Overview> get(@AuthenticationPrincipal Jwt token) {
        var access = OrganisationAccess.require(token);
        if (access.role() != OrganisationAccess.Role.MANAGER)
            throw new ApiException(HttpStatus.FORBIDDEN, "Manager membership is required.");
        var rows = plans.findByOrganisation(access.organisationId());
        var references = jdbc.query("""
                SELECT o.value, o.observation_date
                FROM public.market_observations o JOIN public.market_series s USING (series_id)
                WHERE s.series_key = 'SGP_MGO_OBSERVED' AND s.currency_code = 'USD'
                  AND s.unit = 'USD/MT' AND o.value_type = 'OBSERVED'
                  AND o.observation_date <= ? AND o.value > 0
                ORDER BY o.observation_date DESC LIMIT 1
                """, (rs, n) -> new Reference(rs.getBigDecimal("value"),
                    rs.getObject("observation_date", LocalDate.class)), dates.today());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(summarize(rows, references.isEmpty() ? null : references.getFirst()));
    }

    static Overview summarize(List<PurchasePlan> rows, Reference reference) {
        BigDecimal total = BigDecimal.ZERO, open = BigDecimal.ZERO;
        long pending = 0;
        for (var plan : rows) {
            total = total.add(plan.quantityMt());
            if (java.util.Set.of("draft", "submitted", "approved").contains(plan.status()))
                open = open.add(plan.quantityMt());
            if ("submitted".equals(plan.status())) pending++;
        }
        return new Overview(rows.size(), total, open, pending,
                reference == null ? null : reference.price(), reference == null ? null : reference.date(),
                reference == null ? null : open.multiply(reference.price()));
    }
}
