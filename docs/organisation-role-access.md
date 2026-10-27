# Clerk organisation selection and role recognition

This branch adds the frontend organisation flow. It does **not** implement backend
role authorization, organisation-scoped purchase plans, approval workflows or
new manager/analyst/admin consoles yet.

## Clerk development setup

1. Enable Organizations with membership optional while the integration is developed.
2. In the default role set, keep Admin (`org:admin`) as creator role. Create Buyer,
   Procurement Manager and Finance/Risk Analyst with dashboard keys `buyer`,
   `manager` and `analyst`; Clerk exposes them to the React SDK as `org:buyer`,
   `org:manager` and `org:analyst`.
3. Set Buyer as the default member role.
4. Create Bunker Buddy and assign your signed-in test account as creator/admin.
5. Use the same development application's publishable key in `frontend/.env.local`.

Invitations can be configured and tested later. This stage does not need a Clerk
secret key, a signup webhook, or user-level `app_role` metadata. It uses the active
organisation and membership role exposed by Clerk's `useAuth` and `useOrganization`.

## What users see

- Signed-out users can still reach sign-in and sign-up.
- Signed-in users without an active organisation see Clerk's organisation list.
  They can select an existing membership or create an organisation. Personal
  accounts are hidden, and organisation creation skips the invitation screen.
- Once selected, the header shows the organisation name, role label and Clerk's
  organisation switcher. Clerk provides the membership-management interface
  according to its own organisation permissions.
- Unknown, missing or built-in `org:member` roles show a setup message instead of
  silently assuming buyer/admin privileges. Assign one of the four configured roles.
- Account, organisation and role changes reset application state. Old adapters do
  not send requests if the context changes while a token request is pending.

## Current data boundary

Purchase-plan APIs still enforce **individual user ownership only**. The frontend
explicitly says that purchase plans are personal and not yet shared with the
organisation. Selecting another organisation does not move or duplicate those
plans. Shared market data remains global reference data.

The organisation selector and role labels are UI integration, **not proof of backend
role enforcement or tenant isolation**. Do not deploy this as a completed RBAC system.
Next work must add verified organisation/role checks in Spring Security and scope
plan reads/writes to the active organisation. Prepare a migration and review an
explicit backfill for existing plans before applying it; never infer the organisation
for an existing plan from whichever organisation its owner selects first.

## Verification

Run from `frontend/`:

```bash
npm test
npm run build
```

The Clerk integration tests mock the SDK and cover sign-in, selection, all four
role labels, unknown roles, loading transitions, sign-out, stale page responses and
delayed token requests during organisation switching. They do not verify live
Clerk configuration. For the manual check, sign in as Bunker Buddy's admin, select
Bunker Buddy, confirm the Admin label and switcher, then sign out. Invitations
and other-role accounts can be tested after they are created.

Clerk references:
- https://clerk.com/docs/react/reference/components/organization/organization-list
- https://clerk.com/docs/react/reference/components/organization/organization-switcher
- https://clerk.com/docs/guides/organizations/control-access/roles-and-permissions
