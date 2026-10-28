# What the market proposal and the buyer flow are missing

Written 2026-10-28 against `af93c3d` (`feature/ui-revamp-wireframe`) and the proposal in this folder. Sources: the
code, `docs/PRD.md`, `docs/plan-submission.md`, `docs/organisation-role-access.md`, `frontend/PRODUCT.md`.

Each item is tagged with where it would be fixed:
- **[design]** this proposal, presentation only;
- **[frontend]** frontend behaviour, owned by `main`;
- **[backend]** API or database work, owned by `main`;
- **[decision]** needs the team, the market dashboard teammate, or Nelson for approvals.

## 1. Two answers first

### History window (15/30/60) vs forecast horizon (7/14/30)

These are two different controls and both should stay.

| Control | What it sets | Where it matters |
|---|---|---|
| **15 / 30 / 60 days** | How far **back** the chart looks, in calendar days ending at the selected series' latest observation | Display only. It changes nothing else. |
| **7 / 14 / 30 days** | How far **ahead** the market forecast targets (`/api/v1/forecast?horizon_days=`) | Changes the forecast, its range, and the title-line sentence |

Swapping 15/30/60 for 7/14/30 would make the history window as long as the horizon. Fifteen days of history behind a
30-day forecast reads as a guess with no context, and 7 days of history is about 5 trading points. The real problem in
the proposal is that both controls say "30 days" a few hundred pixels apart. **[design]** Label them by direction:
**"Past 15 · 30 · 60 days"** on the chart and **"Next 7 · 14 · 30 days"** on the forecast card. Optionally, widen
the history window automatically when the forecast is longer (a 30-day forecast opens on 60 days of history).

The market page's horizon is **not shared** with the purchase estimate. `App.tsx` wraps the estimate page in its own
`ForecastProvider`, which reads `/api/v1/purchase-plans/forecast` and keeps its own 7/14/30 choice. A plan's
submitted horizon (`RecommendationSelection.horizon_days`) is chosen on the estimate page, not here.
(PARITY.md was corrected on this point.)

### Where a buyer submits a purchase

A buyer doesn't submit from the market page, and they shouldn't. Submission already exists on
`/purchase-plans/recommendation`:

1. The buyer creates a draft plan on `/purchase-plans`.
2. They open its estimate and pick an eligible date (7/14/30-day forecast, or the reference price for "buy now").
3. **Submit for approval**, then **Confirm submission**. The plan and the selected recommendation are frozen
   (`approval_fingerprint`), and every manager in the organisation is notified.
4. A manager finds it in the **Approval inbox** on `/purchase-plans` and opens the saved recommendation.
5. **Approve** (comment optional) or **Reject** (reason required). The first decision is final.

The market proposal's job is to get the buyer there in one click. Its "Your plans" rows link to each plan's estimate,
but the rows don't yet reflect where each plan is in this flow (gap M1 below).

What is really missing is everything **after** step 5 (section 3).

## 2. Missing from the market proposal

| # | Gap | Tag | Detail |
|---|---|---|---|
| M1 | **Plan status in "Your plans"** | design | Rows show a recommendation action ("Buy now", "Monitor") for every plan. A submitted, approved or rejected plan needs its status instead ("Awaiting approval · sent 27 Oct", "Approved by A. Tan", "Rejected: see reason"), and its link should open the submitted recommendation, not a fresh estimate. A draft with a priced recommendation should say **"Review and submit"**. |
| M2 | **Role variants** | design | Only the buyer view is drawn. A **manager** can't create plans but decides requests: show "3 requests awaiting your decision" with a link to the inbox. An **analyst** reads all organisation plans and has no actions. An **admin** has no plan access, so the card is hidden (done). |
| M3 | **Per-plan action needs N reads** | backend, decision | The plan list returns no recommendation action. Showing "Buy now / Monitor" per row means one analysis request per plan. Either add a summary field to `GET /purchase-plans` or show only deadline and status on this page. |
| M4 | **Two "30 days" controls** | design | See section 1: label them "Past" and "Next". |
| M5 | **Market forecast vs plan estimate** | design | The two come from different endpoints and can differ for the same horizon. The forecast card should say it is the market forecast, and point to "your plan's estimate" for plan costs. |
| M6 | **Organisation switcher and date** | frontend | Both are static in the proposal. The real switcher is `organisationControl` (Clerk). The date chip should show the backend's Singapore date (`/api/v1/config`), not the browser's. |
| M7 | **Navigation drawer** | design | The menu button opens nothing. The drawer exists in `AppShell` (Home, Purchase plans, Market dashboard, Sign out, and a disabled market link when not connected). Draw it in the new style. |
| M8 | **Real data** | — | Six of 16 sales categories, sample histories, a sample forecast. Run `snapshot.mjs` with the backend up. |
| M9 | **Taste round-1 fixes** | design | ~~Orange "pressure" hue (palette FAIL)~~ fixed 2026-10-28, two ragged rows, the explanatory captions, the always-full range bar, near-sparkline news charts. See TASTE_REVIEW.md. |
| M10 | **States not drawn yet** | design | Refresh failing while data is shown on a phone. A series with exactly one observation. Very long fuel or series names. A forecast whose target falls beyond a plan's deadline. Overdue plans (logic exists, not reviewed visually). |

## 3. Everything after the manager decides

Moved to [`docs/handover.md` → Recommendations](../../handover.md#recommendations), which the recommendations
teammate owns: recording the purchase, rejected plans, withdrawal, buyer notifications, expiry, split purchases and
the buyer's accept/reject/ignore (PRD FR-08). Analyst and admin consoles and change-detection alerts (PRD FR-10)
remain later work.

## 4. Status (2026-10-28)

- **Decided:** colour = buyer meaning (green cheaper, red `#f2849e` dearer, grey no direct effect); MGO first;
  two range controls labelled Past and Next (M4). The palette FAIL in M9 is fixed.
- **Handed over** in [`docs/handover.md` → Market dashboard](../../handover.md#market-dashboard): the "Your plans"
  block (M1, M2, M3), the horizon question, the admin forecast 403, building the spec in React, and the bugs from
  PARITY.md.
- **Still open in the spec:** M5–M8, M10, and the rest of M9 (uneven rows, captions, range bar, news charts).
