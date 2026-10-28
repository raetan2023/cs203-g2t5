# After the manager decides: design proposal

**Status:** proposal, not implemented. No backend, database or API change has been made for anything below.
**Written:** 2026-10-28, for the owner of the approval workflow to review before building.
**Read first:** [plan-submission.md](plan-submission.md). It describes what exists today (submit, manager inbox, approve/reject, audit).

## Where things stand

Implemented and migrated on 2026-10-27:

- **Buyer:** opens a draft's recommendation page, picks a forecast cost detail, and clicks **Submit for approval**. The plan becomes `submitted` and locked, and one manager notification is stored with an immutable recommendation snapshot.
- **Manager:** sees the request in the **Approval inbox**. Opens it, then approves (comment optional) or rejects (reason required). The first decision is final, and an audit row is written in the same transaction.
- **Status values:** `draft`, `submitted`, `approved`, `rejected` (`purchase_plans_status_check`).
- **One submission and one decision per plan.** `plan_approval_notifications.plan_id` and `plan_approval_decisions.plan_id` are both `UNIQUE`. Every proposal below keeps that rule.

### Added on the UI branch (presentation only, on existing data)

PR "Show approval decisions to buyers" on `feature/ui-revamp-wireframe`:

- **Plan cards:** cards show "Awaiting manager approval", or "*Manager* approved/rejected this plan · *time*" with the comment or reason. The text is read from the existing `GET /{planId}/submission`, which buyers can already call for their own plans.
- **Submitted / approved / rejected page:** leads with the approval status, then a **Next step** line. That line currently says, in plain words, which follow-up actions are *not available yet*. When a gap below is built, replace the matching sentence with the real action:
  - `frontend/src/features/recommendations/RecommendationApproval.tsx` → `SubmittedRecommendationView`, the `nextStep` constant
  - `frontend/src/features/purchase-plan/components/PlanDecisionNote.tsx`, the last `pp-decision-meta` line

There is still nothing after the decision. The four gaps follow.

## Proposed lifecycle

```
            submit (buyer)            approve (manager)            record purchase (buyer)
  draft ───────────────────▶ submitted ─────────────────▶ approved ────────────────────────▶ purchased
    ▲                          │   │
    │                          │   └── reject (manager) ──▶ rejected ──┐
    │                          └────── withdraw (buyer) ─▶ withdrawn ──┤
    │                                                                  │
    └──────────── copy to new draft (buyer) ◀───────────────────────────┘
                  new plan_id, revised_from_plan_id = old plan
```

- **New statuses:** `withdrawn` and `purchased`. `rejected`, `withdrawn` and `purchased` are **final**, and a plan never goes back to `draft`.
- **Why no reopening:** reopening would need a second notification and decision row for the same plan, which the `UNIQUE` constraints forbid. It would also blur the audit trail ("which decision applied to which inputs?"). A revised proposal is a new plan that points at the old one.

## Gap 1: record the purchase

*An approved plan stays "approved" forever; nothing captures what was actually bought, so the estimate can't be compared with the real cost.*

- **Who:** the buyer who owns the plan, while it is `approved`. Managers and analysts in the organisation can read the record. Admin is denied, as for submissions today.
- **Captured fields:**
  - purchase date (on or after the approval date, not in the future)
  - supplier (free text, required)
  - quantity bought in MT (positive; may differ from the plan)
  - price paid in USD/MT (positive)
  - optional note
- **Total cost:** the server computes it as quantity × price. Never trust a client total.
- **Comparison shown afterwards**, all values taken from the saved snapshot:

  | Line | Value |
  |---|---|
  | Buy-today reference at submission | `cost_impact.reference_total` or `evidence.buy_now_cost_usd` |
  | Model estimate at submission | `central_total` / range |
  | Actual cost | quantity × price paid |
  | Difference | actual − reference, and actual − estimate |

  Use the same "less / more" wording as the recommendation page, since direction is not good or bad on its own.
- **Corrections:** one record per plan. Suggest allowing the buyer to amend it within N days, with the previous values kept in an audit table. **Open question.**
- **Bonus:** these rows are the first real outcome data for checking the model. Keep them queryable.

## Gap 2: a rejected plan is stuck

*Only drafts can be edited or deleted, so the buyer has to start again by hand.*

- Add **Copy to new draft** on rejected, withdrawn and (optionally) purchased plans. It creates a new `draft` prefilled with the old quantity and deadline, and sets `revised_from_plan_id`. The rejected plan, its snapshot and its decision stay untouched.
- The new draft needs a fresh recommendation, so the buyer reviews current prices before submitting again.
- **UI:** link both ways ("Revised as plan …" / "Revision of a rejected plan"), and show the earlier rejection reason on the new draft so the buyer can address it.
- **Deleting rejected plans:** not proposed. The decision row uses `ON DELETE RESTRICT`. Hiding finished plans is better handled by Gap 5's list filter.

## Gap 3: withdraw a submitted request

*Once submitted, the buyer can't pull it back.*

- The buyer who owns the plan can withdraw it while it is `submitted`. It moves to `withdrawn` (final), and the buyer uses **Copy to new draft** to change it.
- **Race with a manager:** lock the plan row, as submit and decide already do. Whichever action commits first wins, and the other gets **409** with a message to reload.
- **Inbox:** shows the request as withdrawn. Managers can't decide it (the decision route already requires `submitted`).
- **Optional:** a short required reason ("Deadline moved"), stored for the audit trail.

## Gap 4: the buyer is never told

*Managers get an inbox; buyers don't.*

