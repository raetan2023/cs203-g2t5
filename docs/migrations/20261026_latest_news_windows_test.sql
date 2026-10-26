-- Disposable database only, after BOTH forecast migrations.
-- A rolling archive three days old is valid; all fixture writes roll back.
BEGIN;
DO $$
DECLARE
    origin_day date := (now() AT TIME ZONE 'Asia/Singapore')::date;
    news_end timestamptz := date_trunc('hour', now()) - interval '3 days 15 minutes';
    news_start timestamptz := news_end - interval '24 hours';
    news_day date := (news_start AT TIME ZONE 'UTC')::date;
    feature_version text := '1:smoke:test:rolling24h:' || (to_jsonb(news_end) #>> '{}');
    good_id uuid := '00000000-0000-0000-0000-000000000001';
    failed_id uuid := '00000000-0000-0000-0000-000000000002';
    run_doc jsonb;
    values_doc jsonb;
    bad_doc jsonb;
    pointer uuid;
    caught boolean;
BEGIN
    INSERT INTO public.news_daily_features VALUES (news_day, feature_version,
        jsonb_build_object('version',1,'classification_version','smoke','classifier_id','test','news_date',news_day,
            'status','complete','window_type','rolling_24h','start',news_start,'end',news_end));
    run_doc := jsonb_build_object('id',good_id,'origin_date',origin_day,'model_version','smoke-v1','payload',
        jsonb_build_object('run_started_at',now()-interval '10 seconds','news_feature_version',feature_version));
    SELECT jsonb_agg(jsonb_build_object('status','ready','horizon_days',h,
        'forecast_origin_date',origin_day,'as_of_date',origin_day,'target_date',origin_day+h,
        'anchor_quote_date',origin_day-1,'anchor_price',800,'quote_age_days',1,
        'forecast',850,'low',700,'high',820,'raw_q10_price',720,'raw_q90_price',810,'unit','USD/metric tonne',
        'source_dates',jsonb_build_object('mgo',origin_day-1,'gasoil',origin_day-1,'brent',origin_day-2,'dubai',origin_day-1,'usd',origin_day-2),
        'news_window_start',news_start,'news_window_end',news_end,
        'interval',jsonb_build_object('method','gdelt_error_quantiles','nominal_coverage',0.8,
            'empirical_coverage',0.79,'evaluation_rows',64,'baseline_coverage',0.82,'mean_width',380,'baseline_mean_width',250),
        'history','[]'::jsonb,'top_drivers','[]'::jsonb)) INTO values_doc FROM unnest(ARRAY[7,14,30]) h;
    PERFORM public.publish_forecast_run(run_doc, values_doc);
    SELECT run_id INTO pointer FROM public.forecast_active;
    IF pointer <> good_id OR (SELECT count(*) FROM public.forecast_values WHERE run_id=good_id) <> 3 THEN
        RAISE EXCEPTION 'Atomic successful publication failed';
    END IF;
    -- Duplicate horizons must fail and leave the previous snapshot intact.
    caught := false;
    BEGIN
        PERFORM public.publish_forecast_run(run_doc || jsonb_build_object('id',failed_id),
            jsonb_build_array(values_doc->0,values_doc->0,values_doc->2));
    EXCEPTION WHEN raise_exception THEN caught := true;
    END;
    IF NOT caught THEN RAISE EXCEPTION 'Duplicate horizons were accepted'; END IF;
    -- A slower old run cannot replace a newer same-day run.
    caught := false;
    BEGIN
        PERFORM public.publish_forecast_run(run_doc || jsonb_build_object('id',failed_id),values_doc);
    EXCEPTION WHEN raise_exception THEN caught := true;
    END;
    IF NOT caught THEN RAISE EXCEPTION 'Old same-day run was accepted'; END IF;
    run_doc := run_doc || jsonb_build_object('id',failed_id,'payload',
        jsonb_build_object('run_started_at',now(),'news_feature_version',feature_version));
    -- Reversed interval cannot be activated, even when the central point is independent.
    bad_doc := jsonb_set(values_doc,'{0,low}','900'); caught := false;
    BEGIN
        PERFORM public.publish_forecast_run(run_doc,bad_doc);
    EXCEPTION WHEN raise_exception THEN caught := true;
    END;
    IF NOT caught THEN RAISE EXCEPTION 'Reversed bounds were accepted'; END IF;
    -- Missing stored news versions cannot be advertised as ready.
    caught := false;
    BEGIN
        PERFORM public.publish_forecast_run(jsonb_set(run_doc,'{payload,news_feature_version}','"missing"'),values_doc);
    EXCEPTION WHEN raise_exception THEN caught := true;
    END;
    IF NOT caught THEN RAISE EXCEPTION 'Missing news was accepted'; END IF;
    -- Existing but incomplete archives must also fail readiness.
    UPDATE public.news_daily_features SET payload = jsonb_set(payload,'{status}','"incomplete"') WHERE date=news_day;
    caught := false;
    BEGIN
        PERFORM public.publish_forecast_run(run_doc,values_doc);
    EXCEPTION WHEN raise_exception THEN caught := true;
    END;
    IF NOT caught THEN RAISE EXCEPTION 'Incomplete stored news was accepted'; END IF;
    UPDATE public.news_daily_features SET payload = jsonb_set(payload,'{status}','"complete"') WHERE date=news_day;
    -- Seven-day freshness is an upper bound, including non-trading days.
    bad_doc := jsonb_set(values_doc,'{0,source_dates,brent}',to_jsonb(origin_day-8)); caught := false;
    BEGIN
        PERFORM public.publish_forecast_run(run_doc,bad_doc);
    EXCEPTION WHEN raise_exception THEN caught := true;
    END;
    IF NOT caught THEN RAISE EXCEPTION 'Stale market source was accepted'; END IF;
    SELECT run_id INTO pointer FROM public.forecast_active;
    IF pointer <> good_id OR EXISTS(SELECT FROM public.forecast_runs WHERE id=failed_id) THEN
        RAISE EXCEPTION 'Failed validation partially mutated publication';
    END IF;
    -- A failed daily run becomes active, suppressing old prices while preserving last-good history.
    SELECT jsonb_agg(jsonb_build_object('status','unavailable','horizon_days',h,
        'reason','news_failed','message','News collection failed.')) INTO bad_doc FROM unnest(ARRAY[7,14,30]) h;
    PERFORM public.publish_forecast_run(run_doc,bad_doc);
    SELECT run_id INTO pointer FROM public.forecast_active;
    IF pointer <> failed_id OR NOT EXISTS(SELECT FROM public.forecast_values WHERE run_id=good_id AND payload->>'status'='ready') THEN
        RAISE EXCEPTION 'Failed-run activation or last-good retention failed';
    END IF;
END;
$$;
ROLLBACK;
