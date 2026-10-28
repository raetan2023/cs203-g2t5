# Handover by page

**Updated:** 2026-10-28. One section per page. Read [Start here](#start-here), then only your page's section.

| Page | UI | Backend | Owner now | Next step |
|---|---|---|---|---|
| [Login](#login) | Done | Done (Clerk) | — | Optional follow-up only |
| [Home](#home) | Done (PR #40) | No new endpoints needed | — | Photo / time-of-day choice |
| [Purchase plans](#purchase-plans) | Done | Done | — | Small follow-ups after the new statuses exist |
| [Recommendations](#recommendations) | Done up to the manager's decision | **Missing: everything after the decision** | **Recommendations teammate** | Agree the [open questions](#open-questions), then build |
| [Market dashboard](#market-dashboard) | **Spec done** (HTML proposal); live page unchanged | Small additions | **Market dashboard teammate** | Build the spec in React; decide "Your plans" |

---

## Start here

### Branch and workflow

- Branch from **`feature/ui-revamp-wireframe`**. It is up to date with `main` and is the only branch with the new UI. Open PRs back into it.
- Before starting and before each PR, check you're not behind: `git fetch && git rev-list --count HEAD..origin/main` should print `0`. Merge (don't rebase) if it isn't.
- One branch per gap keeps reviews small.
- Database changes go to the **shared** Supabase project by hand. Back up first, run once, record the result, and tell the team. Follow the rollout steps in `plan-submission.md`. Never rerun the existing migrations in `backend/migrations/`.

### Read only these

| Read | Why |
|---|---|
| This file, your page's section | What to build and how |
| `frontend/AGENTS.md` | Frontend rules: use `--bb-*` tokens from `frontend/src/styles/tokens.css`, no new hex colours |
| `docs/frontend-design-guidelines.md` | States to cover (loading, empty, error), accessibility, never colour alone |

Each page section lists any extra reading. You can skip the forecast, Ridge and revamp-planning docs unless your section names them.

### Mockups and screenshots

- **Mockups:** `docs/ui-revamp/assets/inspo/<page>/`. Each folder has a `README.md` or `HANDOFF.md`. Serve the folder (`python -m http.server`) and open the `.dc.html` file; its inline styles carry the exact spacing and sizes.
- **Screenshots of what's built:** under `docs/ui-revamp/critique-*/` and each page's review folder.

### Test and preview

- **Frontend:** in `frontend/`, run `npm test`, `npm run build` and `npm run test:recommendation-layout`.
  - If the machine is busy and tests time out, use `npx vitest run --maxWorkers=2`.
- **Backend:** in `backend/`, run `./mvnw test`. Add HTTP tests for every role and status, as `plan-submission.md` describes for submit and decide.
- **Preview without a backend:** run `npm run dev` and open `/preview.html`, then use **Demo controls**. Don't refresh; reopen `/preview.html` instead.

---

## Login

**Status:** done. Hybrid reactive ship (PR #37): a dusk scene whose ship reacts to the form, with Clerk's real form in a cream card. Code: `features/auth/ReactiveShip.tsx`, `useAuthFormSignals.ts`, `AuthLayout.tsx`. Screenshots: `docs/ui-revamp/login-ship/`.

**Optional follow-ups:**
- The "sail" after a *successful* sign-in doesn't play, because Clerk redirects immediately.
- Impeccable flags Geist as an overused font. Geist is the owner's choice and stays on the auth pages only.

## Home

**Status:** done. Role-aware Home for buyer, manager, analyst and admin (PR #40), built from `docs/ui-revamp/assets/inspo/home-page/`. Its `HANDOFF.md` has the decisions and the backend check.

**Still open:**
- Photo: one fixed image, or swap by time of day to match the greeting.
- Check the page against the real Clerk header.

**Watch out:** the Home price card reads the same `GET /api/v1/market/stored` as the market dashboard (`features/home/marketQuote.ts`, series `SGP_MGO_OBSERVED`). Changing that response changes Home too.

## Purchase plans

**Status:** done. Plan cards with Sort by, create/edit/delete with notices, the manager approval inbox, and decision notes on decided plans (PR #38). Mockup: `docs/ui-revamp/assets/inspo/purchase-plans-page/image.png`.

**Deferred motion:** cards sliding on re-sort, and a first-load reveal.

**Small follow-ups (UI only):** these wait for the new statuses from [Recommendations](#recommendations).
- "Active plans" counts submitted, approved and rejected plans. Count only drafts and submitted.
- Decided plans still show On track / Due soon / Overdue. Hide those badges for final states.
- Once `purchased` and `withdrawn` exist, add an open / finished filter to the plans list.

---

## Recommendations

**Status:** UI done up to the manager's decision. Everything **after** the decision is not built.
**Owner:** the recommendations teammate. The [open questions](#open-questions) are yours to decide with the team.

### What already works

On a plan's recommendation page (`/purchase-plans/recommendation`), the buyer picks a date and clicks **Submit for approval**. That locks the plan and notifies the managers. A manager approves or rejects from the **Approval inbox** on the purchase plans page; a rejection needs a reason.

The buyer can *see* the outcome: plan cards and the request page show who decided, when, and the comment or reason (PR #38).

### What is missing (build these)

1. **Record the purchase.** An approved plan stays "approved" forever. Nothing captures the date, supplier, quantity or price paid, so the estimate can't be compared with the real cost.
2. **A rejected plan is stuck.** Only drafts can be edited or deleted, so the buyer has to start a new plan by hand.
3. **No withdrawing** a request once it's submitted.
4. **The buyer is never notified.** Managers get an inbox; buyers only find out if they go and look.

Each needs backend, database and UI work. The recommended design is below; agree the [open questions](#open-questions) with the team first. Suggested order: **4 → 3 + 2 → 1** (see [build order](#suggested-build-order)).

### Extra reading

`docs/plan-submission.md`, sections **Agreed behaviour**, **API and role matrix**, **Manager decisions** and **Supabase rollout**. These cover how submit, decide, roles and migrations work today. Skip the dated logs.

### Design inspiration

There are no mockups for these screens yet. Match the pages already shipped:

- `docs/ui-revamp/assets/inspo/recommendations-page/`: the request page layout (answer card, sticky side rail, fine print).
- `docs/ui-revamp/assets/inspo/purchase-plans-page/image.png`: the plan cards and list.
- What's built now: `docs/ui-revamp/critique-rec/decision-views/` (approval states and plan cards) and `docs/ui-revamp/critique-rec/revamp-v1/` (recommendation page).
- **Patterns to reuse:**
  - forms: `PurchasePlanForm.tsx`
  - confirm-before-acting buttons: `RecommendationApproval.tsx` and `ManagerDecisionForm.tsx`
  - inbox list: `ApprovalInbox.tsx`
  - status notes on cards: `PlanDecisionNote.tsx`

### Where the UI is already waiting

These spots currently tell users a feature "isn't available yet". Replace each sentence with the real action:

| File | What to change |
|---|---|
| `frontend/src/features/recommendations/RecommendationApproval.tsx`, `SubmittedRecommendationView` | The `nextStep` text for submitted (withdraw), approved (record purchase) and rejected (copy to new draft). Put the action button under it, inside the "Approval status" card. |
| `frontend/src/features/purchase-plan/components/PlanDecisionNote.tsx` | The last line on decided plan cards |
| `frontend/src/features/purchase-plan/types.ts` → `PurchasePlanService` | Add `withdraw`, `recordPurchase`, `revise` and the buyer notification calls. Implement them in `apiService.ts` and `mockService.ts`. |
| `frontend/src/preview/recommendationScenarios.ts` → `withPreviewApproval` | Add the new actions to the preview service so they can be clicked through without a backend |

Preview: Demo controls → "Approval - …" for the request states, and "Purchase plans - every approval state" for the cards.

### Done means

| Gap | Done when |
|---|---|
| 1. Record purchase | The buyer records date, supplier, quantity and price on an approved plan. The plan becomes `purchased`. The request page shows actual vs estimated cost. Managers and analysts can read it. |
| 2. Rejected plan | **Copy to new draft** creates a prefilled draft linked to the rejected plan. Both pages link to each other, and the new draft shows the earlier rejection reason. |
| 3. Withdraw | The buyer withdraws a submitted request after confirming. It shows as withdrawn in the manager inbox. A manager deciding at the same moment gets a clear "reload" error. |
| 4. Notify buyer | A decision creates a buyer notification in the same transaction. The buyer sees an unread badge and a Decisions list, and can mark items as seen. |

All four also need: role checks, the 409/404/422 errors listed below, tests, preview states, and an entry in `plan-submission.md` saying it was built and migrated.

### Lifecycle

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

### 1. Record the purchase

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

### 2. Rejected plan: copy to new draft

- Offered on `rejected` and `withdrawn` plans (maybe `purchased`, for repeat orders; see the open questions).
- Creates a new `draft` with the same quantity and deadline and `revised_from_plan_id` set. The old plan, its snapshot and its decision are untouched.
- The new draft gets a fresh recommendation, so the buyer sees current prices before resubmitting.

### 3. Withdraw

- The owning buyer, while the plan is `submitted`, after a confirm step. Optional or required short reason (see the open questions).
- **Locking:** lock the plan row the way submit and decide already do. The first to commit wins, and the other gets 409 "reload".
- **After withdrawing:** the manager inbox shows it as withdrawn. The decision route already refuses anything not `submitted`.

### 4. Notify the buyer

- When a decision is saved, insert a buyer notification **in the same transaction**, the same pattern `plan_approval_notifications` uses for managers.
- **UI:** an unread badge on the Purchase plans nav item, and a Decisions list for buyers that mirrors `ApprovalInbox.tsx` and polls every 30 s like it does.
- **No email:** there's no email provider, so keep it in-app.

### API (new routes)

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

### Migration sketch (not applied; review before running)

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

### Open questions

Agree these with the team before building:

1. **Purchase corrections:** immutable, or editable for N days with an audit trail?
2. **Expiry:** should approval expire if no purchase is recorded by the deadline? That could be an `expired` status, or just a warning. Today an approved plan past its deadline shows as both approved and overdue.
3. **Partial and split purchases:** one purchase per plan, or several deliveries? The policy can already return `SPLIT` with allocations, but a plan has one quantity and one deadline, so a split can't be planned or recorded.
4. **Withdrawal reason:** required or optional?
5. **Repeat orders:** offer "Copy to new draft" on purchased plans too?
6. **Analysts:** can they read purchase records? Proposed yes, read-only.
7. **The buyer's own answer to the advice (PRD FR-08: accept, reject or ignore).** Today, submitting for approval reads as *accept*. Nothing records a buyer who rejects or ignores the advice, or which recommendation version they saw. Decide whether submit = accept, and whether reject/ignore need recording.

### Suggested build order

1. **Gap 4, buyer notifications.** Smallest; it reuses the inbox pattern.
2. **Gaps 3 and 2, withdraw and copy to new draft.** They share the "final state + revision" model.
3. **Gap 1, record purchase and comparison.** The biggest, and it depends on open questions 1–3.
4. **Purchase plans' small follow-ups** (see [Purchase plans](#purchase-plans)).

---

## Market dashboard

**Status:** the redesign is specified as a working HTML proposal. The live page (`/market-dashboard`) hasn't changed.
**Owner:** the market dashboard teammate (a different teammate from recommendations). The "handed over" items below are yours to decide and build.
**What's left:** mostly building the spec in React, plus a few backend and data items. Little design work remains.

### What's live today

- `features/market-dashboard/MarketDashboard.jsx` renders `StoredMarketPanel.jsx` (prices, history chart, bunker sales, GDELT news) and the shared `ForecastWidget` (`features/forecast/`).
- Data comes from `GET /api/v1/market/stored`, re-read every 60 s. The forecast comes from `GET /api/v1/forecast?horizon_days=7|14|30`.
- The daily import (`.github/workflows/import-market.yml`, 07:37 SGT) is enabled and writes MGO quotes. Quotes are sparse, so the latest one is often a few days old.

### The spec

Everything is in `docs/ui-revamp/market-proposal/`. Start with its `README.md`.

| File | What it is |
|---|---|
| `market-proposal.html` | The design, working, with sample data. Add `?state=loading`, `read-error`, `empty`, `missing`, `forecast-unavailable`, `forecast-error`, `no-plans`, `no-plan-access`, … to see each state. |
| `PARITY.md` | Every behaviour of the current page, and where it lives in the new design. **The rule: nothing in it may be lost.** |
| `MISSING.md` | What the proposal still lacks, page-specific |
| `TASTE_REVIEW.md` + `taste-review/` | Taste's review and screenshots. Now 0 FAIL, 2 WARN: the beige text, which is the accepted brand, and the uneven card rows. |
| `snapshot.mjs` | With the backend running, swaps the sample data for the real stored read |

### Decided (2026-10-28)

- **Colour means what's good for a buyer.** Green = the change makes fuel cheaper. Red (`#f2849e`) = dearer. Grey = no direct effect (the USD index) or no change. Always pair the colour with an arrow and a sign.
  - This supersedes CREATIVE_BRIEF §3.5, which said green = up and red = down. That line needs updating.
- **MGO comes first.** It's the chart's default series and the largest figure, and the title line states its price and the forecast range.
- **Two range controls stay, labelled by direction:** **Past 15 · 30 · 60 days** for the chart's history, and **Next 7 · 14 · 30 days** for the forecast.
  - The market forecast's horizon is **not** shared with the purchase estimate, which has its own forecast provider (`/api/v1/purchase-plans/forecast`).
  - The proposal still shows both as "N days"; apply the Past/Next labels when building.

### Handed over: yours to decide and build

1. **The "Your plans" block** (right column).
   - **Status per plan:** a submitted, approved, rejected or purchased plan should show its status (and link to the submitted recommendation), not a fresh "Buy now / Monitor". A draft with a priced recommendation says "Review and submit".
   - **Roles:** managers should see "N requests awaiting your decision" with a link to the inbox. Analysts read only. Admins have no plan access, so the block is hidden.
   - **Data:** the plan list returns no recommendation action. Either add a summary field to `GET /api/v1/purchase-plans`, or show only deadline and status here; one analysis read per plan is too many.
   - It depends on the new statuses from [Recommendations](#recommendations).
2. **Forecast horizons:** keep one picker (the proposal, which is today's behaviour), or show 7/14/30 at once as the original mock did (three reads).
3. **Admins and the forecast:** `/api/v1/forecast` returns 403 for admins, so an admin sees a forecast error on this page. Hide the forecast for admins, or say it isn't available for their role.
4. **Build the spec in React,** inside the existing components, keeping every row of `PARITY.md`.
5. **Bugs in the live code** (details in `PARITY.md`):
   - An experimental forecast shows "Target coverage: 0%" (`ForecastCard`; `nominal_coverage` is null).
   - The evidence badge and skill line never render in production: `parseForecast` drops `evidence`, `mae_skill_vs_persistence` and `synthetic`.
   - `StoredMarketPanel` sorts an unlisted price series *before* MGO.
   - Unused files to delete (check nothing imports them first): `TickerCards.jsx`, `MGOChart.jsx`, `IndicatorsTable.jsx`, `useMarketDashboard.js` (hard-coded prices), `BrentMarketPanel.jsx` + `brent-market.css`, `dashboard.css`.
6. **Remaining polish from taste** (`TASTE_REVIEW.md`):
   - Uneven card rows.
   - Captions explaining the colours and the units; put that meaning in tooltips and accessible text instead.
   - A forecast range bar that always fills its track.
   - The news mini charts are close to sparklines.

### Watch out

- **Home depends on `/api/v1/market/stored`** (`features/home/marketQuote.ts`). Keep the response shape, or update Home in the same PR.
- **Sample data:** the proposal shows 6 of the 16 sales categories, sample histories, a sample forecast, sample plans and a sample organisation name. Run `node docs/ui-revamp/market-proposal/snapshot.mjs` with the backend up to see real data.

### Done means

- The live page matches the spec at 1440, 768 and 390 px, using `--bb-*` tokens.
- Every row of `PARITY.md` still works, including all the `?state=` cases.
- Taste (`inspect.mjs --app`) shows 0 FAIL on the real page.
- The bugs above are fixed, with a test each.
- Home's price card still loads.
