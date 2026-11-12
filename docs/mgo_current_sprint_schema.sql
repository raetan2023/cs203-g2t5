-- =====================================================================
-- Bunker Buddy database schema (public schema)
-- Exported from the shared database on 9 November 2026.
--
-- This is a reference, and can build an empty database for local testing.
-- Do not run it against an existing database. Changes to the shared
-- database are made through the files in backend/migrations.
--
-- Row Level Security is on for every table, with no browser policies.
-- Only the backend reads and writes these tables.
-- =====================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: publish_forecast_run(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_forecast_run(run_json jsonb, forecasts_json jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
    run_id uuid;
    origin_day date;
    current_origin date;
    started_at timestamptz;
    current_started_at timestamptz;
    value jsonb;
    common jsonb;
    merged jsonb;
    horizon integer;
    source text;
    source_day date;
    news_start timestamptz;
    news_end timestamptz;
    utc_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
    IF jsonb_typeof(run_json) IS DISTINCT FROM 'object'
       OR jsonb_typeof(run_json->'payload') IS DISTINCT FROM 'object'
       OR jsonb_typeof(forecasts_json) IS DISTINCT FROM 'array'
       OR jsonb_array_length(forecasts_json) <> 3 THEN
        RAISE EXCEPTION 'Run object and exactly three forecast payloads required';
    END IF;
    run_id := (run_json->>'id')::uuid;
    origin_day := (run_json->>'origin_date')::date;
    common := run_json->'payload';
    started_at := (common->>'run_started_at')::timestamptz;
    IF started_at IS NULL OR started_at > now() + interval '1 minute' THEN
        RAISE EXCEPTION 'Valid run_started_at required';
    END IF;
    IF run_id IS NULL OR origin_day IS NULL OR origin_day <> (now() AT TIME ZONE 'Asia/Singapore')::date
       OR coalesce(length(run_json->>'model_version'), 0) = 0 THEN
        RAISE EXCEPTION 'Run ID, current Singapore origin and model version required';
    END IF;
    IF (SELECT count(DISTINCT (v->>'horizon_days')::integer) FROM jsonb_array_elements(forecasts_json) v) <> 3
       OR EXISTS (SELECT FROM jsonb_array_elements(forecasts_json) v
                  WHERE (v->>'horizon_days')::integer NOT IN (7,14,30) OR v->>'horizon_days' IS NULL) THEN
        RAISE EXCEPTION 'Horizon set must be exactly 7, 14, 30';
    END IF;
    PERFORM pg_advisory_xact_lock(20320261026);
    SELECT r.origin_date, (r.payload->>'run_started_at')::timestamptz INTO current_origin, current_started_at FROM public.forecast_active a
      JOIN public.forecast_runs r ON r.id = a.run_id WHERE a.singleton;
    IF current_origin IS NOT NULL AND (current_origin > origin_day OR
            (current_origin = origin_day AND current_started_at >= started_at)) THEN
        RAISE EXCEPTION 'An older origin or run cannot replace a newer publication';
    END IF;
    FOR value IN SELECT * FROM jsonb_array_elements(forecasts_json) LOOP
        merged := common || value;
        horizon := (value->>'horizon_days')::integer;
        IF value->>'status' = 'ready' THEN
            IF (merged->>'forecast_origin_date')::date IS DISTINCT FROM origin_day
               OR (merged->>'as_of_date')::date IS DISTINCT FROM origin_day
               OR (merged->>'target_date')::date IS DISTINCT FROM origin_day + horizon
               OR merged->>'unit' IS DISTINCT FROM 'USD/metric tonne' THEN
                RAISE EXCEPTION 'Ready forecast origin, target or unit is invalid';
            END IF;
            IF (merged->>'anchor_price')::numeric IS NULL OR (merged->>'anchor_price')::numeric <= 0
               OR (merged->>'forecast')::numeric IS NULL OR (merged->>'forecast')::numeric < 0
               OR (merged->>'low')::numeric IS NULL OR (merged->>'high')::numeric IS NULL
               OR (merged->>'low')::numeric < 0 OR (merged->>'low')::numeric > (merged->>'high')::numeric
               OR merged->>'anchor_price' IN ('NaN','Infinity','-Infinity')
               OR merged->>'forecast' IN ('NaN','Infinity','-Infinity')
               OR merged->>'low' IN ('NaN','Infinity','-Infinity')
               OR merged->>'high' IN ('NaN','Infinity','-Infinity')
               OR (merged->>'raw_q10_price')::numeric IS NULL OR (merged->>'raw_q90_price')::numeric IS NULL
               OR (merged->>'raw_q10_price')::numeric <= 0
               OR (merged->>'raw_q10_price')::numeric > (merged->>'raw_q90_price')::numeric
               OR merged->>'raw_q10_price' IN ('NaN','Infinity','-Infinity')
               OR merged->>'raw_q90_price' IN ('NaN','Infinity','-Infinity') THEN
                RAISE EXCEPTION 'Ready forecast prices must be finite nonnegative ordered values';
            END IF;
            IF jsonb_typeof(merged->'source_dates') IS DISTINCT FROM 'object' THEN
                RAISE EXCEPTION 'Ready forecast source dates required';
            END IF;
            FOREACH source IN ARRAY ARRAY['mgo','gasoil','brent','dubai','usd'] LOOP
                source_day := (merged->'source_dates'->>source)::date;
                IF source_day IS NULL OR source_day > origin_day OR source_day < origin_day - 7 THEN
                    RAISE EXCEPTION 'Market source % is missing, future or older than seven days', source;
                END IF;
            END LOOP;
            IF (merged->>'anchor_quote_date')::date IS DISTINCT FROM (merged->'source_dates'->>'mgo')::date
               OR (merged->>'quote_age_days')::integer IS DISTINCT FROM origin_day - (merged->>'anchor_quote_date')::date THEN
                RAISE EXCEPTION 'MGO anchor metadata does not match source dates';
            END IF;
            news_start := (merged->>'news_window_start')::timestamptz;
            news_end := (merged->>'news_window_end')::timestamptz;
            IF news_start IS NULL OR news_end IS NULL
               OR news_end - news_start <> interval '24 hours'
               OR news_end > now() OR news_end < now() - interval '7 days'
               OR NOT EXISTS (SELECT FROM public.news_daily_features n
                              WHERE n.date = (news_start AT TIME ZONE 'UTC')::date AND n.version = merged->>'news_feature_version'
                                AND n.payload->>'status' = 'complete'
                                AND (n.payload->>'news_date')::date = n.date
                                AND (n.payload->>'start')::timestamptz = news_start
                                AND (n.payload->>'end')::timestamptz = news_end
                                AND n.version = (n.payload->>'version') || ':' ||
                                    (n.payload->>'classification_version') || ':' || (n.payload->>'classifier_id') ||
                                    CASE WHEN n.payload->>'window_type' = 'rolling_24h' THEN ':rolling24h:' || (n.payload->>'end') ELSE '' END) THEN
                RAISE EXCEPTION 'Ready forecast needs the latest complete 24-hour news window within seven days and stored news version';
            END IF;
            IF merged->'interval'->>'method' IS DISTINCT FROM 'gdelt_error_quantiles'
               OR (merged->'interval'->>'nominal_coverage')::numeric IS DISTINCT FROM 0.8
               OR (merged->'interval'->>'evaluation_rows')::integer IS NULL
               OR (merged->'interval'->>'evaluation_rows')::integer < 40
               OR (merged->'interval'->>'empirical_coverage')::numeric IS NULL
               OR NOT ((merged->'interval'->>'empirical_coverage')::numeric BETWEEN 0 AND 1)
               OR (merged->'interval'->>'baseline_coverage')::numeric IS NULL
               OR NOT ((merged->'interval'->>'baseline_coverage')::numeric BETWEEN 0 AND 1)
               OR (merged->'interval'->>'mean_width')::numeric IS NULL
               OR (merged->'interval'->>'mean_width')::numeric < 0
               OR (merged->'interval'->>'baseline_mean_width')::numeric IS NULL
               OR (merged->'interval'->>'baseline_mean_width')::numeric < 0
               OR jsonb_typeof(merged->'top_drivers') IS DISTINCT FROM 'array'
               OR jsonb_typeof(merged->'history') IS DISTINCT FROM 'array' THEN
                RAISE EXCEPTION 'Ready forecast interval, drivers and history required';
            END IF;
        ELSIF value->>'status' = 'unavailable' THEN
            IF coalesce(length(value->>'reason'),0) = 0 OR coalesce(length(value->>'message'),0) = 0 THEN
                RAISE EXCEPTION 'Unavailable forecast requires reason and message';
            END IF;
        ELSE
            RAISE EXCEPTION 'Forecast status must be ready or unavailable';
        END IF;
    END LOOP;
    INSERT INTO public.forecast_runs(id, origin_date, model_version, payload)
    VALUES (run_id, origin_day, run_json->>'model_version', common);
    INSERT INTO public.forecast_values(run_id, horizon_days, payload)
    SELECT run_id, (v->>'horizon_days')::integer, v FROM jsonb_array_elements(forecasts_json) v;
    INSERT INTO public.forecast_active(singleton, run_id) VALUES (true, run_id)
    ON CONFLICT (singleton) DO UPDATE SET run_id = EXCLUDED.run_id;
    RETURN run_id;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: forecast_active; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forecast_active (
    singleton boolean DEFAULT true NOT NULL,
    run_id uuid NOT NULL,
    CONSTRAINT forecast_active_singleton_check CHECK (singleton)
);


--
-- Name: forecast_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forecast_runs (
    id uuid NOT NULL,
    origin_date date NOT NULL,
    model_version text NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb NOT NULL,
    CONSTRAINT forecast_runs_model_version_check CHECK ((length(model_version) > 0)),
    CONSTRAINT forecast_runs_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text))
);


