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
        BigDecimal quantityMt,
        LocalDate purchaseDeadline,
        LocalDate scenarioAsOfDate) {

    /** Calendar days from the scenario date to the deadline; negative if the deadline has passed. */
    public long daysRemaining() {
        return ChronoUnit.DAYS.between(scenarioAsOfDate, purchaseDeadline);
    }

    /** The response shape agreed with the frontend: snake_case, derived days included. */
    public Map<String, Object> toResponse() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("plan_id", planId.toString());
        body.put("quantity_mt", quantityMt);
        body.put("purchase_deadline", purchaseDeadline.toString());
        body.put("scenario_as_of_date", scenarioAsOfDate.toString());
        body.put("days_remaining", daysRemaining());
        return body;
    }
}