- **Pull (done in the UI PR above):** the buyer sees the outcome on the plan card and the request page, but only when they look.
- **Push (still missing):** add a buyer notification when a decision is recorded, written in the **same transaction** as the decision (the pattern `plan_approval_notifications` already uses):
  - new table `plan_decision_notifications` (plan, organisation, buyer, decision, created_at, `seen_at`)
  - `GET /api/v1/purchase-plans/my-notifications`: buyer only, own rows, newest first, with an unread count
  - `POST /api/v1/purchase-plans/my-notifications/{id}/seen`
- **UI:** an unread badge on the Purchase plans nav item, plus a "Decisions" list for buyers. It mirrors the managers' Approval inbox and polls every 30 s like that inbox does.
- **Email:** out of scope. There is no email provider, so keep it in-app as `plan-submission.md` chose for managers.

## Gap 5: smaller follow-ups noticed while building the UI

- **"Active plans" count:** the plans page summary counts submitted, approved and rejected plans as "Active". Suggest counting only drafts and submitted requests.
- **Deadline badges on finished plans:** decided plans still show On track / Due soon / Overdue, which means little once a plan is rejected or purchased. Suggest hiding them for final states.
- **List filter:** add a filter for open vs finished plans once `purchased` and `withdrawn` exist.

## API sketch (new routes)

All routes are under `/api/v1/purchase-plans`, return `Cache-Control: no-store`, and take scope from the verified token as existing routes do.

| Route | Buyer | Manager | Analyst | Admin | Allowed from |
|---|---|---|---|---|---|
| `POST /{planId}/withdraw` | Own plan | Denied | Denied | Denied | `submitted` |
| `POST /{planId}/purchase` | Own plan | Denied | Denied | Denied | `approved` |
| `POST /{planId}/revise` → `{ "plan": newDraft }` | Own plan | Denied | Denied | Denied | `rejected`, `withdrawn`, `purchased` |
| `GET /my-notifications` | Own rows | Denied | Denied | Denied | n/a |
| `POST /my-notifications/{id}/seen` | Own rows | Denied | Denied | Denied | n/a |

**Status codes:** same conventions as today. Wrong status is 409, another owner or organisation is 404, invalid fields are 422, no auth is 401, wrong role is 403.

**`GET /{planId}/submission`** gains `purchase` (null until recorded) and `withdrawal` (null unless withdrawn). Plan responses gain `revised_from_plan_id`.

## Migration sketch (not applied, do not run as-is)

```sql
BEGIN;
ALTER TABLE public.purchase_plans DROP CONSTRAINT purchase_plans_status_check,
  ADD CONSTRAINT purchase_plans_status_check CHECK (status IN ('draft','submitted','approved','rejected','withdrawn','purchased')),
  DROP CONSTRAINT purchase_plans_submission_time_check,
  ADD CONSTRAINT purchase_plans_submission_time_check CHECK (
    (status = 'draft' AND submitted_at IS NULL) OR (status <> 'draft' AND submitted_at IS NOT NULL)),
  ADD COLUMN revised_from_plan_id uuid NULL REFERENCES public.purchase_plans(plan_id) ON DELETE RESTRICT;

CREATE TABLE public.plan_purchases (
  purchase_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL UNIQUE REFERENCES public.purchase_plans(plan_id) ON DELETE RESTRICT,
  clerk_org_id text NOT NULL CHECK (clerk_org_id ~ '^org_[A-Za-z0-9]+$'),
  buyer_user_id uuid NOT NULL REFERENCES public.users(user_id),
  purchased_on date NOT NULL,
  supplier text NOT NULL CHECK (length(btrim(supplier)) BETWEEN 1 AND 200),
  quantity_mt numeric NOT NULL CHECK (quantity_mt > 0),
  price_usd_per_mt numeric NOT NULL CHECK (price_usd_per_mt > 0),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plan_withdrawals (
  plan_id uuid PRIMARY KEY REFERENCES public.purchase_plans(plan_id) ON DELETE RESTRICT,
  buyer_user_id uuid NOT NULL REFERENCES public.users(user_id),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 2000),
  withdrawn_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plan_decision_notifications (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL UNIQUE REFERENCES public.purchase_plans(plan_id) ON DELETE CASCADE,
  clerk_org_id text NOT NULL CHECK (clerk_org_id ~ '^org_[A-Za-z0-9]+$'),
  buyer_user_id uuid NOT NULL REFERENCES public.users(user_id),
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz NULL
);
CREATE INDEX plan_decision_notifications_buyer_idx ON public.plan_decision_notifications (buyer_user_id, created_at DESC);

ALTER TABLE public.plan_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_decision_notifications ENABLE ROW LEVEL SECURITY;
COMMIT;
```

Follow the rollout steps in `plan-submission.md`: back up first, run it once in a transaction, and restart the backend after the migration. Older releases lack the new status guards and must not run against `withdrawn` or `purchased` plans.

## Open questions

1. **Purchase corrections:** immutable, or amendable within N days with an audit trail?
2. **Approval expiry:** should approval lapse if nothing is recorded by the plan deadline? If so, add an `expired` status, or only show a warning?
3. **Partial purchases:** one purchase record per plan (proposed), or several deliveries per plan?
4. **Withdrawal reason:** required or optional?
5. **Revising purchased plans:** should "Copy to new draft" be offered for repeat orders, or only for rejected and withdrawn plans?
6. **Analysts:** can they see purchase records and comparisons? Proposed yes, read-only, matching submissions today.

## Suggested build order

Each step is usable on its own:

1. **Gap 4 push notifications.** Smallest change; it reuses the inbox pattern and closes the feedback loop.
2. **Gap 3 withdraw + Gap 2 copy to new draft.** These share the "final state + revision" model.
3. **Gap 1 record purchase + comparison.** The biggest piece, and it depends on the open questions.
4. **Gap 5 list tidy-ups.**
