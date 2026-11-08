-- Apply once to the shared Supabase project before the organisation_members and
-- pm_assignments migrations. Safe to rerun: both statements are no-ops when the
-- column already has the target nullability.
-- Every user comes from Clerk, so the Clerk user ID is the required identity.
-- Email is optional: a member added from a Clerk membership event may not have
-- one yet, and the session token carries one only when configured to.
BEGIN;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.users WHERE clerk_user_id IS NULL) THEN
        RAISE EXCEPTION 'users rows without clerk_user_id exist; link or remove them before applying this migration';
    END IF;
END $$;
ALTER TABLE public.users ALTER COLUMN clerk_user_id SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;
COMMIT;
