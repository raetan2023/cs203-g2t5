-- MANUAL. Applied to shared Supabase on 2026-10-29; do not rerun there. Run once AFTER 20261029_plan_withdrawal_revision.sql.
-- Purchases are immutable through the API; one delivery per approved plan.
BEGIN;
CREATE TABLE public.purchase_records (
    purchase_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL UNIQUE,
    clerk_org_id text NOT NULL CHECK (clerk_org_id ~ '^org_[A-Za-z0-9]+$'),
    buyer_user_id uuid NOT NULL,
    purchased_on date NOT NULL,
    supplier text NOT NULL CHECK (length(btrim(supplier)) BETWEEN 1 AND 200),
    quantity_mt numeric NOT NULL CHECK (quantity_mt > 0 AND quantity_mt < 1000000000000 AND scale(quantity_mt) <= 6),
    price_usd_per_mt numeric NOT NULL CHECK (price_usd_per_mt > 0 AND price_usd_per_mt < 1000000000000 AND scale(price_usd_per_mt) <= 6),
    note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (plan_id, clerk_org_id, buyer_user_id)
        REFERENCES public.purchase_plans(plan_id, clerk_org_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX purchase_records_org_date_idx ON public.purchase_records (clerk_org_id, purchased_on DESC);
ALTER TABLE public.purchase_records ENABLE ROW LEVEL SECURITY;
-- No direct browser policies or grants; use the trusted backend role, as for plans.
COMMIT;
