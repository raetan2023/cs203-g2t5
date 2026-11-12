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

/**
 * For a manager, team means the officers currently assigned to them in the verified organisation.
 * For an admin, it is every officer in the organisation, each with their current PM.
 */
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

    /**
     * An officer in the team, with how many counted plans they have in the chosen period. Admins also get
     * the officer's current PM (null when they have none); for a manager these are null.
     */
    public record Officer(UUID user_id, String label, int plan_count, UUID pm_user_id, String pm_label) {
        public Officer(UUID user_id, String label, int plan_count) { this(user_id, label, plan_count, null, null); }
    }
    /**
     * Only plans a manager approved count. Planned volume is approved plans, including those since
     * purchased; purchased volume is the full planned amount of purchased plans (officers always buy the
     * whole plan); open volume (shown as Remaining to buy) is approved plans not yet purchased, and is the
     * basis for exposure.
     */
    public record Overview(BigDecimal total_quantity_mt, BigDecimal purchased_quantity_mt,
            BigDecimal open_quantity_mt, BigDecimal reference_price_usd_per_mt,
            LocalDate reference_date, BigDecimal exposure_usd, List<Officer> officers) {}

    @GetMapping("/api/v1/purchase-plans/manager-overview")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ResponseEntity<Overview> get(@AuthenticationPrincipal Jwt token,
            @RequestParam(defaultValue = "all") String period,
            @RequestParam(name = "officer", required = false) List<UUID> officerIds) {
        var access = OrganisationAccess.require(token);
        boolean admin = access.role() == OrganisationAccess.Role.ADMIN;
        if (access.role() != OrganisationAccess.Role.MANAGER && !admin)
            throw new ApiException(HttpStatus.FORBIDDEN, "Manager or admin membership is required.");
        if (!PERIODS.contains(period))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "period must be 30d or all.");
        // 30d: only plans approved in the last 30 days, today included (Singapore), for every figure.
        LocalDate since = "30d".equals(period) ? dates.today().minusDays(29) : null;
        Instant cutoff = since == null ? null : since.atStartOfDay(SINGAPORE).toInstant();
        // This transaction is read-only, so look the manager up without creating a record.
        // A manager with no record yet has no assigned officers.
        String org = access.organisationId();
        var manager = admin ? java.util.Optional.<UUID>empty() : users.find(token.getSubject());
        var all = admin ? plans.findByOrganisation(org)
                : manager.map(id -> plans.findAssignedToManager(id, org)).orElse(List.<PurchasePlan>of());
        var approvedRecently = cutoff == null ? null : admin ? plans.approvedSince(org, cutoff)
                : manager.map(id -> plans.approvedSinceForManager(id, org, cutoff)).orElse(java.util.Set.of());
        var inPeriod = approvedRecently == null ? all : all.stream().filter(plan -> approvedRecently.contains(plan.planId())).toList();
        // Only the manager's own officers can be chosen; anyone else simply matches nothing.
        var chosen = officerIds == null || officerIds.isEmpty() ? null : java.util.Set.copyOf(officerIds);
        var rows = chosen == null ? inPeriod : inPeriod.stream().filter(plan -> chosen.contains(plan.userId())).toList();
        var counted = java.util.Set.of("approved", "purchased");
        java.util.function.ToIntFunction<UUID> planCount = officer -> (int) inPeriod.stream()
                .filter(plan -> plan.userId().equals(officer) && counted.contains(plan.status())).count();
        var officers = admin ? organisationOfficers(org, all, planCount)
                : manager.map(id -> plans.officersForManager(id, org)).orElse(List.of()).stream()
                .map(officer -> new Officer(officer.getKey(), officer.getValue(), planCount.applyAsInt(officer.getKey())))
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
                .body(summarize(rows, references.isEmpty() ? null : references.getFirst(), officers));
    }

    /** Every current officer, plus anyone else who owns a plan here, each with their current PM; sorted by name. */
    private List<Officer> organisationOfficers(String org, List<PurchasePlan> all, java.util.function.ToIntFunction<UUID> planCount) {
        var people = new java.util.LinkedHashSet<UUID>(plans.officerMembers(org));
        all.forEach(plan -> people.add(plan.userId()));
        var managers = plans.managersByOfficer(org);
        var named = new java.util.HashSet<UUID>(people);
        named.addAll(managers.values());
        var labels = users.labels(named);
        return people.stream().map(id -> {
                    UUID pm = managers.get(id);
                    return new Officer(id, labels.getOrDefault(id, "An officer"), planCount.applyAsInt(id),
                            pm, pm == null ? null : labels.getOrDefault(pm, "A manager"));
                })
                .sorted(java.util.Comparator.comparing(Officer::label).thenComparing(Officer::user_id)).toList();
    }

    /** Someone whose plans a manager or admin can filter by: an officer and, for admins, their current PM. */
    public record TeamMember(UUID user_id, String label, UUID pm_user_id, String pm_label) {}
    public record Team(List<TeamMember> officers) {}

    /**
     * Everyone the filters should offer, even before they have any plans: a manager's current officers,
     * or for an admin every current officer with their PM.
     */
    @GetMapping("/api/v1/purchase-plans/team")
    @Transactional(readOnly = true)
    public ResponseEntity<Team> team(@AuthenticationPrincipal Jwt token) {
        var access = OrganisationAccess.require(token);
        String org = access.organisationId();
        List<TeamMember> members;
        if (access.role() == OrganisationAccess.Role.ADMIN) {
            var managers = plans.managersByOfficer(org);
            var people = new java.util.HashSet<UUID>(plans.officerMembers(org));
            people.addAll(managers.values());
            var labels = users.labels(people);
            members = plans.officerMembers(org).stream().map(id -> {
                UUID pm = managers.get(id);
                return new TeamMember(id, labels.getOrDefault(id, "An officer"), pm, pm == null ? null : labels.getOrDefault(pm, "A manager"));
            }).sorted(java.util.Comparator.comparing(TeamMember::label)).toList();
        } else if (access.role() == OrganisationAccess.Role.MANAGER) {
            members = users.find(token.getSubject()).map(id -> plans.officersForManager(id, org)).orElse(List.of()).stream()
                    .map(officer -> new TeamMember(officer.getKey(), officer.getValue(), null, null)).toList();
        } else {
            throw new ApiException(HttpStatus.FORBIDDEN, "Manager or admin membership is required.");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new Team(members));
    }

    static Overview summarize(List<PurchasePlan> rows, Reference reference, List<Officer> officers) {
        BigDecimal total = BigDecimal.ZERO, purchased = BigDecimal.ZERO, open = BigDecimal.ZERO;
        for (var plan : rows) {
            if (java.util.Set.of("approved", "purchased").contains(plan.status()))
                total = total.add(plan.quantityMt());
            // A purchase is always the whole planned amount.
            if ("purchased".equals(plan.status()))
                purchased = purchased.add(plan.quantityMt());
            if ("approved".equals(plan.status()))
                open = open.add(plan.quantityMt());
        }
        return new Overview(total, purchased, open,
                reference == null ? null : reference.price(), reference == null ? null : reference.date(),
                reference == null ? null : open.multiply(reference.price()), officers);
    }
}
