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

Engine returns one of:
  Monitor         → the deadline has passed
                  → or there is no valid reference price
  Buy Now         → no forecast fits before the deadline
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
    Otherwise: "Generate a new recommendation"
  The PO must have accepted it
    Otherwise: "Accept the recommendation before submitting"

If it says Monitor:
  If the deadline is 7 days away or less:
    Treat it as Buy Now, since there is no time left to wait
    Note on the plan: "Converted from Monitor due to deadline"
  Otherwise:
    Block the submission
    Show "Monitoring, check again tomorrow"
    Stop here, and the plan stays Draft

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
  PO enters the purchase date, supplier, quantity bought,
    price paid (USD/MT) and an optional note
  Purchase date must be on or after the approval date
    and no later than today
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
2. **Blocking Monitor at submission.** `PlanApprovalService.submit` doesn't check the action, so a Monitor recommendation can be submitted today. Add the block, plus the conversion when the deadline is 7 days or less away and its note on the plan.
3. **Creation time.** `purchase_plans` has no `created_at`, so there's no record of when a plan was created. Draft edits also overwrite the volume and deadline without a record.
4. **Who closed a plan, and when.** Moving to `closed` only changes the status; nothing records who, when or why.
5. **Deleting a draft that has responses.** `plan_recommendation_decisions` blocks deleting a plan that has rows in it (`ON DELETE RESTRICT`). Deleting a draft the PO has already responded to most likely fails with an error instead of working. The saved-recommendations table needs the same care.
6. **Hiding drafts from PMs.** A PM's plan list includes every plan of their assigned POs, drafts too (`ASSIGNED_TO_MANAGER` in `PurchasePlanRepository` doesn't filter by status). The live recommendation endpoint also lets a manager read any plan they can see. Both need to leave drafts out.
7. **Admin recommendation history.** New read-only endpoint and admin page listing every saved recommendation for any plan in the organisation, each with the PO's response.
8. **Wording of the automatic rejection reason.** The code acts 5 days *after* the deadline, but the saved reason says "within 5 days of the purchase deadline" (`PlanApprovalService.AUTOMATIC_REASON`).
