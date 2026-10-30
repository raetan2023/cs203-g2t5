# Post-decision backend handoff (29 October 2026)

Implemented locally on `backend-plan-lifecycle`, based on `main` at `2a2ead4`
(which already includes the wireframe UI). **All three migrations were applied to shared Supabase on 2026-10-29. The UI
adapters, actions, notifications and previews are connected; services run locally.**

## Lifecycle and initial scope

`draft → submitted → approved → purchased`, or `submitted → rejected/withdrawn`.
Only drafts can be edited/deleted. A buyer can copy a rejected or withdrawn plan
to a new draft with a new ID; the original submission and decision remain frozen.
Purchased plans cannot be revised in this initial scope.

- Withdrawal reasons are optional, trimmed, and limited to 2,000 characters.
- One immutable purchase per approved plan; no correction endpoint or split deliveries.
- Approvals do not automatically expire. `days_remaining` can be negative; the UI
  should show an overdue warning and still allow recording an actual purchase.
- Buyers can mutate only their own plans within the verified active organisation.
  Managers and analysts can read organisation submissions/outcomes. Admins cannot.
- Dates are calendar dates in Singapore. A purchase date must be on or after the
  approval date and no later than today. The purchase quantity may differ from the plan.
- Each decision inserts one buyer notification in the **same transaction** as the
  status change and decision audit. A failed insert rolls back all three writes.
- Withdrawal and manager decisions lock the same plan row. The first succeeds;
  the other receives 409 and must reload. Purchase recording also locks the row.

These defaults follow the handover's initial design. Expiry, multiple deliveries,
purchase corrections, repeat orders and explicit buyer reject/ignore events remain
separate product decisions; they are not silently implemented here.

## Routes

All routes use `/api/v1/purchase-plans`, Clerk Bearer authentication and
`Cache-Control: no-store`. Client-supplied organisation/owner/total fields are ignored.

| Method and suffix | Role | Response |
|---|---|---|
| `POST /{planId}/withdraw` | Owning buyer; submitted only | 200 `{ "plan": ... }` |
| `POST /{planId}/revise` | Owning buyer; rejected/withdrawn only | 201 `{ "plan": newDraft }` |
| `POST /{planId}/purchase` | Owning buyer; approved only | 201 `{ "plan": ... }` with status `purchased` |
| `GET /my-notifications` | Buyer | 200 `{ "notifications": [...], "unread_count": N }` |
| `POST /my-notifications/{id}/seen` | Notification's buyer | 204; repeat calls preserve the original seen time |
| `GET /{planId}/submission` | Owning buyer or same-org manager/analyst | Existing snapshot/decision plus outcomes below |

Withdrawal accepts `{ "reason": "Changed schedule" }`, `{}`, or no body.
Revision takes no body. It copies quantity/deadline and sets the new draft's
`scenario_as_of_date` to today. An elapsed deadline is preserved for editing;
existing submission validation requires a current deadline before resubmission.

Purchase body:

```json
{
  "purchased_on": "2026-10-29",
  "supplier": "Supplier A",
  "quantity_mt": 500,
  "price_usd_per_mt": 850.25,
  "note": "Optional invoice reference"
}
```

Supplier is required, trimmed, 1–200 characters. Note is optional, trimmed,
at most 2,000 characters. Quantity and USD/MT price must be positive, fewer than
one trillion, with at most six decimal places (trailing zeros ignored).
The server computes the exact decimal total; it accepts no client total.
Read the purchase after writing through `GET /{planId}/submission`.

Plan responses (including list/create/edit/submit/decide) add
`previous_plan_id` (null for original plans). The submission response adds:

- `purchase`: null or `{ purchase_id, purchased_on, supplier, quantity_mt,
  price_usd_per_mt, total_usd, note, recorded_at }`.
- `withdrawal`: null or `{ reason, withdrawn_at }`.
- `revision_plan_ids`: IDs linking the original to its new drafts. Use the new
  draft's `previous_plan_id` to read the earlier rejection reason via the
  original submission; apply the existing ownership checks on both pages.
- `comparison`: null before a purchase; otherwise USD totals from the frozen
  submission's `cost_impact`, with the recommendation evidence as the fallback for
  a reference-only BUY_NOW. Fields: `planned_quantity_mt`, `actual_quantity_mt`,
  `same_quantity`, `reference_total`, `central_total`, `forecast_total`,
  `actual_total`, `actual_minus_reference`, `actual_minus_estimate`,
  `reference_total_for_actual_quantity`, `estimate_total_for_actual_quantity`,
  `actual_minus_adjusted_reference`, `actual_minus_adjusted_estimate`, `currency`.
  Unavailable estimates stay null. Negative differences mean less, positive more.
  **When quantities differ, label the original totals' quantities and use the
  adjusted comparisons for price savings.** A smaller delivery is not itself a
  price saving. Adjusted values use decimal arithmetic with 34-digit precision.

Notification items contain `notification_id`, `plan_id`, `decision`, `created_at`,
`seen_at` (null until seen), `quantity_mt`, `purchase_deadline`, `manager_label`,
and `comment`. The list returns the latest 100, newest first; `unread_count`
counts **all** unread decisions, including older rows. Poll every 30 seconds in
the UI. The existing manager inbox continues to show withdrawn/purchased statuses.

