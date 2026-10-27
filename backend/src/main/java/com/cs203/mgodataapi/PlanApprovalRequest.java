package com.cs203.mgodataapi;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** Identifies the displayed choice. Prices, actions and evidence are recomputed server-side. */
public record PlanApprovalRequest(Integer horizon_days, UUID run_id, String recommendation_id,
        String approval_fingerprint, String urgency, BigDecimal quantity_mt,
        LocalDate purchase_deadline, LocalDate scenario_as_of_date) {}