--
-- Name: forecast_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forecast_values (
    run_id uuid NOT NULL,
    horizon_days integer NOT NULL,
    payload jsonb NOT NULL,
    CONSTRAINT forecast_values_horizon_days_check CHECK ((horizon_days = ANY (ARRAY[7, 14, 30]))),
    CONSTRAINT forecast_values_payload_check CHECK (((jsonb_typeof(payload) = 'object'::text) AND (payload ? 'status'::text) AND ((payload ->> 'status'::text) = ANY (ARRAY['ready'::text, 'unavailable'::text]))))
);


--
-- Name: market_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_observations (
    observation_id uuid DEFAULT gen_random_uuid() NOT NULL,
    series_id uuid NOT NULL,
    observation_date date NOT NULL,
    value numeric NOT NULL,
    value_type text NOT NULL,
    availability_timestamp timestamp with time zone
);


--
-- Name: market_series; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_series (
    series_id uuid DEFAULT gen_random_uuid() NOT NULL,
    series_key text NOT NULL,
    source_name text NOT NULL,
    source_url text,
    currency_code text,
    unit text,
    price_definition text,
    contract_description text
);


--
-- Name: news_daily_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_daily_features (
    date date NOT NULL,
    version text NOT NULL,
    payload jsonb NOT NULL,
    CONSTRAINT news_daily_features_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT news_daily_features_version_check CHECK ((length(version) > 0))
);


