-- MANUAL. Run once BEFORE deploying the backend that closes approved plans not bought by their deadline.
-- Additive: two optional columns saying why and when a plan was closed.
--   role_change     : the officer stopped being a procurement officer (promoted, made admin or left)
--   deadline_passed : approved but not bought by the purchase deadline
BEGIN;
ALTER TABLE public.purchase_plans
    ADD COLUMN closed_reason text NULL
        CONSTRAINT purchase_plans_closed_reason_check CHECK (closed_reason IN ('role_change', 'deadline_passed')),
    ADD COLUMN closed_at timestamptz NULL;
-- Plans closed before this change were all closed by a role change.
UPDATE public.purchase_plans SET closed_reason = 'role_change' WHERE status = 'closed' AND closed_reason IS NULL;
COMMIT;
