-- ============================================================================
-- Phase 1: Database Schema (Supabase / PostgreSQL)
-- File: database/01_create_tables.sql
-- Role: Defines the relational schema for historical market observations,
--       series metadata, and macroeconomic indicators.
-- ============================================================================

-- 1. Series Definitions (Metadata for market instruments & proxies)
CREATE TABLE MARKET_SERIES (
    id          BIGSERIAL PRIMARY KEY,
    series_key  VARCHAR(64) NOT NULL UNIQUE,
    label       VARCHAR(128) NOT NULL,
    unit        VARCHAR(32),
    currency    VARCHAR(8),
    source      VARCHAR(128),
    value_type  VARCHAR(16) NOT NULL  -- 'OBSERVED' | 'ESTIMATED'
);

-- 2. Time-series Readings (Snapshot & historical price movements for tickers + chart)
CREATE TABLE MARKET_OBSERVATIONS (
    id              BIGSERIAL PRIMARY KEY,
    series_id       BIGINT NOT NULL REFERENCES MARKET_SERIES(id),
    observed_date   DATE NOT NULL,
    value           DECIMAL(12,4) NOT NULL,
    change_abs      DECIMAL(10,4),
    change_pct      DECIMAL(8,4),
    scenario_date   DATE NOT NULL
);

-- 3. One-off Computed Indicators Per Scenario (Macroeconomic & regional maritime proxies)
CREATE TABLE MARKET_INDICATORS (
    id              BIGSERIAL PRIMARY KEY,
    series_key      VARCHAR(64) NOT NULL,
    label           VARCHAR(128) NOT NULL,
    source          VARCHAR(128),
    observed_date   DATE NOT NULL,
    value           DECIMAL(14,4) NOT NULL,
    unit            VARCHAR(32),
    scenario_date   DATE NOT NULL
);
