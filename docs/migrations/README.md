# Candidate database migrations

These scripts have not been applied to shared Supabase. Agree migration ownership,
runner, and history with Wunna before adopting them. Do not run the full schema
against an existing database: CREATE TABLE IF NOT EXISTS does not reconcile tables,
and the script still contains Supabase Auth triggers and policies pending Clerk work.

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

Clerk mapping and provisioning are deliberately pending Nelson/Wunna's decisions.
Retaining internal UUID IDs with a unique text clerk_user_id is a proposal only.
Confirm backend-only versus direct frontend database access before adapting policies.
