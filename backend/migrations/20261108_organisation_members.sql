-- Apply once to the shared Supabase project, after 20261108_users_clerk_id_required.sql.
-- Do not rerun. Additive only: creates one new table, changes nothing existing.
-- A copy of each person's role in each organisation. Clerk stays the source of
-- truth and the backend still authorises requests from the verified token; this
-- table lets admins list members and lets the backend validate PM assignments.
-- Rows are written when a member loads the app and by Clerk membership events.
BEGIN;
CREATE TABLE public.organisation_members (
    user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    clerk_org_id text NOT NULL CHECK (clerk_org_id ~ '^org_[A-Za-z0-9]+$'),
    role text NOT NULL CHECK (role IN ('org:officer', 'org:manager', 'org:admin')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, clerk_org_id)
);
CREATE INDEX organisation_members_org_role_idx
    ON public.organisation_members (clerk_org_id, role);
ALTER TABLE public.organisation_members ENABLE ROW LEVEL SECURITY;
-- No direct-browser policies. Spring writes rows only from a verified token or a
-- signature-verified Clerk event, and scopes every read to one organisation.
COMMIT;
