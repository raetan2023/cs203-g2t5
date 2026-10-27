package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * The saved purchase plans belonging to the signed-in user.
 *
 * <p>The owner comes from the verified session token, so a signed-in user can only ever
 * reach their own plans.
 */
@RestController
@RequestMapping("/api/v1/purchase-plans")
@Tag(name = "Purchase plan")
@SecurityRequirement(name = "bearerAuth")
public class PurchasePlanController {

    private final PurchasePlanRepository plans;
    private final UserAccounts users;
    private final java.time.Clock clock;
    private final PlanAnalysisService analysis;

    public PurchasePlanController(PurchasePlanRepository plans, UserAccounts users,
            java.time.Clock clock, PlanAnalysisService analysis) {
        this.plans = plans;
        this.users = users;
        this.clock = clock;
        this.analysis = analysis;
    }

    @GetMapping
    public Map<String, List<Map<String, Object>>> get(@AuthenticationPrincipal Jwt token) {
        LocalDate scenarioDate = LocalDate.now(clock);
        UUID userId = ownerOf(token);
        return Map.of("plans", plans.findByUser(userId).stream().map(plan -> plan.toResponse(scenarioDate)).toList());
    }

    @GetMapping("/{planId}")
    public Map<String, Object> getOne(@AuthenticationPrincipal Jwt token, @PathVariable UUID planId) {
        LocalDate scenarioDate = LocalDate.now(clock);
        PurchasePlan plan = plans.findByIdAndUser(planId, ownerOf(token))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No saved purchase plan was found."));
        return Map.of("plan", plan.toResponse(scenarioDate));
    }

    @GetMapping({"/recommendation", "/cost-impact"})
    public ResponseEntity<Map<String, Object>> analyze(@AuthenticationPrincipal Jwt token,
            @RequestParam("plan_id") UUID planId,
            @RequestParam("quantity_mt") BigDecimal quantity,
            @RequestParam("purchase_deadline") LocalDate deadline,
            @RequestParam("scenario_as_of_date") LocalDate scenario,
            @RequestParam(defaultValue = "7") int horizon_days,
            @RequestParam(defaultValue = "NORMAL") String urgency,
            @RequestParam(required = false) UUID run_id,
            jakarta.servlet.http.HttpServletRequest request) {
        LocalDate scenarioDate = LocalDate.now(clock);
        UUID owner = ownerOf(token);
        PurchasePlan plan = plans.findByIdAndUser(planId, owner).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "No saved purchase plan was found."));
        PlanAnalysisService.Context context = PlanAnalysisService.Context.of(plan, scenarioDate).withUrgency(urgency);
        if (!context.matches(new PlanAnalysisService.Context(planId, quantity, deadline, scenario, urgency))) {
            throw new ApiException(HttpStatus.CONFLICT, "Your saved plan or scenario changed. Reload the purchase plan.");
        }
        if (!java.util.Set.of(7, 14, 30).contains(horizon_days))
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "horizon_days must be 7, 14 or 30.");
        Map<String, Object> result = analysis.read(context, request.getRequestURI().endsWith("/cost-impact"), horizon_days, run_id);
        // A slow provider must not publish results for inputs edited/deleted during its request.
        if (!plans.findByIdAndUser(planId, owner).map(latest -> context.matches(PlanAnalysisService.Context.of(latest, scenarioDate).withUrgency(urgency))).orElse(false)) {
            throw new ApiException(HttpStatus.CONFLICT, "Your saved plan changed while analysis was loading. Reload the purchase plan.");
        }
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).body(result);
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(
            @AuthenticationPrincipal Jwt token,
            @RequestBody PurchasePlanRequest request) {
        LocalDate scenarioDate = LocalDate.now(clock);
        UUID userId = ownerOf(token);
        validate(request, scenarioDate);
        PurchasePlan saved = plans.insert(userId, request.quantityMt(), request.purchaseDeadline(), scenarioDate);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("plan", saved.toResponse()));
    }

    @PutMapping("/{planId}")
    public Map<String, Object> update(
            @PathVariable UUID planId,
            @AuthenticationPrincipal Jwt token,
            @RequestBody PurchasePlanRequest request) {
        LocalDate scenarioDate = LocalDate.now(clock);
        UUID userId = ownerOf(token);
        validate(request, scenarioDate);
        PurchasePlan updated = plans.update(planId, userId, request.quantityMt(), request.purchaseDeadline(), scenarioDate)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No saved purchase plan was found."));
        return Map.of("plan", updated.toResponse());
    }

    @DeleteMapping("/{planId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt token, @PathVariable UUID planId) {
        LocalDate scenarioDate = LocalDate.now(clock);
        UUID userId = ownerOf(token);
        if (!plans.delete(planId, userId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "No saved purchase plan was found.");
        }
        return ResponseEntity.noContent().build();
    }

    /** The application's user id for whoever signed in, created on their first request. */
    private UUID ownerOf(Jwt token) {
        if (token == null || token.getSubject() == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Please sign in again.");
        }
        // Present only when the provider is configured to include it; the column is optional.
        return users.resolve(token.getSubject(), token.getClaimAsString("email"));
    }

    private void validate(PurchasePlanRequest request, LocalDate scenarioDate) {
        Map<String, String> errors = new LinkedHashMap<>();
        if (request == null || request.quantityMt() == null) {
            errors.put("quantity_mt", "Quantity is required.");
        } else if (request.quantityMt().compareTo(BigDecimal.ZERO) <= 0) {
            errors.put("quantity_mt", "Quantity must be greater than zero.");
        }
        if (request == null || request.purchaseDeadline() == null) {
            errors.put("purchase_deadline", "Purchase deadline is required.");
        } else if (request.purchaseDeadline().isBefore(scenarioDate)) {
            errors.put("purchase_deadline", "Purchase deadline cannot be before " + scenarioDate + ".");
        }
        if (!errors.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Please check your inputs.", errors);
        }
    }
}
