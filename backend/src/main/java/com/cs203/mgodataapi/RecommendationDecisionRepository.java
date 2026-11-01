package com.cs203.mgodataapi;

import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** Append-only log of buyer decisions on recommendations. Organisation-scoped; writes also require the buyer. */
@Repository
public class RecommendationDecisionRepository {

    private static final RowMapper<RecommendationDecision> MAPPER = (rs, rowNum) -> new RecommendationDecision(
            rs.getObject("decision_id", UUID.class),
            rs.getObject("plan_id", UUID.class),
            rs.getString("clerk_org_id"),
            rs.getObject("buyer_user_id", UUID.class),
            rs.getString("buyer_clerk_user_id"),
            rs.getString("recommendation_id"),
            rs.getObject("run_id", UUID.class),
            rs.getString("action"),
            rs.getString("decision"),
            rs.getString("reason"),
            rs.getTimestamp("decided_at").toInstant());

    private static final String COLUMNS =
            "decision_id, plan_id, clerk_org_id, buyer_user_id, buyer_clerk_user_id, recommendation_id, run_id, action, decision, reason, decided_at";

    private final JdbcTemplate jdbc;

    public RecommendationDecisionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public RecommendationDecision insert(UUID planId, String organisationId, UUID buyerUserId, String buyerClerkUserId,
            String recommendationId, UUID runId, String action, String decision, String reason) {
        return jdbc.queryForObject(
                "insert into plan_recommendation_decisions "
              + "(plan_id, clerk_org_id, buyer_user_id, buyer_clerk_user_id, recommendation_id, run_id, action, decision, reason) "
              + "values (?, ?, ?, ?, ?, ?, ?, ?, ?) "
              + "returning " + COLUMNS,
                MAPPER, planId, requireOrganisation(organisationId), buyerUserId, buyerClerkUserId,
                recommendationId, runId, action, decision, reason);
    }

    public List<RecommendationDecision> findByBuyer(UUID buyerUserId, String organisationId) {
        return jdbc.query(
                "select " + COLUMNS + " from plan_recommendation_decisions "
              + "where buyer_user_id = ? and clerk_org_id = ? "
              + "order by decided_at desc, decision_id",
                MAPPER, buyerUserId, requireOrganisation(organisationId));
    }

    public List<RecommendationDecision> findByBuyerAndPlan(UUID buyerUserId, String organisationId, UUID planId) {
        return jdbc.query(
                "select " + COLUMNS + " from plan_recommendation_decisions "
              + "where buyer_user_id = ? and clerk_org_id = ? and plan_id = ? "
              + "order by decided_at desc, decision_id",
                MAPPER, buyerUserId, requireOrganisation(organisationId), planId);
    }

    private static String requireOrganisation(String id) {
        if (id == null || !id.matches("org_[A-Za-z0-9]+")) {
            throw new IllegalArgumentException("An explicit Clerk organisation is required.");
        }
        return id;
    }
}