--
-- Name: organisation_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organisation_members (
    user_id uuid NOT NULL,
    clerk_org_id text NOT NULL,
    role text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organisation_members_clerk_org_id_check CHECK ((clerk_org_id ~ '^org_[A-Za-z0-9]+$'::text)),
    CONSTRAINT organisation_members_role_check CHECK ((role = ANY (ARRAY['org:officer'::text, 'org:manager'::text, 'org:admin'::text])))
);


--
-- Name: plan_approval_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_approval_decisions (
    decision_id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    clerk_org_id text NOT NULL,
    manager_user_id uuid NOT NULL,
    manager_clerk_user_id text NOT NULL,
    manager_label text NOT NULL,
    decision text NOT NULL,
    decision_comment text DEFAULT ''::text NOT NULL,
    decided_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_approval_decisions_clerk_org_id_check CHECK ((clerk_org_id ~ '^org_[A-Za-z0-9]+$'::text)),
    CONSTRAINT plan_approval_decisions_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'rejected'::text]))),
    CONSTRAINT plan_approval_decisions_decision_comment_check CHECK ((length(decision_comment) <= 2000)),
    CONSTRAINT plan_approval_decisions_manager_clerk_user_id_check CHECK ((length(btrim(manager_clerk_user_id)) > 0)),
    CONSTRAINT rejection_requires_reason CHECK (((decision <> 'rejected'::text) OR (length(btrim(decision_comment)) > 0)))
);


