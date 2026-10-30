-- MANUAL. Applied to shared Supabase on 2026-10-29; do not rerun there. Review/back up first; run once after the 20261027 migrations.
BEGIN;
ALTER TABLE public.purchase_plans ADD CONSTRAINT purchase_plans_owner_org_key
    UNIQUE (plan_id, clerk_org_id, user_id);
ALTER TABLE public.plan_approval_decisions ADD CONSTRAINT plan_decisions_outcome_key
    UNIQUE (plan_id, clerk_org_id, decision);

CREATE TABLE public.plan_decision_notifications (
    notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL UNIQUE,
    clerk_org_id text NOT NULL CHECK (clerk_org_id ~ '^org_[A-Za-z0-9]+$'),
    buyer_user_id uuid NOT NULL,
    decision text NOT NULL CHECK (decision IN ('approved','rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    seen_at timestamptz NULL,
    FOREIGN KEY (plan_id, clerk_org_id, buyer_user_id)
        REFERENCES public.purchase_plans(plan_id, clerk_org_id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (plan_id, clerk_org_id, decision)
        REFERENCES public.plan_approval_decisions(plan_id, clerk_org_id, decision) ON DELETE RESTRICT,
    CHECK (seen_at IS NULL OR seen_at >= created_at)
);
CREATE INDEX plan_decision_notifications_buyer_idx
    ON public.plan_decision_notifications (clerk_org_id, buyer_user_id, created_at DESC, notification_id DESC);
CREATE INDEX plan_decision_notifications_unread_idx
    ON public.plan_decision_notifications (clerk_org_id, buyer_user_id) WHERE seen_at IS NULL;
ALTER TABLE public.plan_decision_notifications ENABLE ROW LEVEL SECURITY;
-- Notify existing decided buyers too. No decisions, plans, or snapshots are rewritten.
INSERT INTO public.plan_decision_notifications (plan_id, clerk_org_id, buyer_user_id, decision, created_at)
    SELECT d.plan_id, d.clerk_org_id, p.user_id, d.decision, d.decided_at
    FROM public.plan_approval_decisions d
    JOIN public.purchase_plans p ON p.plan_id = d.plan_id AND p.clerk_org_id = d.clerk_org_id;
COMMIT;
