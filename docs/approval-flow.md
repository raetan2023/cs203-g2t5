# Approval flow

The agreed purchase plan approval logic, from creating a plan to buying the MGO.
"PO" is the procurement officer, "PM" is the PO's assigned procurement manager.
Status names in brackets are the values stored in `purchase_plans.status`.
The list at the end shows what the current code still has to change to match.

```text
APPROVAL FLOW: BUNKER BUDDY

Plan statuses: Draft → Awaiting Approval → Approved → Finished
  Draft              (draft)
  Awaiting Approval  (submitted)
  Approved           (approved)
  Finished, with why it ended:
    Rejected   (rejected)   PM rejected it, or it was rejected automatically
    Withdrawn  (withdrawn)  PO pulled it back before the PM decided
    Purchased  (purchased)  PO bought the MGO
    Closed     (closed)     approved, but the PO left the officer role before buying
Every status change is recorded with who did it, when, and an optional note.

────────────────────────────────────────
1. PO CREATES A PLAN
────────────────────────────────────────
PO enters the volume of MGO (in MT) and the deadline
  Volume must be more than 0
  Deadline must be today or later
Plan is saved as Draft
Log: "Plan created by PO"

While the plan is Draft, the PO can:
  edit the volume and deadline
  delete the plan
    (this also deletes its saved recommendations and responses,
     since nothing about a draft has been submitted)

────────────────────────────────────────
2. PO GENERATES A RECOMMENDATION
────────────────────────────────────────
Only allowed while the plan is Draft
Runs only when the PO clicks "New recommendation"
  (opening or refreshing the page does not create or save anything)
  A new draft shows no recommendation until the PO clicks it

Engine takes today's reference price and the 7, 14 and 30 day forecasts
  Only forecasts dated on or before the deadline are used
  The forecasts are blended into one price signal
    Nearer forecasts get more weight

Engine returns one of (checked in this order):
  Monitor         → the deadline has passed
                  → or there is no valid reference price
  Buy Now         → the deadline is 7 days away or less
                    There is no time left to wait, so forecasts
                    are not used and no Monitor check applies
                    (even if the reference price is old)
  Otherwise (more than 7 days left):
  Buy Now         → no forecast is available
                  → or the blended signal is not cheaper than today
  Buy on Date X   → the blended signal is cheaper than today
                    X is the earliest forecast date before the deadline
  Monitor         → overrides Buy Now / Buy on Date X when:
                    the predicted range overlaps today's price,
                      or disagrees with the signal's direction
                    or the reference price is more than 7 days old
                    (both checks are skipped for the news-aware
                     Ridge model, which times purchases on its
                     central estimate)

Save the recommendation as a new record
  (never overwrite older ones)
Record who generated it and when
PO can click "New recommendation" again on any day,
  and every run is kept
The draft shows only the latest one (see step 8)

PO responds to a recommendation: Accept, Reject (with a reason) or Ignore
Every response is kept

────────────────────────────────────────
3. PO SUBMITS THE PLAN
────────────────────────────────────────
Only allowed if:
  the plan is Draft
  the PO has an assigned PM
  the deadline has not passed
  the plan has at least one saved recommendation
PO picks the forecast horizon (7, 14 or 30 days) to show the PM
Take the latest saved recommendation
  It must be from today and match the plan's current volume and deadline
    Otherwise: "Click New recommendation for today's advice"
  The PO must have accepted it
    Otherwise: "Accept the recommendation before submitting"

If it says Monitor:
  Block the submission
  Show "Monitoring, check again tomorrow"
  Stop here, and the plan stays Draft
  (With 7 days or less left the engine already says Buy Now,
   so a short deadline is never stuck on Monitor)

Lock this recommendation to the plan (it can't change after this)
Plan becomes Awaiting Approval
PM is notified
PM can view the locked recommendation and download it as a PDF
Log: "Submitted by PO"

────────────────────────────────────────
4. WHILE THE PLAN IS AWAITING APPROVAL
────────────────────────────────────────
Only the PO's assigned PM can decide
The first decision is final

If the PM approves:
  Only allowed while the deadline has not passed
    After the deadline the PM can only reject
  PM can add a comment
  Plan becomes Approved
  PO is notified
  Log: "Approved by PM"

If the PM rejects:
  PM gives a reason
  Plan becomes Finished (Rejected)
  PO is notified
  Log: "Rejected by PM", with the reason

If the PO withdraws it (before the PM decides):
  PO can give a reason
  Plan becomes Finished (Withdrawn)
  PM still sees it as withdrawn
  Log: "Withdrawn by PO", with the reason

If nobody decides in time:
  Checked every hour
  When the deadline is 5 or more days in the past:
    Plan becomes Finished (Rejected)
    Decider shown as "Bunker Buddy (automatic)",
      filed under the PO's current PM
    Reason: "Rejected automatically: no decision within
             5 days after the purchase deadline."
    PO is notified
  Skipped while the PO has no PM, until an admin assigns one

────────────────────────────────────────
5. PO ACTS ON AN APPROVED PLAN
────────────────────────────────────────
Only allowed if the plan is Approved
The approved plan is locked: it can't be edited, withdrawn or cancelled

When the PO buys:
  PO enters the purchase date, supplier, 
    price paid in USD/MT (trust user to input correct price of mgo on the day they're buying) and an optional note
    no need to key in qty bought as plan fixed once approved
  Purchase date must be on or after the approval date,
    no later than today, and no later than the deadline
    (the date bought counts, not the day it's recorded,
     so a purchase made on time can still be logged a day late)
  Still open: an approved plan that is never bought
    stays Approved forever (see item 10 at the end)
  Plan becomes Finished (Purchased)
  The actual cost is compared with the locked recommendation
  Log: "Purchased by PO at $X"

────────────────────────────────────────
6. WHEN A PO LEAVES THE OFFICER ROLE
────────────────────────────────────────
(promoted, made an admin, or removed from the organisation)
Nobody else can act on their plans, so:
  Awaiting Approval plans become Finished (Withdrawn)
    Reason: the role change
    The reviewing PM is recorded, and still sees them as withdrawn
  Approved plans not bought yet become Finished (Closed)
    Log: "Closed: PO left the officer role"
Drafts are left as they are

────────────────────────────────────────
7. PO COPIES A FINISHED PLAN
────────────────────────────────────────
Only allowed if the plan is Rejected, Withdrawn or Closed
  (never Purchased)
Create a new Draft with the same volume and deadline
Link it to the original plan ("copied from Plan #X")
If the deadline has passed, the PO must edit it before submitting
PO starts again from step 2

────────────────────────────────────────
8. WHO SEES WHAT
────────────────────────────────────────
PO sees their own plans
  Draft: only the latest recommendation
    (older ones are kept for audit, not shown)
  their own responses, on the Decision history page
  Submitted and later: the locked recommendation, with the PDF
PM sees the plans of the POs assigned to them,
  except drafts (a PM never sees a draft or its recommendations)
  the locked recommendation of each submitted plan, with the PDF
Admin sees every plan in the organisation
  a read-only list of every recommendation generated for any plan,
    each shown with the PO's response to it
Withdrawn plans drop out of the PO's and PM's lists
  5 days after they were withdrawn
  Admins still see them, and nothing is deleted

────────────────────────────────────────
9. AUDIT TRAIL
────────────────────────────────────────
Kept forever (for every plan that was submitted):
  every recommendation generated, and every response to it
    (admins can view these, see step 8)
  the locked recommendation for each submitted plan
  every status change, with who, when and why
  every purchase record
  links between copied plans and their originals
Only drafts can be deleted.
  Deleting a draft also deletes its recommendations and responses,
  so they drop out of the admin list too.
Once a plan is submitted, nothing about it is deleted.
Plans that are done are only marked Finished.
```

