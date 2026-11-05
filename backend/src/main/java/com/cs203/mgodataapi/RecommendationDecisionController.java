package com.cs203.mgodataapi;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The buyer's own answer to a recommendation: accept, reject or ignore, tied to
 * the recommendation version they saw. Append-only; buyers act on their own plans.
 */
@RestController
@RequestMapping("/api/v1/purchase-plans")
@Tag(name = "Purchase plan")
@SecurityRequirement(name = "bearerAuth")
public class RecommendationDecisionController {

    private static final java.util.Set<String> ACTIONS = java.util.Set.of("accept", "reject", "ignore");

    private final RecommendationDecisionRepository decisions;
    private final PurchasePlanRepository plans;
    private final UserAccounts users;

    public RecommendationDecisionController(RecommendationDecisionRepository decisions,
            PurchasePlanRepository plans, UserAccounts users) {
        this.decisions = decisions;
        this.plans = plans;
        this.users = users;
    }

    @Transactional
    @PostMapping("/{planId}/recommendation-decision")
    public ResponseEntity<Map<String, Object>> record(@AuthenticationPrincipal Jwt token,
            @PathVariable UUID planId, @RequestBody RecommendationDecisionRequest request) {
        var access = OrganisationAccess.requireBuyer(token);
        UUID userId = ownerOf(token);
        // Use the same plan lock as submission so a response cannot change mid-submit.
        var plan = plans.lockOwned(planId, userId, access.organisationId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No saved purchase plan was found."));

        if (!"draft".equals(plan.status())) {
            throw new ApiException(HttpStatus.CONFLICT, "Only a draft plan can change its recommendation response.");
        }

        Map<String, String> errors = new LinkedHashMap<>();
        String recommendationId = request == null ? null : request.recommendationId();
        if (recommendationId == null || recommendationId.isBlank()) {
            errors.put("recommendation_id", "A current recommendation is required to record a decision.");
        }
        String decision = request == null ? null : request.decision();
        if (decision == null || !ACTIONS.contains(decision)) {
            errors.put("decision", "Choose accept, reject or ignore.");
        }
        String reason = request == null ? "" : Optional.ofNullable(request.reason()).orElse("").trim();
        if ("reject".equals(decision) && reason.isEmpty()) {
            errors.put("reason", "A reason is required when rejecting a recommendation.");
        }
        if (!errors.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Please check your inputs.", errors);
        }

        RecommendationDecision saved = decisions.insert(planId, access.organisationId(), userId, token.getSubject(),
                recommendationId.trim(), request.runId(), trimToNull(request.action()), decision, reason);
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(Map.of("decision", saved.toResponse()));
    }

    @GetMapping("/recommendation-decisions")
    public ResponseEntity<Map<String, Object>> history(@AuthenticationPrincipal Jwt token,
            @RequestParam(value = "plan_id", required = false) UUID planId) {
        var access = OrganisationAccess.requireBuyer(token);
        UUID userId = ownerOf(token);
        List<RecommendationDecision> rows = planId == null
                ? decisions.findByBuyer(userId, access.organisationId())
                : decisions.findByBuyerAndPlan(userId, access.organisationId(), planId);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(Map.of("decisions", rows.stream().map(RecommendationDecision::toResponse).toList()));
    }

    private UUID ownerOf(Jwt token) {
        if (token == null || token.getSubject() == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Please sign in again.");
        }
        return users.resolve(token.getSubject(), token.getClaimAsString("email"));
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
