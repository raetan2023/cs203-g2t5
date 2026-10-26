# GDELT-informed price ranges and end-to-end integration

## Goal and agreed behaviour

Keep Ridge responsible for central forecasts and use the previous completed UTC day's GDELT news to learn forecast-error q10/q90 bounds (nominal 80%, not q25/q75 quartiles). Display real forecasts on the dashboard and purchase recommendations. Normal application dates and deadlines use today's Singapore date. Daily GitHub Actions inference publishes to Supabase; Spring Boot reads it without an always-on Python service. Retrain weekly, not every day.

## Training and news

- Forecast origin is the actual decision date; targets are origin +7/+14/+30 days. Adapt feature training/inference together for days between quotes; include last available quote and quote age. Never attach current news to an earlier origin.
- Reuse relevance/event/bias classification. Archive exact previous UTC day results with deduplicated URLs, counts, unique domains, event proportions, bias proportions/disagreement, optional tone dispersion, collection completeness, classifier/model version and hashes. Missing collection differs from zero relevant articles.
- Build chronological out-of-sample Ridge central forecasts. Train regularized quantiles on log(actual/central) errors with market and prior-day news features. Never train errors from in-sample centres or apply arbitrary instability multipliers.
- Compare news-informed, market-only and persistence ranges on identical origins. Purge immature labels and the proper/calibration boundary. Require 30 proper rows after purging, 20 calibration rows and 40 chronological evaluation rows per horizon. Repair crossings, calibrate separately, report coverage/both tails/width/interval score/count/raw losses. Do not clamp the central forecast.
- Backfill genuine historical news. Historical overlap is incomplete; publish unavailable until evidence is sufficient, without synthetic or market-only fallback.

## Daily workflow and storage

Run at 08:17 Singapore (00:17 UTC), with manual dispatch. Synchronize validated market snapshots using existing ingestion code; archive/classify yesterday's news; check identity, units, completeness and freshness; retrain Monday or manual request; otherwise load last validated immutable bundle; infer 3 horizons; atomically publish a complete batch. Record status/source dates/actual completion and failure reasons. A schedule does not make manual upstream feeds fresh.

Migrate news_daily_features, immutable forecast_runs, per-horizon forecast_values and one active-run pointer. Store immutable bundles/reports/news in private Supabase Storage. Browser never receives credentials or serialized models. Only completed transactions activate a batch; rejected/failed runs cannot mix with ready rows.

Require exact previous UTC news window and <=7-day market/MGO age, preserving stricter feature rules. Reject expired targets, invalid units, nonfinite/unordered bounds. Show last successful metadata while unavailable. Missing news is unknown, not low uncertainty.

## Backend and frontend

One typed JDBC forecast reader powers authenticated GET /api/v1/forecast?horizon_days=7 and the existing analysis-provider boundary. Support 7/14/30, return status/reason, origin/target/anchor/source dates, central/bounds/USD-per-tonne basis, nominal/measured coverage/count/baseline comparison, news window/model/run/publication provenance. Accept independent central outside bounds. Cost totals use selected horizon and quantity. Buy/wait guidance remains unavailable absent an approved policy.

Use injected Singapore Clock normally, fixed clocks only explicit tests/previews. Replace dashboard's normal mock transport with Clerk-authenticated API; keep fixtures only explicit preview/tests. Both screens share horizon/run/metadata and independent unavailable/error/loading states. Explain target vs purchase deadline. Refresh date context after Singapore midnight and preserve stale-context retries.

## Verification and rollout

Verify archive -> model -> Supabase -> Java -> both screens, including future mutation invariance, immature-label purge, exact news window, missing-vs-zero, train/inference parity, paired baselines, save/load, atomic publication, authentication, stale/unsupported data, same-run display, exact cost multiplication, independent centre, midnight rollover and no normal synthetic fallback.

Roll out data/history validation, model evaluation, migrations/publication, backend, frontend. First run manually and verify a real published batch before enabling daily scheduling. Success is a traceable real news-informed range or an honest unavailable state when evidence is insufficient.

## Implementation decisions

- Daily training rows use exact observed target quotes at decision+h, one row per actual target; this avoids duplicating sparse targets and relabelling nearest outcomes later. Existing quote-origin research artifacts remain separate.
- Same-day MGO quotes are conservatively excluded from morning features because historical publication timestamps are unknown. Existing source-specific market lags remain.
- Classifier provider is the repository's existing configured implementation. No credential values are stored, generated or changed by this work.
- Infrastructure activation requires the team's existing Supabase database/storage permissions, GitHub secrets and default-branch publication; tests must not pretend these external changes happened.
