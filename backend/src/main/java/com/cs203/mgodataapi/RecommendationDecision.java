package com.cs203.mgodataapi;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** One buyer answer to a recommendation version: accept / reject / ignore. */
public record RecommendationDecision(
        UUID decisionId,
        UUID planId,
        String clerkOrgId,
        UUID buyerUserId,
        String buyerClerkUserId,
        String recommendationId,
        UUID runId,
        String action,
        String decision,
        String reason,
        Instant decidedAt) {

    public Map<String, Object> toResponse() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", decisionId == null ? null : decisionId.toString());
        out.put("plan_id", planId == null ? null : planId.toString());
        out.put("recommendation_id", recommendationId);
        out.put("run_id", runId == null ? null : runId.toString());
        out.put("action", action);
        out.put("decision", decision);
        out.put("reason", reason);
        out.put("decided_at", decidedAt == null ? null : decidedAt.toString());
        return out;
    }
}
