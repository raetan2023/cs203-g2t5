# Daily GDELT-informed ranges: operations and verification

## What runs where

GitHub Actions executes `ridge-regression-model/src/daily_pipeline.py` at 00:17 UTC (08:17 Singapore), with best-effort timing. Ridge supplies the central forecast. Independent quantile models learn chronological out-of-sample log-price errors from market and historical GDELT classification features. Inference collects the latest rolling 24-hour window (through the last 15-minute indexing boundary) and falls back to the newest complete verified archive within 7 days. Actual UTC window dates are shown; yesterday's exact date is not required. Inference runs daily; model retraining runs Mondays or explicit `--retrain`.

Actions publishes all three horizons in one Supabase transaction. Spring's authenticated `GET /api/v1/forecast?horizon_days=7` reads the same active batch used by purchase-plan cost analysis. The dashboard and recommendation screens share horizon/run state. Failed, stale or insufficient inputs show unavailable, never synthetic/old ranges. There is no required Python web server.

The new batch model uses exact observed target dates at decision+h, one row per observed target; no interpolated labels or duplicate daily pseudo-outcomes. Same-day MGO quotes are excluded conservatively because publication timestamps are unknown. Existing market publication lags and <=7-day freshness are enforced in training as well as serving. A current decision-date forecast differs intentionally from the older quote-origin experiment.

## External setup