--
-- Name: plan_approval_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_approval_notifications (
    notification_id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    clerk_org_id text NOT NULL,
    buyer_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recommendation_snapshot jsonb,
    CONSTRAINT plan_approval_notifications_clerk_org_id_check CHECK ((clerk_org_id ~ '^org_[A-Za-z0-9]+$'::text)),
    CONSTRAINT plan_approval_snapshot_object_check CHECK (((recommendation_snapshot IS NULL) OR ((jsonb_typeof(recommendation_snapshot) = 'object'::text) AND (recommendation_snapshot ? 'horizon_days'::text) AND ((recommendation_snapshot ->> 'horizon_days'::text) = ANY (ARRAY['7'::text, '14'::text, '30'::text])) AND (recommendation_snapshot ? 'analysis'::text) AND (jsonb_typeof((recommendation_snapshot -> 'analysis'::text)) = 'object'::text))))
);


--
-- Name: plan_decision_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_decision_notifications (
    notification_id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    clerk_org_id text NOT NULL,
    buyer_user_id uuid NOT NULL,
    decision text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    seen_at timestamp with time zone,
    CONSTRAINT plan_decision_notifications_check CHECK (((seen_at IS NULL) OR (seen_at >= created_at))),
    CONSTRAINT plan_decision_notifications_clerk_org_id_check CHECK ((clerk_org_id ~ '^org_[A-Za-z0-9]+$'::text)),
    CONSTRAINT plan_decision_notifications_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'rejected'::text])))
);


--
-- Name: plan_recommendation_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_recommendation_decisions (
    decision_id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    clerk_org_id text NOT NULL,
    buyer_user_id uuid NOT NULL,
    buyer_clerk_user_id text NOT NULL,
    recommendation_id text NOT NULL,
    run_id uuid,
    action text,
    decision text NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    decided_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_recommendation_decisions_buyer_clerk_user_id_check CHECK ((length(btrim(buyer_clerk_user_id)) > 0)),
    CONSTRAINT plan_recommendation_decisions_clerk_org_id_check CHECK ((clerk_org_id ~ '^org_[A-Za-z0-9]+$'::text)),
    CONSTRAINT plan_recommendation_decisions_decision_check CHECK ((decision = ANY (ARRAY['accept'::text, 'reject'::text, 'ignore'::text]))),
    CONSTRAINT plan_recommendation_decisions_reason_check CHECK ((length(reason) <= 2000)),
    CONSTRAINT plan_recommendation_decisions_recommendation_id_check CHECK ((length(btrim(recommendation_id)) > 0)),
    CONSTRAINT reject_requires_reason CHECK (((decision <> 'reject'::text) OR (length(btrim(reason)) > 0)))
);


