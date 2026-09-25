-- Candidate migration: reconcile with the target schema/history before deployment.
-- Does not change identity mapping, provisioning, or ownership policies.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

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
COMMIT;