## What the current code still needs

Everything above that isn't listed here already works on `main`.

1. **Saved recommendations.** Recommendations are worked out again on every request and never stored. The only things saved now are the PO's response (`plan_recommendation_decisions`) and the snapshot locked at submission. Needs a new table that is only ever added to, plus an endpoint behind the "New recommendation" button that saves one row per click. The draft page should show the latest saved row instead of working one out when it opens, and submission should use that row.
3. **Creation time.** `purchase_plans` has no `created_at`, so there's no record of when a plan was created. Draft edits also overwrite the volume and deadline without a record.
4. **Who closed a plan, and when.** Moving to `closed` only changes the status; nothing records who, when or why.
5. **Deleting a draft that has responses.** `plan_recommendation_decisions` blocks deleting a plan that has rows in it (`ON DELETE RESTRICT`). Deleting a draft the PO has already responded to most likely fails with an error instead of working. The saved-recommendations table needs the same care.
6. **Hiding drafts from PMs.** A PM's plan list includes every plan of their assigned POs, drafts too (`ASSIGNED_TO_MANAGER` in `PurchasePlanRepository` doesn't filter by status). The live recommendation endpoint also lets a manager read any plan they can see. Both need to leave drafts out.
7. **Admin recommendation history.** New read-only endpoint and admin page listing every saved recommendation for any plan in the organisation, each with the PO's response.
10. **Approved plans that are never bought (future work).** An approved plan that is never bought stays Approved forever; nothing expires it. Option: approved plans not bought within N days after the deadline move to Finished, either `closed` or a new `expired` status. Left for later, since it needs a status or a scheduled job. (A purchase dated after the deadline, and a PM approving after the deadline, are already blocked.)

