-- Apply once to the shared Supabase project, after 20261108_organisation_members.sql.
-- Do not rerun. Additive only: creates one new table, changes nothing existing.
-- Which procurement manager (PM) oversees each procurement officer (PO). An
-- organisation admin sets this. One PO has exactly one PM in an organisation;
-- one PM can oversee many POs. Pending plans follow the PO's current PM, so plans
-- store no reviewer of their own.
BEGIN;
CREATE TABLE public.pm_assignments (
    po_user_id uuid NOT NULL,
    clerk_org_id text NOT NULL,
    pm_user_id uuid NOT NULL,
    assigned_by_user_id uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (po_user_id, clerk_org_id),
    CONSTRAINT pm_assignments_not_self CHECK (po_user_id <> pm_user_id),
    -- Both people must be members of the same organisation. Leaving it removes
    -- the assignment.
    CONSTRAINT pm_assignments_po_member FOREIGN KEY (po_user_id, clerk_org_id)
        REFERENCES public.organisation_members(user_id, clerk_org_id) ON DELETE CASCADE,
    CONSTRAINT pm_assignments_pm_member FOREIGN KEY (pm_user_id, clerk_org_id)
        REFERENCES public.organisation_members(user_id, clerk_org_id) ON DELETE CASCADE
);
CREATE INDEX pm_assignments_pm_idx ON public.pm_assignments (clerk_org_id, pm_user_id);
ALTER TABLE public.pm_assignments ENABLE ROW LEVEL SECURITY;
-- No direct-browser policies. Only an organisation admin changes assignments,
-- through Spring, which also checks the PO is an officer and the PM a manager.
COMMIT;