--
-- Name: plan_withdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_withdrawals (
    plan_id uuid NOT NULL,
    clerk_org_id text NOT NULL,
    buyer_user_id uuid NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    withdrawn_at timestamp with time zone DEFAULT now() NOT NULL,
    manager_user_id uuid,
    CONSTRAINT plan_withdrawals_clerk_org_id_check CHECK ((clerk_org_id ~ '^org_[A-Za-z0-9]+$'::text)),
    CONSTRAINT plan_withdrawals_reason_check CHECK ((length(reason) <= 2000))
);


--
-- Name: pm_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pm_assignments (
    po_user_id uuid NOT NULL,
    clerk_org_id text NOT NULL,
    pm_user_id uuid NOT NULL,
    assigned_by_user_id uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pm_assignments_not_self CHECK ((po_user_id <> pm_user_id))
);


--
-- Name: purchase_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_plans (
    plan_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    quantity_mt numeric NOT NULL,
    purchase_deadline date NOT NULL,
    scenario_as_of_date date NOT NULL,
    clerk_org_id text,
    status text DEFAULT 'draft'::text NOT NULL,
    submitted_at timestamp with time zone,
    previous_plan_id uuid,
    closed_reason text,
    closed_at timestamp with time zone,
    CONSTRAINT purchase_plans_closed_reason_check CHECK ((closed_reason = ANY (ARRAY['role_change'::text, 'deadline_passed'::text]))),
    CONSTRAINT purchase_plans_no_self_revision CHECK (((previous_plan_id IS NULL) OR (previous_plan_id <> plan_id))),
    CONSTRAINT purchase_plans_quantity_mt_check CHECK ((quantity_mt > (0)::numeric)),
    CONSTRAINT purchase_plans_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text, 'purchased'::text, 'closed'::text]))),
    CONSTRAINT purchase_plans_submission_time_check CHECK ((((status = 'draft'::text) AND (submitted_at IS NULL)) OR ((status <> 'draft'::text) AND (submitted_at IS NOT NULL))))
);


--
-- Name: purchase_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_records (
    purchase_id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    clerk_org_id text NOT NULL,
    buyer_user_id uuid NOT NULL,
    purchased_on date NOT NULL,
    supplier text NOT NULL,
    quantity_mt numeric NOT NULL,
    price_usd_per_mt numeric NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_records_clerk_org_id_check CHECK ((clerk_org_id ~ '^org_[A-Za-z0-9]+$'::text)),
    CONSTRAINT purchase_records_note_check CHECK ((length(note) <= 2000)),
    CONSTRAINT purchase_records_price_usd_per_mt_check CHECK (((price_usd_per_mt > (0)::numeric) AND (price_usd_per_mt < ('1000000000000'::bigint)::numeric) AND (scale(price_usd_per_mt) <= 6))),
    CONSTRAINT purchase_records_quantity_mt_check CHECK (((quantity_mt > (0)::numeric) AND (quantity_mt < ('1000000000000'::bigint)::numeric) AND (scale(quantity_mt) <= 6))),
    CONSTRAINT purchase_records_supplier_check CHECK (((length(btrim(supplier)) >= 1) AND (length(btrim(supplier)) <= 200)))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    user_id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    clerk_user_id text NOT NULL,
    display_name text,
    CONSTRAINT users_display_name_length CHECK (((display_name IS NULL) OR (length(display_name) <= 200)))
);


--
-- Name: forecast_active forecast_active_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forecast_active
    ADD CONSTRAINT forecast_active_pkey PRIMARY KEY (singleton);


--
-- Name: forecast_runs forecast_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forecast_runs
    ADD CONSTRAINT forecast_runs_pkey PRIMARY KEY (id);


--
-- Name: forecast_values forecast_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forecast_values
    ADD CONSTRAINT forecast_values_pkey PRIMARY KEY (run_id, horizon_days);


