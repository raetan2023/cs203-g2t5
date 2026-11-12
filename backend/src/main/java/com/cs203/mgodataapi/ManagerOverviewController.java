package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Team means the officers currently assigned to this manager in the verified organisation. */
@RestController
public class ManagerOverviewController {
    private final PurchasePlanRepository plans;
    private final JdbcTemplate jdbc;
    private final OperationalDate dates;
    private final UserAccounts users;

    public ManagerOverviewController(PurchasePlanRepository plans, JdbcTemplate jdbc, OperationalDate dates, UserAccounts users) {
        this.plans = plans; this.jdbc = jdbc; this.dates = dates; this.users = users;
    }

    private static final java.util.Set<String> PERIODS = java.util.Set.of("30d", "all");
    private static final ZoneId SINGAPORE = ZoneId.of("Asia/Singapore");

    public record Reference(BigDecimal price, LocalDate date) {}

    /** The all-time overview. */
    public ResponseEntity<Overview> get(Jwt token) { return get(token, "all", null); }
    public ResponseEntity<Overview> get(Jwt token, String period) { return get(token, period, null); }

    /** An officer the manager oversees, with how many counted plans they have in the chosen period. */
    public record Officer(UUID user_id, String label, int plan_count) {}
    /**
     * Only plans a manager approved count. Planned volume is approved plans, including those since
     * purchased; purchased volume is what officers recorded buying; open volume (shown as Remaining
     * to buy) is approved plans not yet purchased, and is the basis for exposure.
     */
    public record Overview(BigDecimal total_quantity_mt, BigDecimal purchased_quantity_mt,
            BigDecimal open_quantity_mt, BigDecimal reference_price_usd_per_mt,
            LocalDate reference_date, BigDecimal exposure_usd, List<Officer> officers,
            /** Bought minus planned, over purchased plans: negative when officers bought less than approved. */
            BigDecimal purchase_difference_mt) {}

    @GetMapping("/api/v1/purchase-plans/manager-overview")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ResponseEntity<Overview> get(@AuthenticationPrincipal Jwt token,
            @RequestParam(defaultValue = "all") String period,
            @RequestParam(name = "officer", required = false) List<UUID> officerIds) {
        var access = OrganisationAccess.require(token);
        if (access.role() != OrganisationAccess.Role.MANAGER)
            throw new ApiException(HttpStatus.FORBIDDEN, "Manager membership is required.");
        if (!PERIODS.contains(period))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "period must be 30d or all.");
        // 30d: only plans approved in the last 30 days, today included (Singapore), for every figure.
        LocalDate since = "30d".equals(period) ? dates.today().minusDays(29) : null;
        Instant cutoff = since == null ? null : since.atStartOfDay(SINGAPORE).toInstant();
        // This transaction is read-only, so look the manager up without creating a record.
        // A manager with no record yet has no assigned officers.
        var manager = users.find(token.getSubject());
        var all = manager.map(id -> plans.findAssignedToManager(id, access.organisationId())).orElse(List.<PurchasePlan>of());
        var approvedRecently = cutoff == null ? null
                : manager.map(id -> plans.approvedSinceForManager(id, access.organisationId(), cutoff)).orElse(java.util.Set.of());
        var inPeriod = approvedRecently == null ? all : all.stream().filter(plan -> approvedRecently.contains(plan.planId())).toList();
        // Only the manager's own officers can be chosen; anyone else simply matches nothing.
        var chosen = officerIds == null || officerIds.isEmpty() ? null : java.util.Set.copyOf(officerIds);
        var rows = chosen == null ? inPeriod : inPeriod.stream().filter(plan -> chosen.contains(plan.userId())).toList();
        var bought = manager.map(id -> plans.purchasedByPlanForManager(id, access.organisationId())).orElse(java.util.Map.of());
        var purchasedPlans = rows.stream().filter(plan -> "purchased".equals(plan.status())).toList();
        var purchased = purchasedPlans.stream()
                .map(plan -> bought.getOrDefault(plan.planId(), BigDecimal.ZERO)).reduce(BigDecimal.ZERO, BigDecimal::add);
        var plannedForPurchased = purchasedPlans.stream().map(PurchasePlan::quantityMt).reduce(BigDecimal.ZERO, BigDecimal::add);
        var counted = java.util.Set.of("approved", "purchased");
        var officers = manager.map(id -> plans.officersForManager(id, access.organisationId())).orElse(List.of()).stream()
                .map(officer -> new Officer(officer.getKey(), officer.getValue(), (int) inPeriod.stream()
                        .filter(plan -> plan.userId().equals(officer.getKey()) && counted.contains(plan.status())).count()))
                .toList();
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
                .body(summarize(rows, purchased, references.isEmpty() ? null : references.getFirst(), officers, purchased.subtract(plannedForPurchased)));
    }

    static Overview summarize(List<PurchasePlan> rows, BigDecimal purchased, Reference reference, List<Officer> officers, BigDecimal difference) {
        BigDecimal total = BigDecimal.ZERO, open = BigDecimal.ZERO;
        for (var plan : rows) {
            if (java.util.Set.of("approved", "purchased").contains(plan.status()))
                total = total.add(plan.quantityMt());
            if ("approved".equals(plan.status()))
                open = open.add(plan.quantityMt());
        }
        return new Overview(total, purchased == null ? BigDecimal.ZERO : purchased, open,
                reference == null ? null : reference.price(), reference == null ? null : reference.date(),
                reference == null ? null : open.multiply(reference.price()), officers, difference == null ? BigDecimal.ZERO : difference);
    }
}
