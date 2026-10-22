-- Safe to apply if the equivalent change was already made in Supabase SQL Editor.
-- Preserve the primary key, foreign key, NOT NULL columns and existing rows.
BEGIN;
ALTER TABLE public.purchase_plans
    DROP CONSTRAINT IF EXISTS purchase_plans_user_id_key;
CREATE INDEX IF NOT EXISTS purchase_plans_user_id_idx
    ON public.purchase_plans (user_id);
COMMIT;
