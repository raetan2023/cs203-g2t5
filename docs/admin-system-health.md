# Organisation administration

Bunker Buddy's Admin role belongs to a company organisation. It does not grant
platform administration permissions.

Open **Organisation administration** in navigation or visit `/admin` while signed
in with an active `org:admin` membership. The page shows the active company name
and embeds the existing Clerk organisation profile. Members contains searchable
membership and invitations tabs; General contains organisation settings. Hash
routing preserves the app's `/admin` route.
Clerk enforces membership permissions and seat limits. A full organisation may
have a disabled Invite button; no seat limits are bypassed.

The profile is keyed by organisation and mounted only after the backend verifies
admin membership for the active context. The existing Home action still opens
Clerk's modal. Preview environments without an embedded profile use that action
as a fallback.
No duplicate membership database or server-side Clerk secret is introduced.

An expandable role reference explains Admin, Procurement Officer and Procurement Manager.
Other roles cannot access the admin page or navigation. Signed-out visitors go
to sign-in. Switching organisations uses the new active organisation context.
Admins have read-only organisation-wide plan access, including saved recommendations,
manager comments and purchase history. The purchase-plan page offers All, Pending
approval (submitted), Approved and Rejected filters. All also includes other lifecycle
states. A View purchase plans link connects the admin page to this view. Admins cannot
create, edit, delete, submit, approve, reject, withdraw, revise or record purchases.
Backend route permissions enforce this policy; cross-organisation plan IDs return 404.

Shared database health, freshness diagnostics, model registry and retraining are
not organisation controls. The custom admin status and retraining endpoints are
removed. No platform-admin role is introduced. Existing forecast workflows remain
unchanged. The earlier sprint story requiring system/model checks and retraining
must be revised or assigned separately to platform operations.

Run frontend tests and build from `frontend`; use
`node scripts/test-admin-layout.mjs` for responsive checks. Backend
`AdminAccessHttpTests` checks the removed platform endpoints cannot be used.
No migration is required. Automated tests do not modify Clerk memberships.
