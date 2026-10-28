# Handover: Recommendations

**Updated:** 2026-10-28. Read [Start here](../handover.md#start-here) first.

**Status:** UI done up to the manager's decision. Everything **after** the decision is not built.
**Owner:** the recommendations teammate. The [open questions](#open-questions) are yours to decide with the team.

## What already works

On a plan's recommendation page (`/purchase-plans/recommendation`), the buyer picks a date and clicks **Submit for approval**. That locks the plan and notifies the managers. A manager approves or rejects from the **Approval inbox** on the purchase plans page; a rejection needs a reason.

The buyer can *see* the outcome: plan cards and the request page show who decided, when, and the comment or reason (PR #38).

## What is missing (build these)

1. **Record the purchase.** An approved plan stays "approved" forever. Nothing captures the date, supplier, quantity or price paid, so the estimate can't be compared with the real cost.
2. **A rejected plan is stuck.** Only drafts can be edited or deleted, so the buyer has to start a new plan by hand.
3. **No withdrawing** a request once it's submitted.
4. **The buyer is never notified.** Managers get an inbox; buyers only find out if they go and look.

Each needs backend, database and UI work. The recommended design is below; agree the [open questions](#open-questions) with the team first. Suggested order: **4 → 3 + 2 → 1** (see [build order](#suggested-build-order)).

## Extra reading

[`docs/plan-submission.md`](../plan-submission.md), sections **Agreed behaviour**, **API and role matrix**, **Manager decisions** and **Supabase rollout**. These cover how submit, decide, roles and migrations work today. Skip the dated logs.

## Design inspiration

There are no mockups for these screens yet. Match the pages already shipped:

- `docs/ui-revamp/assets/inspo/recommendations-page/`: the request page layout (answer card, sticky side rail, fine print).
- `docs/ui-revamp/assets/inspo/purchase-plans-page/image.png`: the plan cards and list.
- What's built now: `docs/ui-revamp/critique-rec/decision-views/` (approval states and plan cards) and `docs/ui-revamp/critique-rec/revamp-v1/` (recommendation page).
- **Patterns to reuse:**
  - forms: `PurchasePlanForm.tsx`
  - confirm-before-acting buttons: `RecommendationApproval.tsx` and `ManagerDecisionForm.tsx`
  - inbox list: `ApprovalInbox.tsx`
  - status notes on cards: `PlanDecisionNote.tsx`

## Where the UI is already waiting

These spots currently tell users a feature "isn't available yet". Replace each sentence with the real action:

| File | What to change |
|---|---|
| `frontend/src/features/recommendations/RecommendationApproval.tsx`, `SubmittedRecommendationView` | The `nextStep` text for submitted (withdraw), approved (record purchase) and rejected (copy to new draft). Put the action button under it, inside the "Approval status" card. |
| `frontend/src/features/purchase-plan/components/PlanDecisionNote.tsx` | The last line on decided plan cards |
| `frontend/src/features/purchase-plan/types.ts` → `PurchasePlanService` | Add `withdraw`, `recordPurchase`, `revise` and the buyer notification calls. Implement them in `apiService.ts` and `mockService.ts`. |
| `frontend/src/preview/recommendationScenarios.ts` → `withPreviewApproval` | Add the new actions to the preview service so they can be clicked through without a backend |

Preview: Demo controls → "Approval - …" for the request states, and "Purchase plans - every approval state" for the cards.

## Done means

| Gap | Done when |
|---|---|
| 1. Record purchase | The buyer records date, supplier, quantity and price on an approved plan. The plan becomes `purchased`. The request page shows actual vs estimated cost. Managers and analysts can read it. |
| 2. Rejected plan | **Copy to new draft** creates a prefilled draft linked to the rejected plan. Both pages link to each other, and the new draft shows the earlier rejection reason. |
| 3. Withdraw | The buyer withdraws a submitted request after confirming. It shows as withdrawn in the manager inbox. A manager deciding at the same moment gets a clear "reload" error. |
| 4. Notify buyer | A decision creates a buyer notification in the same transaction. The buyer sees an unread badge and a Decisions list, and can mark items as seen. |

All four also need: role checks, the 409/404/422 errors listed below, tests, preview states, and an entry in `plan-submission.md` saying it was built and migrated.

## Lifecycle

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

- **New statuses:** `withdrawn` and `purchased`. `rejected`, `withdrawn` and `purchased` are final; a plan never goes back to `draft`.
- **Why "copy to new draft" instead of reopening:** `plan_approval_notifications.plan_id` and `plan_approval_decisions.plan_id` are both `UNIQUE`, so a plan can be submitted and decided only once. Reopening would break that and blur the audit trail. A revision is a new plan pointing at the old one.

## 1. Record the purchase

- **Who:** the owning buyer, while the plan is `approved`. Managers and analysts in the organisation can read it; admin can't (same as submissions).
- **Fields:**
  - date bought: on or after the approval, not in the future
  - supplier: text, required
  - quantity in MT: positive, may differ from the plan
  - price paid in USD/MT: positive
  - optional note
- **Total:** the server computes quantity × price. Never trust a client total.
- **Comparison** (on the request page), using the saved submission snapshot:

  | Line | Value |
  |---|---|
  | Buy-today reference at submission | `cost_impact.reference_total` or `evidence.buy_now_cost_usd` |
  | Model estimate at submission | `central_total` or range |
  | Actual | quantity × price paid |
  | Differences | actual − reference, and actual − estimate |

  Word differences as "USD x less / more", like the recommendation page does.
- **Data use:** these rows are the first real outcome data for checking the forecast model. Keep them easy to query.

## 2. Rejected plan: copy to new draft

- Offered on `rejected` and `withdrawn` plans (maybe `purchased`, for repeat orders; see the open questions).
- Creates a new `draft` with the same quantity and deadline and `revised_from_plan_id` set. The old plan, its snapshot and its decision are untouched.
- The new draft gets a fresh recommendation, so the buyer sees current prices before resubmitting.

## 3. Withdraw

- The owning buyer, while the plan is `submitted`, after a confirm step. Optional or required short reason (see the open questions).
- **Locking:** lock the plan row the way submit and decide already do. The first to commit wins, and the other gets 409 "reload".
- **After withdrawing:** the manager inbox shows it as withdrawn. The decision route already refuses anything not `submitted`.

## 4. Notify the buyer

- When a decision is saved, insert a buyer notification **in the same transaction**, the same pattern `plan_approval_notifications` uses for managers.
- **UI:** an unread badge on the Purchase plans nav item, and a Decisions list for buyers that mirrors `ApprovalInbox.tsx` and polls every 30 s like it does.
- **No email:** there's no email provider, so keep it in-app.

## API (new routes)

All routes are under `/api/v1/purchase-plans`, return `Cache-Control: no-store`, and take scope from the verified token, like the existing ones.

| Route | Buyer | Manager / Analyst / Admin | Allowed when |
|---|---|---|---|
| `POST /{planId}/withdraw` | Own plan | Denied | `submitted` |
| `POST /{planId}/purchase` | Own plan | Denied | `approved` |
| `POST /{planId}/revise` → `{ "plan": newDraft }` | Own plan | Denied | `rejected`, `withdrawn` (`purchased`?) |
| `GET /my-notifications` | Own rows | Denied | n/a |
| `POST /my-notifications/{id}/seen` | Own rows | Denied | n/a |

**Errors:**

| Case | Status |
|---|---|
| Wrong status | 409 |
| Another owner or organisation | 404 |
| Invalid fields | 422 |
| Not signed in | 401 |
| Wrong role | 403 |

**Existing responses also change:**
- `GET /{planId}/submission` adds `purchase` and `withdrawal` (null when absent).
- Plan responses add `revised_from_plan_id`.

## Migration sketch (not applied; review before running)

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

**Before deploying:**
- Split this into one migration per gap if you build them separately.
- Older backend releases lack the new status guards, so they must not run against `withdrawn` or `purchased` plans.

## Open questions

Agree these with the team before building:

1. **Purchase corrections:** immutable, or editable for N days with an audit trail?
2. **Expiry:** should approval expire if no purchase is recorded by the deadline? That could be an `expired` status, or just a warning. Today an approved plan past its deadline shows as both approved and overdue.
3. **Partial and split purchases:** one purchase per plan, or several deliveries? The policy can already return `SPLIT` with allocations, but a plan has one quantity and one deadline, so a split can't be planned or recorded.
4. **Withdrawal reason:** required or optional?
5. **Repeat orders:** offer "Copy to new draft" on purchased plans too?
6. **Analysts:** can they read purchase records? Proposed yes, read-only.
7. **The buyer's own answer to the advice (PRD FR-08: accept, reject or ignore).** Today, submitting for approval reads as *accept*. Nothing records a buyer who rejects or ignores the advice, or which recommendation version they saw. Decide whether submit = accept, and whether reject/ignore need recording.

## Suggested build order

1. **Gap 4, buyer notifications.** Smallest; it reuses the inbox pattern.
2. **Gaps 3 and 2, withdraw and copy to new draft.** They share the "final state + revision" model.
3. **Gap 1, record purchase and comparison.** The biggest, and it depends on open questions 1–3.
4. **Purchase plans' small follow-ups** (see [Purchase plans](purchase-plans.md)).