--
-- Name: market_observations market_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_observations
    ADD CONSTRAINT market_observations_pkey PRIMARY KEY (observation_id);


--
-- Name: market_observations market_observations_series_id_observation_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_observations
    ADD CONSTRAINT market_observations_series_id_observation_date_key UNIQUE (series_id, observation_date);


--
-- Name: market_series market_series_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_series
    ADD CONSTRAINT market_series_pkey PRIMARY KEY (series_id);


--
-- Name: market_series market_series_series_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_series
    ADD CONSTRAINT market_series_series_key_key UNIQUE (series_key);


--
-- Name: news_daily_features news_daily_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_daily_features
    ADD CONSTRAINT news_daily_features_pkey PRIMARY KEY (date, version);


--
-- Name: organisation_members organisation_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisation_members
    ADD CONSTRAINT organisation_members_pkey PRIMARY KEY (user_id, clerk_org_id);


--
-- Name: plan_approval_decisions plan_approval_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_approval_decisions
    ADD CONSTRAINT plan_approval_decisions_pkey PRIMARY KEY (decision_id);


--
-- Name: plan_approval_decisions plan_approval_decisions_plan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_approval_decisions
    ADD CONSTRAINT plan_approval_decisions_plan_id_key UNIQUE (plan_id);


--
-- Name: plan_approval_notifications plan_approval_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_approval_notifications
    ADD CONSTRAINT plan_approval_notifications_pkey PRIMARY KEY (notification_id);


--
-- Name: plan_approval_notifications plan_approval_notifications_plan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_approval_notifications
    ADD CONSTRAINT plan_approval_notifications_plan_id_key UNIQUE (plan_id);


--
-- Name: plan_decision_notifications plan_decision_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_decision_notifications
    ADD CONSTRAINT plan_decision_notifications_pkey PRIMARY KEY (notification_id);


--
-- Name: plan_decision_notifications plan_decision_notifications_plan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_decision_notifications
    ADD CONSTRAINT plan_decision_notifications_plan_id_key UNIQUE (plan_id);


--
-- Name: plan_approval_decisions plan_decisions_outcome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_approval_decisions
    ADD CONSTRAINT plan_decisions_outcome_key UNIQUE (plan_id, clerk_org_id, decision);


--
-- Name: plan_recommendation_decisions plan_recommendation_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_recommendation_decisions
    ADD CONSTRAINT plan_recommendation_decisions_pkey PRIMARY KEY (decision_id);


--
-- Name: plan_withdrawals plan_withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_withdrawals
    ADD CONSTRAINT plan_withdrawals_pkey PRIMARY KEY (plan_id);


--
-- Name: pm_assignments pm_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_assignments
    ADD CONSTRAINT pm_assignments_pkey PRIMARY KEY (po_user_id, clerk_org_id);


--
-- Name: purchase_plans purchase_plans_owner_org_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_plans
    ADD CONSTRAINT purchase_plans_owner_org_key UNIQUE (plan_id, clerk_org_id, user_id);


--
-- Name: purchase_plans purchase_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_plans
    ADD CONSTRAINT purchase_plans_pkey PRIMARY KEY (plan_id);


--
-- Name: purchase_records purchase_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_records
    ADD CONSTRAINT purchase_records_pkey PRIMARY KEY (purchase_id);


--
-- Name: purchase_records purchase_records_plan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_records
    ADD CONSTRAINT purchase_records_plan_id_key UNIQUE (plan_id);


