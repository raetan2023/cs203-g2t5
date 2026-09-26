# Candidate database migrations

These scripts have not been applied to shared Supabase. Agree migration ownership,
runner, and history with Wunna before adopting them. Do not run the full schema
against an existing database: CREATE TABLE IF NOT EXISTS does not reconcile tables,
and fresh-schema SQL is not an upgrade script.

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

On a disposable target copy, verify UUID generation without an external auth row,
Clerk ID uniqueness, preserved users/plans, absence of legacy triggers/FKs/policies,
and denied direct client access. Neither new migration has been executed locally
in this session; no shared database has been changed.

See the MVP-only review in
[database-schema.md](../database-schema.md#clerk-mapping-and-ui-review-26-september-2026).
