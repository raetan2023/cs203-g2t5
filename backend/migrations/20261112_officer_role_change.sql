-- MANUAL. Applied to shared Supabase on 2026-11-12; do not rerun there. Run once BEFORE deploying the backend that closes an officer's open plans when they stop being an officer.
-- When a procurement officer is promoted, made admin or leaves:
--   * their pending requests are withdrawn, and the withdrawal remembers the manager who was reviewing them,
--     so that manager still sees them in the Approval inbox (marked withdrawn) for 5 days;
--   * their approved plans that were not bought yet become 'closed', since only officers can record purchases.
BEGIN;
ALTER TABLE public.purchase_plans
    DROP CONSTRAINT purchase_plans_status_check,
    ADD CONSTRAINT purchase_plans_status_check
        CHECK (status IN ('draft','submitted','approved','rejected','withdrawn','purchased','closed'));
ALTER TABLE public.plan_withdrawals
    ADD COLUMN manager_user_id uuid NULL REFERENCES public.users(user_id) ON DELETE SET NULL;
COMMIT;
