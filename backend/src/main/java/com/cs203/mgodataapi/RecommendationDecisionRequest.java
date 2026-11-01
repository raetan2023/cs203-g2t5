package com.cs203.mgodataapi;

import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonProperty;

/** Buyer's submitted decision on the recommendation version they saw. */
public record RecommendationDecisionRequest(
        @JsonProperty("recommendation_id") String recommendationId,
        @JsonProperty("run_id") UUID runId,
        @JsonProperty("action") String action,
        @JsonProperty("decision") String decision,
        @JsonProperty("reason") String reason) {
}
