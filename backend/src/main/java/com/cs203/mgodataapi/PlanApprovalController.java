package com.cs203.mgodataapi;

import java.util.Map;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/purchase-plans")
public class PlanApprovalController {
    private final PlanApprovalService approvals;
    private final UserAccounts users;
    private final PurchasePlanRepository plans;
    private final PlanLifecycleService lifecycle;
    public PlanApprovalController(PlanApprovalService approvals, UserAccounts users, PurchasePlanRepository plans, PlanLifecycleService lifecycle) {
        this.approvals = approvals; this.users = users; this.plans = plans; this.lifecycle = lifecycle;
    }

    @PostMapping("/{planId}/submit")
    public ResponseEntity<Map<String, Object>> submit(@AuthenticationPrincipal Jwt token, @PathVariable UUID planId, @RequestBody PlanApprovalRequest selection) {
        var access = OrganisationAccess.requireBuyer(token);
        var owner = users.resolve(token.getSubject(), token.getClaimAsString("email"));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(Map.of("plan", approvals.submit(planId, owner, access.organisationId(), selection).toResponse()));
    }

    @GetMapping("/{planId}/submission")
    public ResponseEntity<Map<String, Object>> submission(@AuthenticationPrincipal Jwt token, @PathVariable UUID planId) {
        var access = OrganisationAccess.requirePlanReader(token);
        var plan = access.ownPlansOnly()
                ? plans.findByIdAndUser(planId, users.resolve(token.getSubject(), token.getClaimAsString("email")), access.organisationId())
                : plans.findByIdAndOrganisation(planId, access.organisationId());
        if (plan.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "No saved purchase plan was found.");
        var response = new java.util.LinkedHashMap<String, Object>();
        response.put("submission", approvals.submittedRecommendation(planId, access.organisationId()));
        response.put("decision", approvals.decision(planId, access.organisationId()));
        var purchase = lifecycle.purchase(planId, access.organisationId());
        response.put("purchase", purchase);
        response.put("comparison", lifecycle.comparison(plan.orElseThrow(), access.organisationId(), purchase));
        response.put("withdrawal", lifecycle.withdrawal(planId, access.organisationId()));
        response.put("revision_plan_ids", lifecycle.revisions(planId, access.organisationId()));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(response);
    }

    @PostMapping("/{planId}/decision")
    public ResponseEntity<Map<String, Object>> decide(@AuthenticationPrincipal Jwt token, @PathVariable UUID planId,
            @RequestBody PlanDecisionRequest request) {
        var access = OrganisationAccess.require(token);
        if (access.role() != OrganisationAccess.Role.MANAGER)
            throw new ApiException(HttpStatus.FORBIDDEN, "Only organisation managers can decide approval requests.");
        UUID manager = users.resolve(token.getSubject(), token.getClaimAsString("email"));
        String label = token.getClaim("name") instanceof String name && !name.isBlank() ? name
                : token.getClaim("email") instanceof String email && !email.isBlank() ? email : token.getSubject();
        var saved = approvals.decide(planId, access.organisationId(), manager, token.getSubject(), label, request);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("plan", saved.toResponse()));
    }

    @GetMapping("/approval-notifications")
    public ResponseEntity<Map<String, List<Map<String, Object>>>> notifications(@AuthenticationPrincipal Jwt token) {
        var access = OrganisationAccess.require(token);
        if (access.role() != OrganisationAccess.Role.MANAGER)
            throw new ApiException(HttpStatus.FORBIDDEN, "Only organisation managers can read approval notifications.");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(Map.of("notifications", approvals.notifications(access.organisationId())));
    }
}