--
-- Name: users users_clerk_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_clerk_user_id_key UNIQUE (clerk_user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: forecast_runs_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX forecast_runs_latest ON public.forecast_runs USING btree (origin_date DESC, published_at DESC);


--
-- Name: idx_market_observations_series_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_market_observations_series_date ON public.market_observations USING btree (series_id, observation_date);


--
-- Name: market_observations_series_date_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX market_observations_series_date_uq ON public.market_observations USING btree (series_id, observation_date);


--
-- Name: organisation_members_org_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organisation_members_org_role_idx ON public.organisation_members USING btree (clerk_org_id, role);


--
-- Name: plan_approval_decisions_org_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_approval_decisions_org_date_idx ON public.plan_approval_decisions USING btree (clerk_org_id, decided_at DESC);


--
-- Name: plan_approval_notifications_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_approval_notifications_org_created_idx ON public.plan_approval_notifications USING btree (clerk_org_id, created_at DESC, notification_id DESC);


--
-- Name: plan_decision_notifications_buyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_decision_notifications_buyer_idx ON public.plan_decision_notifications USING btree (clerk_org_id, buyer_user_id, created_at DESC, notification_id DESC);


--
-- Name: plan_decision_notifications_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_decision_notifications_unread_idx ON public.plan_decision_notifications USING btree (clerk_org_id, buyer_user_id) WHERE (seen_at IS NULL);


--
-- Name: plan_recommendation_decisions_buyer_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_recommendation_decisions_buyer_date_idx ON public.plan_recommendation_decisions USING btree (clerk_org_id, buyer_user_id, decided_at DESC);


--
-- Name: plan_recommendation_decisions_plan_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_recommendation_decisions_plan_date_idx ON public.plan_recommendation_decisions USING btree (plan_id, decided_at DESC);


--
-- Name: pm_assignments_pm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pm_assignments_pm_idx ON public.pm_assignments USING btree (clerk_org_id, pm_user_id);


--
-- Name: purchase_plans_org_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_plans_org_user_idx ON public.purchase_plans USING btree (clerk_org_id, user_id);


--
-- Name: purchase_plans_revision_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_plans_revision_idx ON public.purchase_plans USING btree (previous_plan_id, clerk_org_id) WHERE (previous_plan_id IS NOT NULL);


--
-- Name: purchase_plans_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_plans_user_id_idx ON public.purchase_plans USING btree (user_id);


--
-- Name: purchase_records_org_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_records_org_date_idx ON public.purchase_records USING btree (clerk_org_id, purchased_on DESC);


--
-- Name: forecast_active forecast_active_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forecast_active
    ADD CONSTRAINT forecast_active_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.forecast_runs(id);


--
-- Name: forecast_values forecast_values_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forecast_values
    ADD CONSTRAINT forecast_values_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.forecast_runs(id);


--
-- Name: market_observations market_observations_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_observations
    ADD CONSTRAINT market_observations_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.market_series(series_id) ON DELETE RESTRICT;


--
-- Name: organisation_members organisation_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisation_members
    ADD CONSTRAINT organisation_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: plan_approval_decisions plan_approval_decisions_manager_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_approval_decisions
    ADD CONSTRAINT plan_approval_decisions_manager_user_id_fkey FOREIGN KEY (manager_user_id) REFERENCES public.users(user_id) ON DELETE RESTRICT;


--
-- Name: plan_approval_decisions plan_approval_decisions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_approval_decisions
    ADD CONSTRAINT plan_approval_decisions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.purchase_plans(plan_id) ON DELETE RESTRICT;


--
-- Name: plan_approval_notifications plan_approval_notifications_buyer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_approval_notifications
    ADD CONSTRAINT plan_approval_notifications_buyer_user_id_fkey FOREIGN KEY (buyer_user_id) REFERENCES public.users(user_id);


--
-- Name: plan_approval_notifications plan_approval_notifications_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_approval_notifications
    ADD CONSTRAINT plan_approval_notifications_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.purchase_plans(plan_id) ON DELETE CASCADE;


--
-- Name: plan_decision_notifications plan_decision_notifications_plan_id_clerk_org_id_buyer_use_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_decision_notifications
    ADD CONSTRAINT plan_decision_notifications_plan_id_clerk_org_id_buyer_use_fkey FOREIGN KEY (plan_id, clerk_org_id, buyer_user_id) REFERENCES public.purchase_plans(plan_id, clerk_org_id, user_id) ON DELETE RESTRICT;


--
-- Name: plan_decision_notifications plan_decision_notifications_plan_id_clerk_org_id_decision_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_decision_notifications
    ADD CONSTRAINT plan_decision_notifications_plan_id_clerk_org_id_decision_fkey FOREIGN KEY (plan_id, clerk_org_id, decision) REFERENCES public.plan_approval_decisions(plan_id, clerk_org_id, decision) ON DELETE RESTRICT;


--
-- Name: plan_recommendation_decisions plan_recommendation_decisions_buyer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_recommendation_decisions
    ADD CONSTRAINT plan_recommendation_decisions_buyer_user_id_fkey FOREIGN KEY (buyer_user_id) REFERENCES public.users(user_id) ON DELETE RESTRICT;


--
-- Name: plan_recommendation_decisions plan_recommendation_decisions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_recommendation_decisions
    ADD CONSTRAINT plan_recommendation_decisions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.purchase_plans(plan_id) ON DELETE RESTRICT;


--
-- Name: plan_withdrawals plan_withdrawals_plan_id_clerk_org_id_buyer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_withdrawals
    ADD CONSTRAINT plan_withdrawals_plan_id_clerk_org_id_buyer_user_id_fkey FOREIGN KEY (plan_id, clerk_org_id, buyer_user_id) REFERENCES public.purchase_plans(plan_id, clerk_org_id, user_id) ON DELETE RESTRICT;


--
-- Name: pm_assignments pm_assignments_assigned_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_assignments
    ADD CONSTRAINT pm_assignments_assigned_by_user_id_fkey FOREIGN KEY (assigned_by_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: pm_assignments pm_assignments_pm_member; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_assignments
    ADD CONSTRAINT pm_assignments_pm_member FOREIGN KEY (pm_user_id, clerk_org_id) REFERENCES public.organisation_members(user_id, clerk_org_id) ON DELETE CASCADE;


--
-- Name: pm_assignments pm_assignments_po_member; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_assignments
    ADD CONSTRAINT pm_assignments_po_member FOREIGN KEY (po_user_id, clerk_org_id) REFERENCES public.organisation_members(user_id, clerk_org_id) ON DELETE CASCADE;


--
-- Name: purchase_plans purchase_plans_revision_owner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_plans
    ADD CONSTRAINT purchase_plans_revision_owner_fk FOREIGN KEY (previous_plan_id, clerk_org_id, user_id) REFERENCES public.purchase_plans(plan_id, clerk_org_id, user_id) ON DELETE RESTRICT;


--
-- Name: purchase_plans purchase_plans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_plans
    ADD CONSTRAINT purchase_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: purchase_records purchase_records_plan_id_clerk_org_id_buyer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_records
    ADD CONSTRAINT purchase_records_plan_id_clerk_org_id_buyer_user_id_fkey FOREIGN KEY (plan_id, clerk_org_id, buyer_user_id) REFERENCES public.purchase_plans(plan_id, clerk_org_id, user_id) ON DELETE RESTRICT;


--
-- Name: forecast_active; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forecast_active ENABLE ROW LEVEL SECURITY;

--
-- Name: forecast_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forecast_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: forecast_values; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forecast_values ENABLE ROW LEVEL SECURITY;

--
-- Name: market_observations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.market_observations ENABLE ROW LEVEL SECURITY;

--
-- Name: market_series; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.market_series ENABLE ROW LEVEL SECURITY;

--
-- Name: news_daily_features; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.news_daily_features ENABLE ROW LEVEL SECURITY;

--
-- Name: organisation_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organisation_members ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_approval_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_approval_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_approval_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_approval_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_decision_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_decision_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_recommendation_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_recommendation_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_withdrawals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_withdrawals ENABLE ROW LEVEL SECURITY;

--
-- Name: pm_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pm_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_records ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


