-- Stage 1: add organisation ownership fields without assigning existing plans.
-- Applied manually in Supabase SQL Editor by Nelson on 2026-10-27 (Asia/Singapore).
-- Nelson reported: Success. No rows returned. See docs/organisation-database-migration.md.
-- Review the live columns, constraints, indexes and RLS policies before execution.
-- This script is not run automatically by Spring Boot.
-- Existing NULL organisation IDs must not be treated as belonging to the active
-- organisation. The backend must exclude them until an explicit backfill is reviewed.
BEGIN;

ALTER TABLE public.purchase_plans
    ADD COLUMN IF NOT EXISTS clerk_org_id text;

-- Supports both organisation-wide reads and owner-within-organisation lookups.
CREATE INDEX IF NOT EXISTS purchase_plans_org_user_idx
    ON public.purchase_plans (clerk_org_id, user_id);

COMMIT;

-- Intentionally no UPDATE, DELETE, default organisation or NOT NULL constraint.
-- Backfill selected legacy plans only after confirming their organisation.
-- Set NOT NULL in a later reviewed step after migration and application rollout.
