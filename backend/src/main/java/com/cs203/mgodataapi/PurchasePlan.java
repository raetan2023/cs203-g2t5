package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** A user's saved purchase plan, as stored in the purchase_plans table. */
public record PurchasePlan(
        UUID planId,
        UUID userId,
        BigDecimal quantityMt,
        LocalDate purchaseDeadline,
        LocalDate scenarioAsOfDate,
        String status,
        java.time.Instant submittedAt,
        UUID previousPlanId) {

    public PurchasePlan(UUID planId, UUID userId, BigDecimal quantityMt, LocalDate purchaseDeadline,
            LocalDate scenarioAsOfDate, String status, java.time.Instant submittedAt) {
        this(planId, userId, quantityMt, purchaseDeadline, scenarioAsOfDate, status, submittedAt, null);
    }

    public PurchasePlan(UUID planId, UUID userId, BigDecimal quantityMt, LocalDate purchaseDeadline, LocalDate scenarioAsOfDate) {
        this(planId, userId, quantityMt, purchaseDeadline, scenarioAsOfDate, "draft", null);
    }

    /** Calendar days from the scenario date to the deadline; negative if the deadline has passed. */
    public long daysRemaining() {
        return ChronoUnit.DAYS.between(scenarioAsOfDate, purchaseDeadline);
    }

    /** The response shape agreed with the frontend: snake_case, derived days included. */
    public Map<String, Object> toResponse() {
        return toResponse(scenarioAsOfDate);
    }

    /** Stored scenario is write context; reads follow the active backend scenario without a database write. */
    public Map<String, Object> toResponse(LocalDate activeScenario) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("plan_id", planId.toString());
        body.put("status", status);
        body.put("submitted_at", submittedAt == null ? null : submittedAt.toString());
        body.put("previous_plan_id", previousPlanId == null ? null : previousPlanId.toString());
        body.put("quantity_mt", quantityMt);
        body.put("purchase_deadline", purchaseDeadline.toString());
        body.put("scenario_as_of_date", activeScenario.toString());
        body.put("days_remaining", ChronoUnit.DAYS.between(activeScenario, purchaseDeadline));
        return body;
    }
}