## Who is fixing what

| Owner | Items | Files they own |
|---|---|---|
| Wunna | 5, 6, 3, 4, plus reviewing and applying **every** migration to the shared Supabase database | `PurchasePlanRepository`, `PurchasePlan.java`, `OrganisationMembers`, the `delete` and `analyze` methods in `PurchasePlanController` |
| Rae | 10 (a)+(b), 2, 8, 9, 1, 7 | `PlanApprovalService`, `PlanLifecycleService`, `RecommendationPolicy`, `PlanAnalysisService`, the recommendations and purchase UI, the admin history page, and new files for item 1 |

Change a file the other person owns only after agreeing it with them. New endpoints go in new controllers, not `PurchasePlanController`.

### Proposed table for item 1 (Wunna to review before Rae builds on it)

Rae writes this migration file; Wunna reviews it and applies it.

```text
plan_recommendations              one row per "New recommendation" click, add-only
  recommendation_row_id  uuid PK default gen_random_uuid()
  plan_id                uuid      not null
  clerk_org_id           text      not null, matches ^org_[A-Za-z0-9]+$
  buyer_user_id          uuid      not null
    FK (plan_id, clerk_org_id, buyer_user_id) → purchase_plans ON DELETE CASCADE
    (only drafts can be deleted, and their recommendations go with them)
  recommendation_id      text      not null   the engine's ID
  action                 text      not null   BUY_NOW | WAIT | MONITOR
  target_date            date      null       the X in "Buy on Date X"
  policy_version         text      not null
  run_id                 uuid      null       forecast run used
  scenario_as_of_date    date      not null   the planning day it was made for
  quantity_mt            numeric   not null   plan inputs at the time
  purchase_deadline      date      not null
  analysis               jsonb     not null   full engine output, all three horizons
  generated_at           timestamptz not null default now()
  index (plan_id, generated_at desc), index (clerk_org_id, generated_at desc)
  RLS on, no browser policies (same as the other plan tables)

plan_recommendation_decisions     existing table
  + recommendation_row_id uuid null → plan_recommendations ON DELETE CASCADE
    (links each response to the exact saved run; null for older responses)
```

### Instructions for Wunna's agent

Paste this into your Claude Code session from the repo root:

