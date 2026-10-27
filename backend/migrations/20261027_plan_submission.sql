-- MANUAL migration; NOT YET APPLIED to Supabase.
-- Run after 20261027_purchase_plan_organisation.sql, before deploying this code.
-- Existing plans become drafts; no plans or users are deleted or reassigned.
BEGIN;
ALTER TABLE public.purchase_plans
    ADD COLUMN status text NOT NULL DEFAULT 'draft',
    ADD COLUMN submitted_at timestamptz,
    ADD CONSTRAINT purchase_plans_status_check CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    ADD CONSTRAINT purchase_plans_submission_time_check CHECK (
        (status = 'draft' AND submitted_at IS NULL)
        OR (status IN ('submitted', 'approved', 'rejected') AND submitted_at IS NOT NULL));

-- One durable notification per submitted plan, addressed to the organisation's
-- manager role. Every current manager sees the same organisation inbox.
CREATE TABLE public.plan_approval_notifications (
    notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL UNIQUE REFERENCES public.purchase_plans(plan_id) ON DELETE CASCADE,
    clerk_org_id text NOT NULL CHECK (clerk_org_id ~ '^org_[A-Za-z0-9]+$'),
    buyer_user_id uuid NOT NULL REFERENCES public.users(user_id),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_approval_notifications_org_created_idx
    ON public.plan_approval_notifications (clerk_org_id, created_at DESC, notification_id DESC);
-- Access is through the authenticated Spring backend. No browser Supabase policy
-- is added. Keep using the backend database role already used for purchase plans.
ALTER TABLE public.plan_approval_notifications ENABLE ROW LEVEL SECURITY;
COMMIT;

-- Verification (read only):
SELECT status, count(*) FROM public.purchase_plans GROUP BY status;
SELECT count(*) AS notifications FROM public.plan_approval_notifications;
