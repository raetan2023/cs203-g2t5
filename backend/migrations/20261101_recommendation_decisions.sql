-- Apply once to the shared Supabase project (Asia/Singapore), after the
-- submission/snapshot and manager-decision migrations. Update the verification
-- line with real counts after running. Do not rerun.
-- Additive only: creates one new table, changes nothing existing.
-- Stores the buyer's own answer to a recommendation (accept / reject / ignore)
-- as an append-only log tied to the recommendation version they saw.
BEGIN;
CREATE TABLE public.plan_recommendation_decisions (
    decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL REFERENCES public.purchase_plans(plan_id) ON DELETE RESTRICT,
    clerk_org_id text NOT NULL CHECK (clerk_org_id ~ '^org_[A-Za-z0-9]+$'),
    buyer_user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    buyer_clerk_user_id text NOT NULL CHECK (length(btrim(buyer_clerk_user_id)) > 0),
    recommendation_id text NOT NULL CHECK (length(btrim(recommendation_id)) > 0),
    run_id uuid,
    action text,
    decision text NOT NULL CHECK (decision IN ('accept', 'reject', 'ignore')),
    reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 2000),
    decided_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reject_requires_reason CHECK (decision <> 'reject' OR length(btrim(reason)) > 0)
);
CREATE INDEX plan_recommendation_decisions_buyer_date_idx
    ON public.plan_recommendation_decisions (clerk_org_id, buyer_user_id, decided_at DESC);
CREATE INDEX plan_recommendation_decisions_plan_date_idx
    ON public.plan_recommendation_decisions (plan_id, decided_at DESC);
ALTER TABLE public.plan_recommendation_decisions ENABLE ROW LEVEL SECURITY;
-- No direct-browser policies. Spring enforces verified buyer ownership of the
-- plan and scopes all reads/writes to the active organisation. The log is
-- append-only through the application: no edit or delete endpoint exists.
COMMIT;
