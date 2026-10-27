-- READ ONLY: inspect the live schema before reviewing/applying stage 1.
-- These queries do not return personal user records or change the database.

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'purchase_plans'
ORDER BY ordinal_position;

SELECT c.conname AS constraint_name, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid = 'public.purchase_plans'::regclass
ORDER BY c.conname;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('users', 'purchase_plans')
ORDER BY tablename, indexname;

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('users', 'purchase_plans')
  AND c.relkind = 'r';

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('users', 'purchase_plans')
ORDER BY tablename, policyname;

SELECT COUNT(*) AS existing_plans, COUNT(DISTINCT user_id) AS plan_owners
FROM public.purchase_plans;
