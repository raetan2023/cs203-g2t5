-- Supabase SQL Editor: candidate upgrade of the repository's original MVP schema.
-- Take a backup/export first. Actual deployed schema has not been inspected.
-- Use INSTEAD OF the three individual migration scripts, not as a fourth step.
-- Preserves rows, UUIDs, plan ownership and market data. Does not populate Clerk IDs.
-- RLS stays enabled; removing policies denies ordinary client access.
-- Backend Clerk verification/provisioning is still separate work.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.users, public.purchase_plans, public.market_series,
  public.market_observations IN ACCESS EXCLUSIVE MODE;

-- Lock before inspecting rows so concurrent writes cannot invalidate the check.
LOCK TABLE public.purchase_plans, public.market_series,
  public.market_observations IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.purchase_plans
             WHERE purchase_deadline IS NULL OR scenario_as_of_date IS NULL)
     OR EXISTS (SELECT 1 FROM public.market_series WHERE source_name IS NULL)
     OR EXISTS (SELECT 1 FROM public.market_observations WHERE value_type IS NULL)
  THEN
    RAISE EXCEPTION 'Required-field migration blocked: existing NULL values need reviewed corrections; no values have been invented or deleted.';
  END IF;
END $$;

ALTER TABLE public.purchase_plans
  ALTER COLUMN purchase_deadline SET NOT NULL,
  ALTER COLUMN scenario_as_of_date SET NOT NULL;
ALTER TABLE public.market_series ALTER COLUMN source_name SET NOT NULL;
ALTER TABLE public.market_observations ALTER COLUMN value_type SET NOT NULL;

-- Allow the additive Clerk migration to have been applied already.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS clerk_user_id text;
DO $$
DECLARE clerk_att smallint;
BEGIN
  SELECT attnum INTO clerk_att FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass AND attname = 'clerk_user_id'
    AND atttypid = 'text'::regtype AND NOT attisdropped;
  IF clerk_att IS NULL THEN
    RAISE EXCEPTION 'Expected users.clerk_user_id to have type text; inspect existing schema.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.users'::regclass
      AND contype = 'u' AND conkey = ARRAY[clerk_att]
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_clerk_user_id_key UNIQUE (clerk_user_id);
  END IF;
END $$;

-- The legacy trigger may exist only on installations of the old schema.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();

-- Match by referenced table, not by an assumed generated constraint name.
DO $$
DECLARE legacy_fk record;
BEGIN
  FOR legacy_fk IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND contype = 'f'
      AND confrelid = to_regclass('auth.users')
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', legacy_fk.conname);
  END LOOP;
END $$;
ALTER TABLE public.users ALTER COLUMN user_id SET DEFAULT gen_random_uuid();

DROP POLICY IF EXISTS users_select_own ON public.users;
DROP POLICY IF EXISTS users_update_own ON public.users;
DROP POLICY IF EXISTS purchase_plans_select_own ON public.purchase_plans;
DROP POLICY IF EXISTS purchase_plans_insert_own ON public.purchase_plans;
DROP POLICY IF EXISTS purchase_plans_update_own ON public.purchase_plans;
DROP POLICY IF EXISTS purchase_plans_delete_own ON public.purchase_plans;
DROP POLICY IF EXISTS market_series_select_authenticated ON public.market_series;
DROP POLICY IF EXISTS market_observations_select_authenticated ON public.market_observations;

-- Preserve deny-by-default access for ordinary client roles.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_observations ENABLE ROW LEVEL SECURITY;

-- Unknown/custom policies need review rather than silently leaving access open.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('users','purchase_plans','market_series','market_observations')) THEN
    RAISE EXCEPTION 'Unexpected policies remain on MVP tables. Review them before migration; transaction rolled back.';
  END IF;
END $$;
COMMIT;

-- Inspect the resulting columns, constraints and RLS flags.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('users','purchase_plans','market_series','market_observations')
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('public.users'::regclass,'public.purchase_plans'::regclass,
  'public.market_series'::regclass,'public.market_observations'::regclass)
ORDER BY table_name, conname;

SELECT relname, relrowsecurity FROM pg_class
WHERE oid IN ('public.users'::regclass,'public.purchase_plans'::regclass,
  'public.market_series'::regclass,'public.market_observations'::regclass);
