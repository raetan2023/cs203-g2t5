-- Candidate additive migration; compare with shared schema/history before applying.
-- Existing user UUIDs and purchase-plan ownership remain unchanged.
-- NULL means not yet mapped. Backfill only from verified Clerk account mappings.
-- This does not complete Clerk provisioning or replace legacy auth/RLS.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.users ADD COLUMN clerk_user_id text UNIQUE;

COMMIT;
