-- Applied to shared Supabase on 2026-11-12; do not rerun there. Apply once, before deploying the backend that reads it.
-- Additive only: adds one optional column, changes nothing existing.
-- The person's name from Clerk, so the app can show "Rae Tan" instead of an email.
-- Filled by Clerk user and membership events and by the admin member refresh; when
-- it is empty the app falls back to the email.
BEGIN;
ALTER TABLE public.users ADD COLUMN display_name text
    CONSTRAINT users_display_name_length CHECK (display_name IS NULL OR length(display_name) <= 200);
COMMIT;
