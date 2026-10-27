-- Apply once via the agreed migration history, before enabling daily publication.
-- No client role may publish or read these server-owned snapshots directly.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.news_daily_features (
    date date NOT NULL,
    version text NOT NULL CHECK (length(version) > 0),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    PRIMARY KEY (date, version)
);
CREATE TABLE public.forecast_runs (
    id uuid PRIMARY KEY,
    origin_date date NOT NULL,
    model_version text NOT NULL CHECK (length(model_version) > 0),
    published_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX forecast_runs_latest ON public.forecast_runs (origin_date DESC, published_at DESC);
CREATE TABLE public.forecast_values (
    run_id uuid NOT NULL REFERENCES public.forecast_runs(id),
    horizon_days integer NOT NULL CHECK (horizon_days IN (7, 14, 30)),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'
        AND payload ? 'status' AND payload->>'status' IN ('ready', 'unavailable')),
    PRIMARY KEY (run_id, horizon_days)
);
CREATE TABLE public.forecast_active (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    run_id uuid NOT NULL REFERENCES public.forecast_runs(id)
);
ALTER TABLE public.news_daily_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_active ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.news_daily_features, public.forecast_runs, public.forecast_values, public.forecast_active FROM PUBLIC;

-- One invoker-rights transaction inserts all horizons and switches the pointer only
-- after validation succeeds. Advisory lock prevents concurrent publications racing.
CREATE FUNCTION public.publish_forecast_run(run_json jsonb, forecasts_json jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
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
            IF news_start IS DISTINCT FROM ((utc_day - 1)::timestamp AT TIME ZONE 'UTC')
               OR news_end IS DISTINCT FROM (utc_day::timestamp AT TIME ZONE 'UTC')
               OR NOT EXISTS (SELECT FROM public.news_daily_features n
                              WHERE n.date = utc_day - 1 AND n.version = merged->>'news_feature_version'
                                AND n.payload->>'status' = 'complete'
                                AND (n.payload->>'news_date')::date = n.date
                                AND (n.payload->>'start')::timestamptz = news_start
                                AND (n.payload->>'end')::timestamptz = news_end
                                AND n.version = (n.payload->>'version') || ':' ||
                                    (n.payload->>'classification_version') || ':' || (n.payload->>'classifier_id')) THEN
                RAISE EXCEPTION 'Ready forecast needs the completed previous UTC news window and stored news version';
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
REVOKE ALL ON FUNCTION public.publish_forecast_run(jsonb,jsonb) FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('REVOKE ALL ON public.news_daily_features, public.forecast_runs, public.forecast_values, public.forecast_active FROM %I', role_name);
            EXECUTE format('REVOKE ALL ON FUNCTION public.publish_forecast_run(jsonb,jsonb) FROM %I', role_name);
        END IF;
    END LOOP;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT SELECT, INSERT, UPDATE ON public.news_daily_features TO service_role;
        GRANT SELECT, INSERT ON public.forecast_runs, public.forecast_values TO service_role;
        GRANT SELECT, INSERT, UPDATE ON public.forecast_active TO service_role;
        GRANT EXECUTE ON FUNCTION public.publish_forecast_run(jsonb,jsonb) TO service_role;
    END IF;
END;
$$;
-- Supabase Storage is optional in disposable PostgreSQL checks. The bucket is
-- private; no browser policy is added. Existing public buckets fail closed.
DO $$
BEGIN
    IF to_regclass('storage.buckets') IS NOT NULL THEN
        IF EXISTS (SELECT FROM storage.buckets WHERE id = 'forecast-models' AND public = true) THEN
            RAISE EXCEPTION 'forecast-models bucket must be private';
        END IF;
        INSERT INTO storage.buckets(id, name, public) VALUES ('forecast-models', 'forecast-models', false)
        ON CONFLICT(id) DO NOTHING;
    END IF;
END;
$$;
COMMIT;
