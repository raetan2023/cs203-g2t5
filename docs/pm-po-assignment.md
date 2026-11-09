# PM and PO assignment

An organisation admin chooses which Procurement Manager (PM) oversees each Procurement Officer (PO). One PM can oversee many POs; a PO has one PM in an organisation. Admins cannot be PMs.

## What assignments control

| Role | Sees | Can act on |
| --- | --- | --- |
| PM | Plans of their current POs, plus plans they personally approved or rejected | Approves or rejects submitted plans of their current POs only |
| PO | Their own plans | Cannot submit a plan until they have a PM |
| Admin | Every plan in the organisation | Read-only |

The manager overview counts only a PM's current POs. A PM asking for someone else's plan gets "not found".

Deploy these rules only after every PO has a PM. Pending plans whose owner has no PM cannot be decided until an admin assigns one.

## How roles are kept up to date

Clerk remains the source of truth, and requests are still authorised from the verified Clerk token. `organisation_members` is a copy that lets admins list people and lets the backend validate assignments. It is updated in three ways:

- When a member loads the app (`GET /api/v1/organisation`).
- When Clerk sends a membership or user event to `POST /api/v1/webhooks/clerk`.
- When an admin clicks the refresh icon in Team reporting (`POST /api/v1/admin/members/sync`), which copies the full member list from Clerk. Use it once after go-live, and to see a role change straight away.

## Assignment rules

- `GET /api/v1/admin/pm-assignments` lists the organisation's POs and PMs.
- `PUT /api/v1/admin/pm-assignments/{poUserId}` with `{"pm_user_id": "..."}` sets or changes a PO's PM. There is no remove action; an admin can only switch to another PM.
- Both endpoints are admin-only and use the organisation from the admin's token.
- If a PM is demoted or leaves, their assignments are removed and their POs show "No PM assigned" until an admin picks someone else. The same happens to a PO who stops being an officer.
- Pending plans have no reviewer column. They follow the PO's current PM, so changing the PM moves them.

## Clerk webhook setup

1. In the Clerk dashboard, open **Webhooks** and add the endpoint `https://bunker-buddy-api.azurewebsites.net/api/v1/webhooks/clerk`.
2. Subscribe to `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`, `user.created`, `user.updated` and `user.deleted`.
3. Copy the endpoint's signing secret (`whsec_...`) into the Azure app setting `CLERK_WEBHOOK_SECRET`.
4. Create a Clerk secret key and set it as the Azure app setting `CLERK_SECRET_KEY`. It is needed only by the sync button.

Requests without a valid Svix signature are rejected. Neither value belongs in git or in a `VITE_` variable.

## Go-live order

1. Back up the shared database.
2. Apply the migrations in `backend/migrations`, in this order, **before** deploying the backend:
   1. `20261108_users_clerk_id_required.sql`
   2. `20261108_organisation_members.sql`
   3. `20261108_pm_assignments.sql`
3. Merge and deploy the assignments change.
4. Set up the Clerk webhook and the two Azure app settings above.
5. As an admin, open `/admin`, click the refresh icon in Team reporting, and assign a PM to every PO.
6. Merge and deploy the enforcement change, then check it with a real PM and PO.

`20261108_users_clerk_id_required.sql` stops without changing anything if any user has no Clerk ID.

## Trying it locally

Point `backend/.env.local` at a local test database with the three migrations applied, and add `CLERK_SECRET_KEY` there if you want to use the sync button. The whole secret key is needed. The backend reads these values only at startup:

```bash
cd backend && (set -a; source .env; source .env.local; ./mvnw spring-boot:run)
```
