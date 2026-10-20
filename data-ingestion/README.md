# Brent API → Supabase importer

Python 3.10+; standard library only. Uses the actual UUID schema exported by the user (`series_id`, `observation_id`, `observation_date`), not the different Java entity schema. No database credentials are needed for preview mode.

## 1. Preview the supplied JSON

From the repository root:

```sh
python3 data-ingestion/import_brent.py --input /Users/nelsontan/Downloads/brent.json
```

## 2. Preview an API fetch

```sh
python3 data-ingestion/import_brent.py --mode live
```

The API defaults to `snapshot` if no mode is specified; this importer requests `live` by default. To deliberately import the available snapshot instead:

```sh
python3 data-ingestion/import_brent.py --mode snapshot
```

The sample contains 5,000 Brent records ending 2026-10-14, and labels its response `served_from: snapshot`. A repeating import cannot make a static snapshot current. Check the mode and last observation date, not just the time the importer ran. A public snapshot request was verified without a market-data API key; do not send your Supabase secret to the market-data provider.

Verification on 2026-10-20: the supplied snapshot preview and five tests passed. A live request with `--limit 5` timed out at the importer's 45-second timeout; live collection has not been verified. Confirm live-mode behaviour with the API owner before scheduling imports or describing the dashboard as live.

The importer validates all records before writing. It rejects missing/nonfinite prices, mixed sources/units, duplicate dates and invalid dates. It does not invent source publication times from `retrieved_at`.

## 3. Prepare Supabase once

Check that the actual database still matches the exported UUID schema. Confirm the existing Brent `market_series.series_key`; the script defaults to `BRENT_CRUDE`, matching the dashboard's series key, but pass `--series-key YOUR_EXISTING_KEY` if necessary to avoid creating a second Brent series.

In Supabase SQL Editor, inspect duplicate observations:

```sql
SELECT series_id, observation_date, count(*)
FROM public.market_observations
GROUP BY series_id, observation_date
HAVING count(*) > 1;
```

The schema export has no series/date unique key. Coordinate the candidate `brent_unique_index.sql` with the database owner before applying it. It adds the unique index required for repeatable PostgREST upserts; duplicates cause failure and are never automatically deleted. If a valid nonpartial unique key on those same columns already exists, another index is unnecessary. `IF NOT EXISTS` checks index name only, so verify that an existing index with this name has the intended columns.

## 4. Apply deliberately

Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the terminal or your server's secret manager. Keep the secret out of source files, shell history, React and GitHub. To type the key without echoing it or placing it in shell history on macOS zsh:

```sh
export SUPABASE_URL='https://YOUR_PROJECT_REF.supabase.co'
read -rs 'SUPABASE_SECRET_KEY?Paste Supabase secret key: '; echo
export SUPABASE_SECRET_KEY
python3 data-ingestion/import_brent.py --input /Users/nelsontan/Downloads/brent.json --apply
```

The secret is sent only to your Supabase HTTPS project URL. New `sb_secret_` keys use the `apikey` header; legacy service-role JWTs additionally use `Authorization`. RLS is not disabled or modified.

Series metadata is upserted by `series_key`; observations are upserted by `(series_id, observation_date)` in batches of 500. Existing dates may receive corrected provider prices; this is not a revision-history store. Batches are individually atomic, not one transaction for the full history. A failed import may leave earlier successful batches; rerun after fixing the cause. Unknown historical availability timestamps are omitted, preserving existing verified timestamps. Unrelated series, users and purchase plans are not modified.

## 5. Verify, then automate

Inspect the stored Brent count/date range and a few values in Supabase. Only then configure a server-side scheduled job to run a live import at a provider-appropriate frequency. A recent overlap window can catch source corrections:

```sh
python3 data-ingestion/import_brent.py --mode live --start YYYY-MM-DD --apply
```

Use a real start date selected for that run, such as seven days before its execution. Keep credentials in the scheduler's secret store. Do not schedule the command until a real import and failure handling have been verified.

This folder implements **only API → Supabase**. The Spring dashboard still needs to be reconciled with the UUID database schema and changed to read latest stored observations; React still needs refresh behaviour. Importing data alone does not complete or validate a live dashboard. No shared database writes or migrations have been executed by creating this folder.

Tests:

```sh
python3 -m unittest discover -s data-ingestion -p 'test_*.py'
```

## GitHub Actions

The workflow `.github/workflows/import-brent.yml` fetches Brent daily, around **07:17 Singapore time** (23:17 UTC). Scheduled workflows run from the repository's default branch, so commit the workflow and this importer folder, and merge them into that branch (normally `main`). They do not run just because files exist locally. GitHub can delay scheduled runs.

Pushes affecting this importer or workflow on `test-daily-brent-import` also run a preview and read-only database check. These branch tests never apply records and do not enable a daily schedule. They let the workflow be tested before merging into `main`. The manual Run workflow control requires the workflow to exist on the default branch.

1. Add repository Actions secrets `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
2. Confirm the series/date unique index exists in Supabase. This index is not created by the workflow.
3. After merging, open **Actions → Daily Brent data import → Run workflow**. Keep `apply` unchecked and `mode` at `snapshot`. This fetches data and checks database access/columns without writing.
4. If preview succeeds, run again with `apply` checked. This imports/upserts Brent. Verify the resulting count, dates and prices in Supabase.
5. Under **Settings → Secrets and variables → Actions → Variables**, add repository variable `BRENT_DAILY_IMPORT_ENABLED` with value `true` to enable scheduled writes. Until then, scheduled runs only preview and check connectivity.
6. If your existing Brent series key differs, set repository variable `BRENT_SERIES_KEY` to that value before applying. Otherwise, the default is `BRENT_CRUDE`.

The workflow uses the verified snapshot mode for scheduled runs; live mode is optional for manual testing. It does not refresh the provider's upstream snapshot, update React automatically, or retrain any model. A live-mode timeout should fail the run, not be described as a successful live update. Neither secrets nor full API records are printed by the workflow.
