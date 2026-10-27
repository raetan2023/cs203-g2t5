# Clerk organisation membership, roles and purchase-plan access

This branch includes frontend organisation selection and backend enforcement for
organisation-scoped purchase plans. Draft submission and the shared manager inbox
are documented in [plan submission](plan-submission.md). Manager decisions and audit records are included.
Dedicated analyst and admin business consoles remain later work. The frontend foundation was introduced in commit `78e6bab`; this guide also
covers the organisation-scoped backend and matching frontend permissions.

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

## Enforced plan permissions

| Membership role | Read plans and their analysis | Create/edit/delete plans |
| --- | --- | --- |
| `org:buyer` | Own plans in the active organisation | Own drafts in the active organisation |
| `org:manager` | All assigned plans in the active organisation | Denied |
| `org:analyst` | All assigned plans in the active organisation | Denied |
| `org:admin` | Denied by default; membership administration does not imply business-data access | Denied |

The admin policy deliberately grants no automatic purchase-plan privileges. Admins
can still manage organisation members through Clerk's organisation UI. Buyers can
submit drafts, and managers can read their organisation approval inbox. Managers can approve/reject a submitted saved recommendation, with a required
rejection reason and a final audit record. Roles do not inherit privileges from each other.

Spring Security checks the role on each route. Controller checks provide defense
in depth. Buyers resolve their internal user ID from the verified Clerk subject;
all plan SQL filters by `clerk_org_id`, and buyer reads/writes additionally filter
by `user_id`. A user's collection can contain multiple plans in one organisation;
no unique user/organisation constraint has been added. Request-supplied owner or
organisation fields cannot override the token scope. Cross-owner/cross-organisation
plan IDs return 404 rather than disclosing the other plan.

Clerk v2 tokens use the verified `o.id` (organisation) and `o.rol` (unprefixed role).
Explicit legacy `org_id`/`org_role` claims are also supported for v1 sessions.
Missing, malformed, unknown or conflicting membership claims are denied. A global
user-level `app_role` is not used. Missing/invalid sessions receive 401; a signed-in
session without the required membership/role receives 403.

`GET /api/v1/organisation` requires a verified session and one of the four known
roles. It returns `organisation_id`, `role`, `can_read_plans`, `can_write_plans` and
`plan_scope` (`own`, `organisation` or `none`) with `Cache-Control: no-store`.
The frontend verifies this response against Clerk's selected organisation/role
before loading private pages, then hides write actions for read-only roles and
blocks admin plan URLs. UI gating complements, not replaces, backend enforcement.
Organisation/role changes reset page state and invalidate old adapters.

## Shared forecast access

`GET /api/v1/forecast?horizon_days=7` requires a verified Clerk session with an
active organisation and one of `org:buyer`, `org:manager` or `org:analyst`. Admin
membership is denied, consistent with the plan business-data policy. Missing or
invalid sessions return 401; missing, unsupported, malformed or conflicting
organisation/role claims return 403. A shared API key alone does not grant access.

Forecast publications remain shared market information: this rule verifies active
membership and role, not ownership of a separate organisation-specific forecast.
No database migration is required. Role permissions still need team agreement if
the intended admin policy differs. Forecast data, horizon validation and response
format are unchanged.

## Database rollout and legacy plans

The nullable `clerk_org_id` column and non-unique `(clerk_org_id, user_id)` index
were added manually on 27 October 2026. After Nelson explicitly authorised the
assignment and supplied Bunker Buddy's Clerk ID, the 9 legacy NULL rows were assigned
to `org_3LGX9KPpydIuo5jlZbgae1xLdGr` in one checked transaction. Their user ownership,
quantities and dates were preserved. Post-commit verification found 10 total plans
and 0 unassigned plans; the other already-assigned row was not updated. See
[the database change record](organisation-database-migration.md).

New plans get the verified active organisation on insert. NULL rows, should any be
created by an older backend, remain excluded from all scoped reads and mutations.
Membership and role assignments stay in Clerk; a database assignment does not invite
or grant a role to an owner. Buyer ownership filtering continues within Bunker Buddy.

The NOT NULL constraint has not been applied. Keep all backend instances consistent:
an older instance can still insert NULL rows until upgraded. Shared market data
remains global reference data and is unchanged by this work.

JWT roles reflect token issuance time. Clerk role changes may take until token
refresh to reach the backend; the UI requests a fresh token for its access check.
This does not implement immediate revocation of every previously issued token.

## Verification

Run from `frontend/`:

```bash
npm test
npm run build
```

The Clerk integration tests mock the SDK and cover sign-in, selection, all four
roles, server-confirmed permissions, read-only manager/analyst views, admin URL
restrictions, unknown roles, stale responses and delayed token requests. Backend
HTTP tests exercise role denials, scoped reads/writes, tampered request fields and
multiple plans. H2 PostgreSQL-mode tests execute organisation/owner read and delete
queries with two organisations and NULL legacy rows; PostgreSQL INSERT/UPDATE
RETURNING bindings are checked at the JDBC boundary. No shared plan data is written
by the tests. They do not verify live Clerk configuration or a live plan-write journey.

Run backend checks with `cd backend && ./mvnw test`. For the manual check, sign in as Bunker Buddy's admin, select
Bunker Buddy, confirm the Admin label and switcher, then sign out. Invitations
and other-role accounts can be tested after they are created.

Clerk references:
- https://clerk.com/docs/react/reference/components/organization/organization-list
- https://clerk.com/docs/react/reference/components/organization/organization-switcher
- https://clerk.com/docs/guides/organizations/control-access/roles-and-permissions
