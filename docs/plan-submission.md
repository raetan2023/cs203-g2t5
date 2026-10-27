# Purchase-plan submission and manager notification

Implemented on `fix-forecast-role-access`. The Supabase migration was **applied
on 2026-10-27 (Asia/Singapore)** to the shared project with Nelson’s authorisation. No email, Clerk admin API key or external notification provider
is required. This feature uses a durable, shared **in-app** manager inbox.

## Agreed behaviour

Nelson chose **notify every manager in the buyer's organisation**. A notification
is addressed to the organisation's manager role, rather than a chosen person.
Every signed-in user whose verified active Clerk organisation matches and whose
role is `org:manager` can read the inbox. Newly assigned managers can see its
history; former managers lose access when their updated token no longer admits
them. This follows the same token expiry/refresh model as existing role checks.
No notification is visible to managers in another organisation.

A buyer opens a saved draft's recommendation page, reviews the single deadline-weighted plan recommendation, chooses a 7/14/30-day
forecast cost detail for comparison, then selects **Request approval for this recommendation**.
There is no direct plan-only submission button on plan cards.
The confirmation distinguishes the plan recommendation from the selected forecast cost detail. Selecting another cost horizon does not change the final recommendation.
A buyer confirms submission of their own valid draft and selected recommendation. The backend checks the
owner and organisation from trusted identity, positive quantity, and a deadline
on or after the Singapore operational date. It locks the row and changes status
from `draft` to `submitted`, preserving the submitted quantity and deadline.
The backend recomputes the plan recommendation across all available 7/14/30-day
forecasts from a consistent publication. The selected horizon chooses the saved
forecast/cost detail, not a different policy recommendation. Urgency is retained
in the transport for compatibility, but the UI no longer exposes it and the new
policy does not use it to override the recommendation. It validates the recommendation ID and a SHA-256
fingerprint of the displayed context, forecast, reference, costs and guidance.
Stale choices require a refresh; client-provided prices/actions are never trusted.
The same transaction inserts one approval notification with its timestamp and an
immutable server-generated recommendation snapshot.
Concurrent/repeated submissions cannot produce multiple notifications; if the
notification insert fails, the status change rolls back.

Only drafts can be edited or deleted. Submitted, approved and rejected plans are
locked. `approved` and `rejected` are reserved schema states: **manager approval/rejection, comments and decision audit are now implemented**.
Only a current manager in the same active organisation can decide a submitted
request. The first decision is final; concurrent/later attempts return 409.
Rejected requests stay locked; revising a proposal requires a new draft plan.

## API and role matrix

| Route | Buyer | Manager | Analyst | Admin |
| --- | --- | --- | --- | --- |
| `POST /api/v1/purchase-plans/{planId}/submit` | Own draft in active organisation | Denied | Denied | Denied |
| `GET /api/v1/purchase-plans/approval-notifications` | Denied | Active organisation inbox | Denied | Denied |

Missing/invalid authentication is 401; missing/invalid organisation or role is
403. Another owner's plan, another organisation's plan or a missing plan is 404.
A non-draft submission or attempted edit/delete of a locked owned plan is 409.
An expired draft or invalid stored quantity is 422. The submission endpoint requires a JSON selection body: `horizon_days`, `run_id`,
`recommendation_id`, `approval_fingerprint`, `urgency`, `quantity_mt`,
`purchase_deadline` and `scenario_as_of_date`. The backend binds the plan and scope
from trusted identity, then compares the body with saved plan inputs and current
analysis. Client-supplied owner, organisation or role never determines scope.
Responses use `Cache-Control: no-store`.

Plan responses now include `status` and `submitted_at` (null while draft).
Submission returns the updated `{ "plan": ... }`.
`GET /api/v1/purchase-plans/{planId}/submission` returns
`{ "submission": { "horizon_days": 14, "analysis": ... } }` for a saved choice,
or `{ "submission": null }` for an earlier plan-only request with no snapshot.
The same buyer ownership and manager/analyst organisation read checks apply;
admin remains denied. A locked plan's recommendation page reads this snapshot
instead of fetching a fresh recommendation. The saved urgency, model version,
run, target, costs, reasons and limitations remain visible to reviewers. Manager inbox responses are
`{ "notifications": [...] }`; each item contains `notification_id`, `plan_id`,
`created_at`, `quantity_mt`, `purchase_deadline`, and `status`. The inbox lists the
latest 100 submissions, newest first; it is history, not an unread count.
The UI refreshes it every 30 seconds while the purchase-plans page is open,
and managers can refresh manually. Managers follow the link to the plan's
existing recommendation page to inspect the saved inputs and analysis.
The submission timestamp is shown using the viewer's local browser timezone.

## Applied migration record