1. Apply `docs/migrations/20261026_published_forecasts.sql` once to the intended database. **Applied and verified on 26 October 2026** using the existing backend database connection: four new tables, private `forecast-models` bucket, and server-only atomic publication function. Existing plans and market history were not changed. One authentic unavailable batch was published from an offline invocation with missing prior-day news; no synthetic/ready prices were written.
2. Existing repository secrets `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are present. The encrypted GitHub secret `OPENAI_API_KEY` and model variable `NEWS_LLM_MODEL=gpt-4.1-mini` are now configured; the OpenAI adapter passed a live classification request. No credential is embedded in source or committed files. The existing OpenAI adapter reuses the same news taxonomy.
3. Make the workflow available on the default branch through normal code review. The feature branch/PR alone does not enable schedules. `DAILY_FORECASTS_ENABLED` must remain unset/false until the manual verification below.
4. Provide genuine historical complete news archives. Recent DOC API retention is insufficient to bootstrap 30 proper +20 calibration +40 chronological evaluation observations once label purges are applied, even with dense daily prices. Sparse MGO makes this worse. Do not lower the gates or pretend aggregate tone CSV rows establish complete headline coverage.
5. Run the workflow manually with `retrain=true` and `publish=false` first. With the existing Supabase settings it reads validated remote bundles/archives without publishing. Inspect `run.json`, `forecasts.json`, evaluation reports and the Actions summary. Then run with `publish=true` and verify storage/API/UI before setting `DAILY_FORECASTS_ENABLED=true`.

The existing supplied OpenAI credential was configured as an encrypted Actions secret; no new credential was created. Scheduling remains disabled until sufficient historical evidence and manual validation exist.

## Historical backfill and initial training

From `ridge-regression-model` with the locked environment:

```sh
pip install -r requirements-lock.txt
# Recent UTC windows only; paid classifier uses configured credentials.
python -m news.daily_features --archive-dir work/news --start YYYY-MM-DD --end YYYY-MM-DD
# For older history, import genuine pre-classified daily evidence with explicit coverage.
python -m news.daily_features --archive-dir work/news --import-archive /absolute/path/to/verified-day.json
# Import validated complete historical evidence without publishing any forecast.
python -m src.daily_pipeline --work-dir work --archive-only --apply
# Reproducible train/infer locally; without --apply there are no database writes.
python -m src.daily_pipeline --work-dir work --retrain
# Use private published history/model for read-only inference verification.
python -m src.daily_pipeline --work-dir work --read-published
# Publish a real complete run only after reviewing its sources/evaluation.
python -m src.daily_pipeline --work-dir work --retrain --apply
```

A daily archive retains original URL, headline, observed GDELT indexing timestamp, classifications, query, UTC window, collection status, classifier identity/prompt version and content hashes. Import validates/recomputes it. Missing coverage and invalid classifications cannot become an empty, stable day. Tone dispersion carries an explicit availability indicator. Backfilled features constitute retrospective reconstructed evidence, not proof of historical real-time availability.

Full immutable bundles and reports go under `models/<uuid>/` in the private bucket; manifests are uploaded last. Interrupted folders without a manifest are ignored. Failed retraining candidates are archived for inspection and do not replace a prior validated model. A prior model can be reused consistently across weekdays for at most 14 days; beyond that forecasts are unavailable. A horizon without the required 40 evaluation rows remains unavailable even if another horizon validates.

## Source and service failures

Market snapshot import reuses the existing importer identity/provenance checks. Unresolved `source-defined` futures units are rejected for modelling, not guessed. Synchronizing snapshots does not refresh a manually maintained source. A live snapshot verification attempted during implementation timed out at the upstream MGO endpoint; no current-price claim was made.

A run with unavailable inputs still publishes three explicit unavailable values atomically. Prior successful run metadata remains visible, but its prices are never used as current forecasts. An older/slow run cannot overwrite a newer one. Incomplete publication rolls back. SQL rejects malformed/future/stale values, missing complete news evidence and browser-role access.

The API returns 401 without Clerk authentication, 422 for unsupported horizons, 503 for database failures, and 200 with an explicit unavailable status for a completed but unusable forecast. Cost requests include the selected horizon and runID; a changed publication yields 409 and clears/reloads forecast+plan context. Buy/wait guidance remains unavailable pending an approved policy.

Normal date handling uses Singapore today via injected Clock. Explicit test/analysis-fixture profiles alone retain fixed historical clocks. Frontend config refreshes at Singapore midnight and on tab visibility changes.

## Verification performed

- Python: 65 tests passed in the full suite; 33 focused news/chronology/orchestration checks passed after final review refinements. No paid classifier requests were made.
- Backend: 65 tests, 0 failures; includes shared Python-generated synthetic contract fixtures. Fixtures are marked test-only and never inserted into shared storage.
- Frontend: 149 tests pass; full production build with a public dummy Clerk key passes (full application code included).
- Disposable PostgreSQL/PGlite: migration, private bucket branch, atomicity/rollback, duplicate horizons, stale run ordering, malformed bounds/news/source validation and role privileges passed.
- Actual Supabase: additive migration applied; private bucket verified; an authentic all-unavailable daily-run batch committed atomically. No ready/news-informed price range has been published because historical evidence/classifier configuration is incomplete.

Existing quote-origin quantile reports are separate research results and must not be relabelled as GDELT-informed evaluation.

## Local review instance

The updated feature checkout is running at http://127.0.0.1:5174 with Java on 8001.
The existing Downloads checkout on 5173/8000 was left untouched. Live smoke checks
verified frontend 200, current-date configuration 200 (`2026-10-26`), and forecast 401
without a Clerk token. Sign in to inspect the real unavailable publication and
both forecast surfaces. Existing environment settings were reused in ignored
local env files; no credentials are included in the commit. Restarting the normal
root launcher uses its standard 5173/8000 ports once those ports are free.

## Latest-news update (26 October 2026)

Follow-on migration `20261026_latest_news_windows.sql` was applied. Original
migration history is preserved. SQL/Java/frontend accept rolling and older
complete windows up to seven days old, reject future/partial/stale windows,
and retain exact source dates. Rolling archives have distinct identities and
cannot overwrite daily historical training evidence. Historical evaluation still
uses point-in-time daily windows, so older live fallback windows are experimental.

OpenAI authentication and a live test classification succeeded. GDELT returned
HTTP 429 on both bounded-window collection and a later latest-available probe;
this is an upstream collection problem rather than a credential problem. No
complete archive was invented to conceal that failure.

Validation after the latest-window/OpenAI update: 37 Python pipeline/news/model
checks, 66 backend tests and 150 frontend tests passed; the production build and
follow-on PostgreSQL/PGlite migration smoke test passed. Latest-source collection
was attempted twice and returned HTTP 429; its real unavailable status was
published without writing synthetic prices. OPENAI_API_KEY remains encrypted in
GitHub Actions, and NEWS_LLM_MODEL is set to gpt-4.1-mini. No API key appears in
source, output logs, or committed configuration.
