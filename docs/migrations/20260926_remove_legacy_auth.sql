-- Candidate upgrade for the original four-table MVP schema, after Clerk ID migration.
-- References to old auth objects below only remove them; no auth dependency remains.
-- Does not delete users, rewrite UUIDs, or change purchase-plan ownership.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

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
COMMIT;