- Before: 10 plans, 7 owners, no unassigned organisation IDs; workflow columns/table absent.
- After: 10 drafts, 0 approval notifications; notification RLS enabled with no browser policies.
- Compared all original plan columns before and after under a database lock: identical.
- A CSV backup was written before migration to
  `/private/tmp/bunkerbuddy-migration-backups/purchase-plans-before-submission-20261027.csv`
  (owner-only file permissions). This temporary local backup should be copied to a
  durable private location if it needs to be retained.
- Backup SHA-256: `7c7795628fea33022edf0999a600e75d411196d7a407908304a716f9ec2aafa8`.
- Migration committed as one transaction. Real Clerk buyer/manager journey remains to be checked.
- Do not rerun the SQL on the shared project.

## Supabase rollout — reference for other environments

1. Review `backend/migrations/20261027_plan_submission.sql`. It depends on the
   earlier organisation migration. All existing plans become `draft`; no owners,
   organisations, quantities or deadlines are changed. Existing plans with null
   organisation remain excluded from organisation routes.
2. Back up/export the existing `purchase_plans` records before applying a schema
   change to the shared project. Coordinate this deployment with the team: the
   old backend has no status guards and must not continue accepting writes after
   plans begin to be submitted.
3. In Supabase **SQL Editor**, create a query, paste the migration, and run it
   **once**. The DDL is in a transaction. It intentionally fails if already applied
   rather than silently accepting a different existing schema. The verification
   queries after COMMIT should show existing plans as drafts and zero notifications
   on the initial installation. Record actual results here after execution.
4. Restart the backend and frontend from this branch after the migration succeeds.
   This code requires the new columns/table. Existing releases must not run against
   submitted plans because they lack the draft-only mutation checks.
5. No new environment variables. Notifications use the existing backend Postgres
   connection. RLS is enabled on the new table with no browser policies, matching
   the existing server-mediated purchase-plan design. The trusted backend database
   role must be able to access the new table; do not grant browser clients writes.

The application does not automatically migrate Supabase or backfill data.
The shared project migration above was explicitly executed during this session.
Do not roll the backend back to an older release after submissions exist without
first coordinating write restrictions; older code can edit/delete those plans.

## Verify with real accounts after migration

1. Buyer in organisation A: create a draft with a future deadline, open its
   recommendation, select a fitting horizon for cost details, choose **Request approval
   for this recommendation**, cancel once, then confirm. Check the submitted label
   and that Edit/Delete/Submit disappear.
2. Two managers in organisation A: open Purchase plans and check that both see
   the same submission in Approval inbox. Refresh or wait up to 30 seconds.
3. Manager in organisation B: verify that A's notification is absent. Buyer,
   analyst and admin must receive 403 if requesting the inbox directly.
4. Repeat submission directly: expect 409 and one stored notification. Another
   buyer's submission attempt must be 404. An expired draft must be 422.
5. Confirm submitted plan inputs cannot be changed through direct PUT/DELETE.

Automated checks use an isolated H2 database in PostgreSQL mode for ownership,
row-lock concurrency and rollback; HTTP tests exercise real Spring security with
mocked identity/approval dependencies. They do not replace a real Supabase rollout
or the real Clerk account checks above. Frontend tests cover confirmation/cancel,
locked actions, errors, duplicate clicks, inbox refresh and stale organisation
responses. The optional live Ridge integration test remains opt-in.


## Selected-recommendation follow-up — applied 2026-10-27

Added nullable JSONB `recommendation_snapshot` to `plan_approval_notifications`
with an object/analysis/supported-horizon shape check. The migration is
`backend/migrations/20261027_recommendation_approval_snapshot.sql`.
At execution there were 11 plans (the buyer created another draft during testing);
all 11 remained drafts, the original columns compared identical before/after,
and there were zero notifications. Existing plan-only records, if present in
another environment, remain intact and are labelled as having no saved choice.
The backup is `/private/tmp/bunkerbuddy-migration-backups/purchase-plans-before-recommendation-snapshot-20261027.csv`;
SHA-256 `c391b09a65eb5522641b297cfe58d4bf873bda1d875dd41c48ef09bcc37a74b6`.
Do not rerun either migration on the shared project. Other environments must apply
both migrations in order before running this version.


## Verification of selected recommendation flow

The read-only live test `realRecommendationCarriesTheSelectedRunAndApprovalFingerprint`
passed against the shared database and actual Ridge artifacts on 2026-10-27. It
verified model provenance, matching selected run, ready recommendation/costs and a
valid approval fingerprint. No plan was submitted and no notification was created.
The signed-in Safari buyer page was reloaded after development hot updates; the
selected recommendation's request button was visibly enabled. In development,
reload after adapter changes so preserved React service instances use the latest
response parser. Manager decisions are implemented as described below.


