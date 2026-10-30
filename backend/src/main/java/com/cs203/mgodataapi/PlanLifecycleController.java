package com.cs203.mgodataapi;

import java.util.Map;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/purchase-plans")
public class PlanLifecycleController {
    private final PlanLifecycleService lifecycle;
    private final UserAccounts users;
    private final OperationalDate dates;
    public PlanLifecycleController(PlanLifecycleService lifecycle, UserAccounts users, OperationalDate dates) {
        this.lifecycle = lifecycle; this.users = users; this.dates = dates;
    }

    @PostMapping("/{planId}/withdraw")
    public ResponseEntity<Map<String, Object>> withdraw(@AuthenticationPrincipal Jwt token, @PathVariable UUID planId,
            @RequestBody(required = false) PlanLifecycleService.WithdrawalRequest request) {
        var access = OrganisationAccess.requireBuyer(token);
        return plan(lifecycle.withdraw(planId, owner(token), access.organisationId(), request), HttpStatus.OK);
    }

    @PostMapping("/{planId}/revise")
    public ResponseEntity<Map<String, Object>> revise(@AuthenticationPrincipal Jwt token, @PathVariable UUID planId) {
        var access = OrganisationAccess.requireBuyer(token);
        return plan(lifecycle.revise(planId, owner(token), access.organisationId()), HttpStatus.CREATED);
    }

    @PostMapping("/{planId}/purchase")
    public ResponseEntity<Map<String, Object>> purchase(@AuthenticationPrincipal Jwt token, @PathVariable UUID planId,
            @RequestBody PlanLifecycleService.PurchaseRequest request) {
        var access = OrganisationAccess.requireBuyer(token);
        return plan(lifecycle.recordPurchase(planId, owner(token), access.organisationId(), request), HttpStatus.CREATED);
    }

    @GetMapping("/my-notifications")
    public ResponseEntity<Map<String, Object>> notifications(@AuthenticationPrincipal Jwt token) {
        var access = OrganisationAccess.requireBuyer(token);
        var buyer = owner(token);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of(
                "notifications", lifecycle.buyerNotifications(buyer, access.organisationId()),
                "unread_count", lifecycle.unreadCount(buyer, access.organisationId())));
    }

    @PostMapping("/my-notifications/{notificationId}/seen")
    public ResponseEntity<Void> seen(@AuthenticationPrincipal Jwt token, @PathVariable UUID notificationId) {
        var access = OrganisationAccess.requireBuyer(token);
        lifecycle.markSeen(notificationId, owner(token), access.organisationId());
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    private UUID owner(Jwt token) { return users.resolve(token.getSubject(), token.getClaimAsString("email")); }
    private ResponseEntity<Map<String, Object>> plan(PurchasePlan plan, HttpStatus status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of("plan", plan.toResponse(dates.today())));
    }
}
