# Handover: Decision history

**Updated:** 2026-11-07. Read [Start here](../handover.md#start-here) first.

**Status:** rebuilt on `revamp/decisions` from the mock in `assets/inspo/decision-history-page/Decision history – reworked-html/`.
**Owner:** the page owner (the same person who revamped the market dashboard).
**Route:** `/purchase-plans/decisions`, officers only (managers and admins see the existing "View purchase plans" card instead).

## Where we left off

- **What the page is now.** One card per plan the officer has submitted, newest first: the action the advice gave
  (Buy now, Wait with its buy date, Monitor, Split purchase), the tonnage and deadline, three figures side by side
  (buying today, the forecast for the buy date, the expected change), the manager's decision with their name, and once a purchase is
  recorded, what was paid against buying at submission time ("Advice saved ≈ USD x"). Approved plans show a four-step
  progress rail: Submitted, Approved, Buy date, Outcome. Rejected cards quote the manager's comment. Withdrawn plans
  appear under All with a grey pill. Drafts never appear: they belong on Purchase plans.
- **Removed on 2026-11-07 at the owner's request:** the four summary tiles, the recommendation's sentence and the
  "Sent to every manager" line.
- **Filter and search:** status tabs (All, Pending approval, Approved, Rejected, Completed; arrow keys move between them)
  and a search box that matches the tonnage or the deadline in any form the page prints them.
- **Data:** `planService.list()` then `readSubmission(planId)` for each submitted plan. The submission read returns the
  frozen recommendation snapshot, the approval decision, the purchase record and the backend's purchase comparison.
  The saving reads the backend's quantity-adjusted comparison first and only falls back to the snapshot's reference total.
  One request per plan; a bulk endpoint can come later if lists grow long.
- **Decided with the owner on 2026-11-07:** the old accept/reject/ignore list (`recommendation_decisions`) is gone from
  this page. Those records are still written on the recommendation page and still served by
  `GET /api/v1/purchase-plans/recommendation-decisions`; nothing reads them in the UI now. No PDF link yet. No reminder line.
- **Files:** `frontend/src/features/decision-history/` (`DecisionHistory.tsx`, `model.ts`, `fixtures.ts`,
  `decision-history.css`, tests). The page owns its `dh-*` classes and imports nothing from `recommendations.css`,
  so it can ship alongside the recommendations revamp without conflicts. It reuses `recommendations/format.ts` for numbers and dates.
- **Checks:** `npm test` (11 page and model tests), `npm run test:decision-history-layout` (Playwright: 320–1920 px,
  no overflow, 44 px controls, filter and search, empty, error and loading states; set `LAYOUT_SCREENSHOT_DIR` for
  screenshots). The preview harness's mock plan service stores no submission snapshot, so the layout script mounts the
  page with its own sample data from `scripts/decision-history-preview/`.
- **Not yet checked against the real backend** with a signed-in officer who has submitted, approved and purchased plans.

## Where your agent should continue

Branch `revamp/decisions`, worktree `.claude/worktrees/revamp-decisions`.

1. Sign in as an officer with a few submitted plans and read the page against real data. Confirm the buy-today total,
   the forecast range and the saving match what the recommendation page and the purchase record show for the same plan.
2. **PDF (deferred).** The report builder in `recommendations/recommendationReport.ts` needs the live timing-comparison
   columns, which a saved snapshot does not carry. Either extend the builder to work from a snapshot, or add the link
   once the recommendation page's saved view offers its own download. Do this after the recommendations revamp merges.
3. Optional: a "market price on the buy date" line for completed plans. `/api/v1/market/dashboard` returns the derived
   MGO series up to the scenario date; look up the buy date client side and show it only when the date is in range.
4. Optional: a bulk `submissions` endpoint if officers accumulate many plans.

Paste into your agent:

> Read `docs/handover/decision-history.md`. Branch `revamp/decisions`. The decision history page is built; test it
> against the real backend as an officer, then take item 2 (PDF from the saved snapshot) only after the recommendations
> revamp has merged. Keep every style in `decision-history.css` with the `dh-` prefix and never edit `recommendations.css`.

## Design inspiration

- `docs/ui-revamp/assets/inspo/decision-history-page/Decision history – reworked-html/Decisions.dc.html` (the mock the
  page was built from; untracked in the main checkout on purpose).
- Departures from the mock: no PDF link, no reminder line, totals over a million shorten to "1.2m" like the
  recommendation page, no summary tiles, no "What it said" sentence or "Sent to every manager" line, withdrawn plans
  are shown, and completed cards compare the price paid with buying at submission rather than with the market price on
  the buy date.
