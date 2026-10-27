package com.cs203.mgodataapi;

/** The manager decides the saved snapshot they reviewed, never a fresh forecast. */
public record PlanDecisionRequest(String decision, String comment, String approval_fingerprint) {}
