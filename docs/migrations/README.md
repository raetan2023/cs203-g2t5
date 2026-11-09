# Database migrations

New changes to the shared database go in `backend/migrations`. The September notes below are kept as history. The shared database already includes their effect, so do not run them again. Do not run a full schema file against an existing database: CREATE TABLE IF NOT EXISTS does not reconcile tables.

`20260925_required_fields.sql` adds the four required-field constraints only.
It runs atomically, rejects existing NULL values, and never backfills or deletes data.
It can be rerun after success. A lock or statement timeout aborts the transaction.
Run with a runner that stops on SQL errors (psql: `-v ON_ERROR_STOP=1`).

Before shared deployment:

1. Obtain the actual schema export and applied migration history from Wunna.
   Compare column types, nullability, constraints, triggers, policies and roles with
   the local schema; confirm these three tables and four columns exist as intended.
2. Inspect NULL counts for purchase deadline, scenario date, source name and value
   type. Have the relevant owner correct missing data using verified values before
   retrying; dates and market metadata must not be guessed.
3. Confirm a backup/recovery point and test on a disposable copy of the target.
   The migration briefly requires exclusive locks; choose a suitable deployment time.
4. Apply through the agreed migration runner, verify all four columns are NOT NULL,
   and run integration checks with Wunna and Anjali. Local administrator tests do
   not establish API behaviour or user isolation.

`20260926_clerk_user_id.sql` adds nullable `clerk_user_id text UNIQUE`, preserving
existing UUID IDs and purchase-plan foreign keys. Apply once through migration
history; it deliberately fails if the column already exists rather than silently
accepting an unknown definition. Existing rows stay NULL until verified backfill.
Test duplicate rejection, multiple unmapped users, and unchanged plan ownership
on a disposable target copy before deployment.

`20260926_remove_legacy_auth.sql` follows the Clerk ID migration. It removes the
legacy authentication FK, signup trigger/function, and eight known policies,
and gives users.user_id a generated UUID default. Old auth object names appear
only as cleanup targets. Compare all target policies/dependencies with the actual
schema first; unknown custom objects are not silently removed. No users or plans
are deleted. Run as the migration owner with permission to remove those objects.

RLS stays enabled, with no client-facing policies. Ordinary client roles have no
row access. The backend needs a server-only role with appropriate privileges and
RLS bypass, plus verified Clerk authentication and explicit ownership checks.
This migration does not implement token verification or provisioning, and does
not make the temporary X-User-Id API header safe for authenticated use.

See [database-schema.md](../database-schema.md#authentication-and-access) for how access works now.

## Daily published forecasts (26 October 2026)

`20261026_published_forecasts.sql` adds server-owned daily news features, immutable
forecast runs and per-horizon payloads, plus a singleton active-run pointer.
`publish_forecast_run(run_json, forecasts_json)` validates exactly 7/14/30-day
values and atomically publishes all three. Failed daily runs publish three
explicitly unavailable values, so an old ready run cannot masquerade as today's
forecast. Failed validation rolls back the entire publication and preserves the
previous pointer. Publication serializes with an advisory transaction lock and rejects older same-day run start timestamps.

The run JSON is `{id, origin_date, model_version, payload}`. `payload` carries
shared metadata, including `run_started_at` (UTC instant), `news_feature_version`, `forecast_origin_date`,
`as_of_date`, `news_window_start`, `news_window_end` and `source_dates`.
The forecasts argument is an array of three payload objects, each containing
`horizon_days` and `status`. Ready objects carry the forecast service contract;
unavailable objects require `reason` and `message`. Per-horizon fields override
common run fields when read. For ready values, sources must be no older than
seven days, origin must be today's Singapore date, and the news window must be
the fully completed previous UTC day with a matching stored feature version.

RLS is enabled without browser policies. Anonymous/authenticated roles receive
no table or function access. The trusted publisher uses a server-only role;
`service_role`, if present, receives needed privileges. The JDBC backend's
server-only role also requires SELECT on all four tables and RLS bypass. Do not
put either role's credentials in the frontend. Confirm grants against the actual
Supabase roles before application. This script creates new objects once and
intentionally fails on conflicts; it does not silently reconcile unknown tables.

The migration creates private Supabase Storage bucket `forecast-models` when
`storage.buckets` exists. It adds no browser policies; an existing public bucket
with that name aborts the migration. Versioned news archives, model bundles and
reports are uploaded by the trusted publisher, never by browser clients.

This migration was applied to the shared Supabase database on 26 October 2026
using the existing authorized backend connection. Four tables and the private
bucket were verified. Existing plans/market tables were not modified. One real
unavailable publication was committed atomically; no synthetic or ready price
forecast was published. Daily scheduling remains disabled pending classifier
configuration and sufficient archived news evidence.

The migration and `20261026_published_forecasts_test.sql` also passed disposable
PostgreSQL/PGlite checks for atomicity, rollback, source/news validation, run
ordering and role privileges, including a Python-generated test-only contract.
Never run fixture scripts on the shared database. See
[the operations guide](../daily-forecast-operations.md) for activation and backfill.

## PM and PO assignment (8 November 2026)

Three migrations in `backend/migrations`, applied in this order before deploying the backend: `20261108_users_clerk_id_required.sql`, `20261108_organisation_members.sql`, `20261108_pm_assignments.sql`. Tested on a local database, then applied to shared Supabase on 9 November 2026 (Asia/Singapore). Do not rerun them. See [the assignment guide](../pm-po-assignment.md#go-live-order).

### Latest available news windows — 26 October 2026

`20261026_latest_news_windows.sql` is a follow-on CREATE OR REPLACE migration,
applied after the initial forecast schema. It accepts complete 24-hour windows
ending within the last seven days, including rolling/latest archives, without
requiring the previous UTC date. Stored evidence must match the exact bounds
and feature version. Browser permissions and atomic publication are preserved.
`20261026_latest_news_windows_test.sql` validates this on disposable databases.