Errors: 401 unsigned/invalid token, 403 wrong role/membership, 404 another owner,
organisation or missing record, 409 wrong status/concurrent change, 422 invalid
fields. Field validation returns `field_errors`. Malformed JSON/dates/numbers
return 422 with a safe message. Financial values never come from a client total.

## Shared database rollout (applied 2026-10-29; do not rerun)

After explicit user approval, all three migrations were committed in a single
transaction under locks on the affected tables. Before/after comparison of every
original column confirmed **4 plans, 1 submission and 1 decision unchanged**.
The decision was backfilled into **1 unread buyer notification**; new withdrawals
and purchase records are empty. All three new tables have RLS enabled.
Private backups and SHA-256 checksums are at
`/tmp/bunkerbuddy-migration-backups/lifecycle-20261029/` (owner-only permissions).
Keep a durable private copy if the team needs long-term retention; `/tmp` is temporary.
The updated backend was restarted and verified healthy with the new tables.

For a **new environment only**, the rollout sequence is:

1. Review these files, back up `purchase_plans`, `plan_approval_decisions` and
   `plan_approval_notifications`, and coordinate the deployment with the team.
2. Run **once, in this order**, in the shared Supabase SQL Editor:
   - `backend/migrations/20261029_buyer_decision_notifications.sql`
   - `backend/migrations/20261029_plan_withdrawal_revision.sql`
   - `backend/migrations/20261029_purchase_records.sql`
3. Notification migration backfills existing decisions as unread. Verify the
   new count equals the existing decision count, original plan fields/snapshots
   remain unchanged, all three new tables have RLS enabled, and no browser
   policies exist. The trusted backend role must have access to the new tables.
4. Deploy this backend after **all three** migrations succeed. The repository
   now selects `previous_plan_id`; starting this version before migration will
   break plan reads. Older deciders do not create buyer notifications; stop old
   backend writes during rollout and do not roll back after new statuses exist.
5. Verify with real buyer/manager/analyst accounts and record actual migration
   results in `plan-submission.md`. The application never runs migrations itself.

## Verification

Verified locally on 2026-10-29: **155 tests passed, 2 skipped, 0 failures/errors**
(`./mvnw test`). The disposable PostgreSQL migration smoke test passed too. Frontend: **268 tests
passed**, production build passed, lifecycle browser flow and recommendation layout
checks passed (desktop and mobile).

- `cd backend && ./mvnw test`: full backend suite (Mockito needs local JVM agent
  attachment; HTTP integration tests need permission to open localhost ports).
- `PlanLifecycleServiceTests`: real SQL/locks/rollback in isolated H2 PostgreSQL
  mode, including concurrent decision/withdrawal and duplicate purchase requests.
- `PlanLifecycleHttpTests`: authenticated role admission, trusted scope, 404/409/422,
  outcome visibility, invalid bodies and no-store responses.
- Disposable PostgreSQL migration smoke test, with PGlite installed outside the repo:

  ```bash
  npm install --prefix /tmp/bunker-lifecycle-sql --no-audit --no-fund @electric-sql/pglite
  node backend/scripts/test-plan-lifecycle-migrations.mjs /tmp/bunker-lifecycle-sql/node_modules/@electric-sql/pglite/dist/index.js
  ```

  Checks old migrations plus new DDL, backfill, preserved plans, decimal costs,
  ownership constraints, RLS and safe failure on rerun. It never connects to Supabase.

Shared migrations and the local server startup were verified. The browser journey
uses explicitly synthetic previews; a signed-in real-account buyer/manager journey
still needs checking. No real purchases or withdrawals were created during testing.

UI integration includes status-aware actions in the approval-status card, a linked
copy that opens its draft editor, previous-plan reasons/links, purchase records and
quantity-adjusted cost comparisons, buyer Decisions/unread navigation badges, and
Open/Finished plan filters. Actions require the buyer UI role, with server checks
as the authority. Failed writes that may have committed require a reload before
retry; 422 validation keeps the form values. Notification refreshes retain loaded
rows on errors and poll every 30 seconds.

Browser checks: `cd frontend && node scripts/test-plan-lifecycle.mjs` covers all
post-decision actions, notification reads, manager read-only behavior, and screenshots
at 1440/390 px. Screenshots default to `/tmp/bunker-lifecycle-ui/`.
`npm run test:recommendation-layout` also passes at 1920 through 320 px.


## Market dashboard contract

Use the existing plan list's deadline, status and `previous_plan_id` for the
"Your plans" block. Do not run an analysis request for every row or label a draft
"priced" without loading its recommendation. Managers can count submitted plans
from the organisation-scoped plan list, avoiding the inbox's latest-100 limit.
Keep the single 7/14/30 picker and existing admin forecast restriction; the UI
should hide the forecast for admins or explain the role restriction.

`/api/v1/market/stored` is unchanged, preserving Home's price card. The three
market bugs in the handover (null coverage rendered as zero, evidence fields
dropped by `parseForecast`, unknown series sorted ahead of MGO) are **frontend**
fixes. The backend already returns forecast evidence/skill, enforces publication
validity and returns only real published forecasts. Do not fabricate evidence or
weaken admin permissions to make the redesign render.
