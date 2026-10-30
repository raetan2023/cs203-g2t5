# Handover: Market dashboard

**Updated:** 2026-10-28. Read [Start here](../handover.md#start-here) first.

**Backend update, 2026-10-29:** see [`plan-lifecycle-api.md`](../plan-lifecycle-api.md).
New lifecycle statuses and previous-plan links are implemented, with shared
migrations applied and lifecycle UI connected on `backend-plan-lifecycle`. For "Your plans", use the existing list's status and
deadline; managers can count submitted organisation plans from that list. No
per-plan analysis summary is required. Forecast role restrictions and
`/api/v1/market/stored` remain unchanged. The three bugs in item 5 below are in
frontend rendering/parsing/sorting and still need fixing during the UI work.

**Status:** the redesign is specified as a working HTML proposal. The live page (`/market-dashboard`) hasn't changed.
**Owner:** the market dashboard teammate (a different teammate from recommendations). The "handed over" items below are yours to decide and build.
**What's left:** mostly building the spec in React, plus a few backend and data items. Little design work remains.

## Where we left off

- **Live page:** `/market-dashboard` is not restyled. It was built on `main` by the earlier dashboard PRs (#19 market data, #20 Supabase endpoints, #23 controls, #24 forecast widget, #26 forecast endpoint).
- **The review (2026-10-28):** a Taste review of the live page found these problems:
  - the news figures were the largest numbers on the page
  - the forecast sat about 1,840 px down
  - 75 text blocks were under 11 px
  - gradients
  - the sales figures were hidden on a phone
- **The redesign:** Claude Design produced a mock (`assets/inspo/mkt-dashboard-page/`). We compared it, row by row, with every behaviour of the live page (`PARITY.md`), then wrote a working HTML spec that keeps all of them (`market-proposal.html`).
  - Taste reviewed the spec, and we removed what it flagged. It now gets **0 FAIL**. Impeccable's detector is clean.
  - What the spec still lacks is in `MISSING.md`.
- **Decisions made:** buyer-meaning colour, MGO first, Past/Next range labels (see [Decided](#decided-2026-10-28)).
- **Handed over to you:** the "Your plans" block, the horizon choice, the admin 403, and the build itself (see [Handed over](#handed-over-yours-to-decide-and-build)).
- **Branch:** all of this is on `feature/ui-revamp-wireframe` (merged via PR #41 on 2026-10-28). No app code was changed.

## Where your agent should continue

1. Branch from `feature/ui-revamp-wireframe` (e.g. `feature/market-dashboard-revamp`).
2. **Fix the three bugs first** (listed under [Handed over](#handed-over-yours-to-decide-and-build), item 5), each with a test. They're small, and they change what the new UI shows.
3. **Build the spec in React, one block per PR:**
   1. price strip
   2. history chart with the forecast
   3. forecast card and details
   4. sales
   5. news

   Keep `useDatabaseMarket` and `ForecastProvider` as they are, and tick off `PARITY.md` rows as you go.
4. Decide "Your plans" (item 1) with the Recommendations owner before building it; it depends on their new statuses.
5. Check at 1440, 768 and 390 px with Taste (`inspect.mjs --app`) and confirm Home's price card still loads.

> **Prompt for your agent:** Read `docs/handover.md` (Start here), `docs/handover/market-dashboard.md`, then `docs/ui-revamp/market-proposal/README.md`, `PARITY.md` and `market-proposal.html`. On a branch off `feature/ui-revamp-wireframe`, first fix the three bugs listed in the handover, with a test each. Then rebuild `/market-dashboard` to match `market-proposal.html`, one block at a time, starting with the price strip. Use `--bb-*` tokens only, keep the data hooks unchanged, and keep every row of `PARITY.md` working. Run `npm test` and `npm run build` in `frontend/`.

## What's live today

- `features/market-dashboard/MarketDashboard.jsx` renders `StoredMarketPanel.jsx` (prices, history chart, bunker sales, GDELT news) and the shared `ForecastWidget` (`features/forecast/`).
- Data comes from `GET /api/v1/market/stored`, re-read every 60 s. The forecast comes from `GET /api/v1/forecast?horizon_days=7|14|30`.
- The daily import (`.github/workflows/import-market.yml`, 07:37 SGT) is enabled and writes MGO quotes. Quotes are sparse, so the latest one is often a few days old.

## The spec

Everything is in [`docs/ui-revamp/market-proposal/`](../ui-revamp/market-proposal/). Start with its [`README.md`](../ui-revamp/market-proposal/README.md).

| File | What it is |
|---|---|
| `market-proposal.html` | The design, working, with sample data. Add `?state=loading`, `read-error`, `empty`, `missing`, `forecast-unavailable`, `forecast-error`, `no-plans`, `no-plan-access`, … to see each state. |
| `PARITY.md` | Every behaviour of the current page, and where it lives in the new design. **The rule: nothing in it may be lost.** |
| `MISSING.md` | What the proposal still lacks, page-specific |
| `TASTE_REVIEW.md` + `taste-review/` | Taste's review and screenshots. Now 0 FAIL, 2 WARN: the beige text, which is the accepted brand, and the uneven card rows. |
| `snapshot.mjs` | With the backend running, swaps the sample data for the real stored read |

## Design inspiration

- **Revamp mockup:** [`docs/ui-revamp/assets/inspo/mkt-dashboard-page/`](../ui-revamp/assets/inspo/mkt-dashboard-page/)
  - `Market overview (redesign)-html/Market.dc.html`: the Claude Design export the spec's layout comes from. Its data is hard-coded, and `PARITY.md` lists where the spec departs from it.
  - `image.png`: a third-party finance dashboard, for mood only (dark cards, large figures). None of its content applies.
- **Brief:** [`CREATIVE_BRIEF.md`](../ui-revamp/CREATIVE_BRIEF.md) §3.5 "Market dashboard": visibility, colour and news. Its green-up / red-down line is superseded (see [Decided](#decided-2026-10-28)).
- **Original mockups:** [`docs/ui-mockups/`](../ui-mockups/) `market-dashboard.png`, `market-dashboard-loading.png`, `market-dashboard-failed.png`.
- **Screenshots before the revamp:** none are committed. Open `/market-dashboard` on the running app.
- **What's built now:** the spec itself, [`market-proposal.html`](../ui-revamp/market-proposal/market-proposal.html), and its screenshots at 1440, 768 and 390 px in [`taste-review/`](../ui-revamp/market-proposal/taste-review/).
- **Patterns to reuse:**
  - data: `useDatabaseMarket` and `ForecastProvider` stay as they are
  - today's panels: `features/market-dashboard/StoredMarketPanel.jsx`, `features/forecast/ForecastWidget`
  - icons, buttons, error banner and loading state: `features/purchase-plan/components/Primitives.tsx`

## Decided (2026-10-28)

- **Colour means what's good for a buyer.** Green = the change makes fuel cheaper. Red (`#f2849e`) = dearer. Grey = no direct effect (the USD index) or no change. Always pair the colour with an arrow and a sign.
  - This supersedes the old green = up / red = down rule. CREATIVE_BRIEF §3.5 now says the same.
- **MGO comes first.** It's the chart's default series and the largest figure, and the title line states its price and the forecast range.
- **Two range controls stay, labelled by direction:** **Past 15 · 30 · 60 days** for the chart's history, and **Next 7 · 14 · 30 days** for the forecast.
  - The market forecast's horizon is **not** shared with the purchase estimate, which has its own forecast provider (`/api/v1/purchase-plans/forecast`).
  - The proposal still shows both as "N days"; apply the Past/Next labels when building.

## Handed over: yours to decide and build

1. **The "Your plans" block** (right column).
   - **Status per plan:** a submitted, approved, rejected or purchased plan should show its status (and link to the submitted recommendation), not a fresh "Buy now / Monitor". A draft with a priced recommendation says "Review and submit".
   - **Roles:** managers should see "N requests awaiting your decision" with a link to the inbox. Analysts read only. Admins have no plan access, so the block is hidden.
   - **Data:** the plan list returns no recommendation action. Either add a summary field to `GET /api/v1/purchase-plans`, or show only deadline and status here; one analysis read per plan is too many.
   - It depends on the new statuses from [Recommendations](recommendations.md).
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

## Watch out

- **Home depends on `/api/v1/market/stored`** (`features/home/marketQuote.ts`). Keep the response shape, or update Home in the same PR.
- **Sample data:** the proposal shows 6 of the 16 sales categories, sample histories, a sample forecast, sample plans and a sample organisation name. Run `node docs/ui-revamp/market-proposal/snapshot.mjs` with the backend up to see real data.

## Done means

- The live page matches the spec at 1440, 768 and 390 px, using `--bb-*` tokens.
- Every row of `PARITY.md` still works, including all the `?state=` cases.
- Taste (`inspect.mjs --app`) shows 0 FAIL on the real page.
- The bugs above are fixed, with a test each.
- Home's price card still loads.
