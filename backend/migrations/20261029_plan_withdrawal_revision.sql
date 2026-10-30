-- MANUAL. Applied to shared Supabase on 2026-10-29; do not rerun there. Run once AFTER 20261029_buyer_decision_notifications.sql.
BEGIN;
ALTER TABLE public.purchase_plans
    DROP CONSTRAINT purchase_plans_status_check,
    ADD CONSTRAINT purchase_plans_status_check
        CHECK (status IN ('draft','submitted','approved','rejected','withdrawn','purchased')),
    DROP CONSTRAINT purchase_plans_submission_time_check,
    ADD CONSTRAINT purchase_plans_submission_time_check CHECK (
        (status = 'draft' AND submitted_at IS NULL) OR (status <> 'draft' AND submitted_at IS NOT NULL)),
    ADD COLUMN previous_plan_id uuid NULL,
    ADD CONSTRAINT purchase_plans_revision_owner_fk FOREIGN KEY (previous_plan_id, clerk_org_id, user_id)
        REFERENCES public.purchase_plans(plan_id, clerk_org_id, user_id) ON DELETE RESTRICT,
    ADD CONSTRAINT purchase_plans_no_self_revision CHECK (previous_plan_id IS NULL OR previous_plan_id <> plan_id);
CREATE INDEX purchase_plans_revision_idx ON public.purchase_plans (previous_plan_id, clerk_org_id)
    WHERE previous_plan_id IS NOT NULL;
CREATE TABLE public.plan_withdrawals (
    plan_id uuid PRIMARY KEY,
    clerk_org_id text NOT NULL CHECK (clerk_org_id ~ '^org_[A-Za-z0-9]+$'),
    buyer_user_id uuid NOT NULL,
    reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 2000),
    withdrawn_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (plan_id, clerk_org_id, buyer_user_id)
        REFERENCES public.purchase_plans(plan_id, clerk_org_id, user_id) ON DELETE RESTRICT
);
ALTER TABLE public.plan_withdrawals ENABLE ROW LEVEL SECURITY;
COMMIT;