```text
You are fixing the database and visibility items of the Bunker Buddy approval
flow. The spec is docs/approval-flow.md: read the whole file first. My items
are 5, 6, 3 and 4 in "What the current code still needs". Rae's agent is
working on items 1, 2, 7, 8, 9 and 10 at the same time, so stay inside my
files (see "Who is fixing what").

How to work
- Before starting, and again before each PR: git fetch origin and branch from
  the latest origin/main. One branch and one small PR per item, in the order
  5, 6, 3, 4. Do not push to main.
- Do not touch PlanApprovalService, PlanLifecycleService, RecommendationPolicy,
  PlanAnalysisService or the recommendations/purchase frontend. If an item
  needs a change there, stop and tell me so I can agree it with Rae.
- Backend tests use in-memory H2. Each test class creates its own tables
  (e.g. PurchasePlanRepositoryTests), so add new columns and tables there too.
  Run: cd backend && ./mvnw test (in Git Bash on a conda machine:
  PATH="/usr/bin:$PATH" ./mvnw test). All tests must pass before each PR.
- When an item is merged, remove it from "What the current code still needs"
  in docs/approval-flow.md in the same PR.

Migrations (items 3 and 4)
- New file per change: backend/migrations/YYYYMMDD_short_name.sql, wrapped
  in BEGIN/COMMIT, additive only, with a header comment saying what it does,
  what it runs after and "do not rerun". Follow the existing files, e.g.
  20261029_plan_withdrawal_revision.sql: RLS enabled, no browser policies,
  clerk_org_id checked against ^org_[A-Za-z0-9]+$, composite FK to
  purchase_plans(plan_id, clerk_org_id, user_id).
- Never run anything against the shared Supabase database yourself. I apply
  migrations by hand after review, in date order, including Rae's item 1
  migration.
- Update docs/database-schema.md and docs/mgo_current_sprint_schema.sql to
  match. If practical, extend backend/scripts/test-plan-lifecycle-migrations.mjs
  (PGlite, never connects to Supabase).

Item 5: deleting a draft that has responses
- Today PurchasePlanRepository.delete fails when the draft has rows in
  plan_recommendation_decisions (FK is ON DELETE RESTRICT), probably as a
  500 error.
- In one transaction: keep the existing draft-only, owner and organisation
  checks, delete that plan's plan_recommendation_decisions rows, then the
  plan. No migration needed.
- Tests: deleting a draft with a response returns 204 and removes both; a
  submitted plan still returns 409; another user's draft still returns 404.

Item 6: PMs never see drafts
- VISIBLE_TO_MANAGER (used by findForManager and findByIdForManager) and
  findAssignedToManager return drafts. Exclude status 'draft' from the
  manager list and single-plan reads. This also blocks the live
  recommendation endpoint, PurchasePlanController.analyze, because it reads
  through findByIdForManager.
- ManagerOverviewController (team overview) uses findAssignedToManager. If
  it shows draft details, exclude drafts. If it only shows a count of
  drafts, ask me before changing it.
- Leave lockAssignedToManager alone (decisions already require 'submitted').
- Tests: a PM gets 404 for a draft of their PO and doesn't see it in the
  list; submitted and decided plans still appear; admins still see drafts.

Item 3: when a plan was created
- Migration: add purchase_plans.created_at timestamptz NULL DEFAULT now().
  Leave existing rows NULL: their real creation time is unknown, and an
  audit must not make one up.
- Add createdAt to the PurchasePlan record, set it in insert and
  insertRevision (a copy gets its own creation time), and return
  "created_at" (null when unknown) in toResponse.

Item 4: who closed a plan, when and why
- Today OrganisationMembers.closeOfficerWork moves approved plans to 'closed'
  with one bulk UPDATE and records nothing else.
- Migration: new table plan_closures, modelled on plan_withdrawals: plan_id
  PK, clerk_org_id, buyer_user_id, reason, closed_at, plus manager_user_id
  null (the PO's PM at the time), same composite FK and RLS.
- Change closeOfficerWork to close plans one at a time, like the
  withdrawals loop just above it, inserting a plan_closures row with reason
  "Closed: the officer left the officer role". Repeating it must still
  change nothing.
- Return the closure record with the plan the way the withdrawal is
  returned, but the plan detail response lives in Rae's
  PlanApprovalController, so agree that part with Rae first.
- Tests: closing writes one closure row per approved plan; running it twice
  adds nothing.

Before each PR, re-read the item in docs/approval-flow.md and check the
change matches it. In the PR description, list any migration I still need
to apply.
```
