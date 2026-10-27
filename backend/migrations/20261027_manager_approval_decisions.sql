-- Applied to the shared Supabase project on 2026-10-27 (Asia/Singapore).
-- Verified: 13 plans unchanged (12 draft, 1 submitted), 1 notification, 0 decisions.
-- Run once after the two submission/snapshot migrations; do not rerun here.
-- Adds decision audit storage; does not change existing plan statuses or snapshots.
BEGIN;
CREATE TABLE public.plan_approval_decisions (
    decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL UNIQUE REFERENCES public.purchase_plans(plan_id) ON DELETE RESTRICT,
    clerk_org_id text NOT NULL CHECK (clerk_org_id ~ '^org_[A-Za-z0-9]+$'),
    manager_user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT,
    manager_clerk_user_id text NOT NULL CHECK (length(btrim(manager_clerk_user_id)) > 0),
    manager_label text NOT NULL,
    decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
    decision_comment text NOT NULL DEFAULT '' CHECK (length(decision_comment) <= 2000),
    decided_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT rejection_requires_reason CHECK (decision <> 'rejected' OR length(btrim(decision_comment)) > 0)
);
CREATE INDEX plan_approval_decisions_org_date_idx
    ON public.plan_approval_decisions (clerk_org_id, decided_at DESC);
ALTER TABLE public.plan_approval_decisions ENABLE ROW LEVEL SECURITY;
-- No direct-browser policies. Spring enforces verified manager membership and
-- scopes all reads/writes to the active organisation. The audit is append-only
-- through the application: no edit/delete endpoint or decision reversal exists.
COMMIT;
