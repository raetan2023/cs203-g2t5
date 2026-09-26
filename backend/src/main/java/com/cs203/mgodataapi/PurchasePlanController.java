package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The one saved purchase plan per user.
 *
 * <p>The owner comes from the verified session token, so a signed-in user can only ever
 * reach their own plan.
 */
@RestController
@RequestMapping("/api/v1/purchase-plan")
@Tag(name = "Purchase plan")
@SecurityRequirement(name = "bearerAuth")
public class PurchasePlanController {

    private final PurchasePlanRepository plans;
    private final UserAccounts users;
    private final LocalDate scenarioDate;

    public PurchasePlanController(PurchasePlanRepository plans, UserAccounts users,
            @Value("${mgo.scenario-date}") LocalDate scenarioDate) {
        this.plans = plans;
        this.users = users;
        this.scenarioDate = scenarioDate;
    }

    @GetMapping
    public Map<String, Object> get(@AuthenticationPrincipal Jwt token) {
        UUID userId = ownerOf(token);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("plan", plans.findByUser(userId).map(PurchasePlan::toResponse).orElse(null));
        return body;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(
            @AuthenticationPrincipal Jwt token,
            @RequestBody PurchasePlanRequest request) {
        UUID userId = ownerOf(token);
        validate(request);
        if (plans.findByUser(userId).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "You already have a saved plan. Edit or delete it first.");
        }
        PurchasePlan saved = plans.insert(userId, request.quantityMt(), request.purchaseDeadline(), scenarioDate);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("plan", saved.toResponse()));
    }

    @PutMapping
    public Map<String, Object> update(
            @AuthenticationPrincipal Jwt token,
            @RequestBody PurchasePlanRequest request) {
        UUID userId = ownerOf(token);
        validate(request);
        PurchasePlan updated = plans.update(userId, request.quantityMt(), request.purchaseDeadline(), scenarioDate)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No saved purchase plan was found."));
        return Map.of("plan", updated.toResponse());
    }

    @DeleteMapping
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt token) {
        UUID userId = ownerOf(token);
        if (!plans.delete(userId)) {
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

    private void validate(PurchasePlanRequest request) {
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
