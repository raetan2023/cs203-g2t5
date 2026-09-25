package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.fasterxml.jackson.annotation.JsonProperty;

/** Request body for creating or editing a plan. The scenario date is supplied by the backend. */
public record PurchasePlanRequest(
        @JsonProperty("quantity_mt") BigDecimal quantityMt,
        @JsonProperty("purchase_deadline") LocalDate purchaseDeadline) {
}