## Manager decisions — implemented and migrated 2026-10-27

A manager opens the saved submitted recommendation and chooses **Approve
recommendation** or **Reject recommendation**, then confirms. Rejection requires
a nonblank reason; approval comments are optional. Comments are trimmed and
limited to 2000 characters. This records workflow approval only: no actual
purchase is executed.

`POST /api/v1/purchase-plans/{planId}/decision` accepts JSON:

```json
{"decision":"approved","comment":"Within budget","approval_fingerprint":"<64-character saved fingerprint>"}
```

The `decision` is `approved` or `rejected`. Only `org:manager` is admitted at the
Spring route and controller; Buyer/Analyst/Admin are denied. The verified active
organisation scopes the row lock and update. Manager identity comes from the
verified Clerk subject and application user mapping, never request-supplied IDs.
A name/email claim is used as a display label if supplied by the verified token;
otherwise the Clerk account ID is shown. Current manager membership is the role
requirement; there is no separate maker/checker rule for users who previously
held a buyer role.

The request must still be submitted and have a saved recommendation; the supplied
fingerprint must match that immutable snapshot. A changed live forecast does not
change the reviewed snapshot or invalidate its saved identity. Different/missing
plans or another organisation receive 404; already-final/non-submitted requests
receive 409. Invalid choices, missing rejection reasons and oversized comments
receive 422. Missing authentication is 401; unauthorised roles are 403.

The final status and an audit record commit in one transaction. A unique plan ID
and row lock prevent conflicting decisions. If audit persistence fails, status
rolls back to submitted. There are no edit, delete, undo or reversal routes for
decisions. The audit contains decision ID, plan ID, organisation, manager user ID,
Clerk account ID, display label, decision, comment and time.

The existing submission GET now returns `{ "submission": ..., "decision": ... }`.
The decision is null until a decision exists. Its fields are `decision_id`,
`decision`, `comment`, `manager_clerk_user_id`, `manager_label`, and `decided_at`.
Buyers can read the record only for their own plan in the active organisation;
managers and analysts can read it within their organisation. Admin remains denied.
The saved recommendation page shows the decision, actor, timestamp and reason to
all permitted readers and removes manager actions after a final decision.
The buyer's plan card shows Approved/Rejected after reloading or returning to plans.

Migration: `backend/migrations/20261027_manager_approval_decisions.sql` added
`public.plan_approval_decisions` with primary/foreign keys, a unique plan ID,
choice/comment checks and an organisation/date index. RLS is enabled without
browser policies. The trusted backend database connection owns database access.
At rollout: 13 plans (12 draft, 1 submitted), 1 notification and 0 decisions.
All existing plan fields including status and submitted_at compared identical
before/after. No existing request was decided as part of deployment.
Backup: `/private/tmp/bunkerbuddy-migration-backups/purchase-plans-before-manager-decisions-20261027.csv`.
SHA-256: `ca3e41ffab3ba15edb65533a9519b9f8aae1059f08bf64f4457e71f073db4374`.
Do not rerun this migration on the shared project.

Verification covers all route roles, actor/organisation spoofing, required reasons,
invalid transitions, frozen-choice integrity, competing managers and audit failure
rollback. UI tests cover confirmation/cancel, reason validation, duplicates, stale
responses, conflict refresh and the buyer's final decision display.
Real account test: a manager decides a submitted test request, then the buyer
reloads the plan and checks its final status and comment. Use separate requests
for testing approval and rejection, since each decision is final.


## Integration with main PR #33 (deadline-weighted policy)

Pending merge includes `origin/main` commit `161f9e8`. The deadline-weighted policy
owns the one plan recommendation. Horizon selection controls forecast/cost detail
only. Approval preserves that recommendation, its ID/policy/evidence, the selected
cost detail and all three validated provider inputs (`recommendation_inputs`,
including run/model metadata) in the existing JSONB snapshot. The approval
fingerprint covers all those inputs. The saved view labels the plan recommendation
and cost detail separately. No SQL migration or reinterpretation of older saved
requests is needed; existing approvals/decisions continue to use their original
saved fingerprint and evidence.

For short deadlines, the new policy may validly recommend BUY_NOW using the
observed reference when no forecast fits. Such a request is accepted only with a
verified BUY_NOW recommendation, ready reference and run-bound forecast metadata,
and forecast costs explicitly unavailable for `unsupported_horizon`. No forecast
cost is manufactured. Other missing/invalid data remains ineligible. The request
and saved view clearly identify a reference-price-only request.

Integration regressions verify horizon-independent recommendation IDs with
different selected cost fingerprints, archival of all provider inputs, existing
manager decisions and request ownership, and reference-only short-deadline cases.
