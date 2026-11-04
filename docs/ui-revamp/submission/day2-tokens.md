# Day 2: one token set (impeccable audit + harden), 2026-11-04

Scope from the 5-day plan: audit and harden the app shell, home and purchase plans to produce **one** token set, then
migrate the market dashboard stylesheets onto it. Branch `revamp/day2-tokens`. Screens: `day2-screens/`.

## Audit health score (before → after)

| # | Dimension | Before | After | Key finding |
|---|-----------|--------|-------|-------------|
| 1 | Accessibility | 3 | 3 | Market page text went down to 8px with 1.2px tracking; now a 12px floor everywhere. Focus rings, `aria-current`, alerts and labels were already in place. |
| 2 | Performance | 3 | 3 | Nothing animates layout; the only loop (refresh spinner) stops under reduced motion. No change. |
| 3 | Theming | 2 | 4 | Shell, home and purchase plans had no literal colours but 13 distinct font sizes and 6 radii; the market page carried its own navy/teal palette (103 literal colours) plus a dead stylesheet with 51 more. |
| 4 | Responsive | 3 | 3 | Zero horizontal overflow at 1440 and 390 on all three pages. The market history controls now wrap on phones instead of running past the panel. |
| 5 | Implementation integrity | 2 | 3 | Detector: one side-tab accent (fixed). Remaining: eyebrow labels on the market page (see P2). |
| | **Total** | **13/20** | **16/20** | Acceptable → Good |

## Implementation integrity verdict

**Pass, with one carry-over.** After this pass every stylesheet that ships on the shell, home, purchase plans and market
dashboard reads its colours, sizes and radii from `src/styles/tokens.css`. The market page no longer looks like a different
product. The market page's eyebrow labels ("MARKET INTELLIGENCE", "THE BIGGER PICTURE", "PHYSICAL MARKET",
"NEWS CONTEXT") are a craft-floor ban but live in a teammate's JSX, so they are flagged for Day 3 rather than edited here.

## What changed

**Token set** (`frontend/src/styles/tokens.css`, mirrored in `theme.ts`, documented in `frontend/DESIGN.md` and `DESIGN_SYSTEM.md`):

- Type scale `--bb-text-xs` … `--bb-text-7xl` (12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40px). 12px is the floor.
- `--bb-radius-pill` for badges and bars. Cards stay 10px, controls 5px.
- Price direction, provisional: `--bb-price-up` #f2849e (dearer), `--bb-price-down` #8fd3a4 (cheaper), `--bb-price-flat`.
  All three exceed 7:1 on canvas, surface and input. Always paired with an arrow, sign or word.
- Chart aliases `--bb-chart-grid/axis/series-1/cursor` and a `chart` export in `theme.ts` for Recharts SVG props.

**Migrated** (literal font sizes and radii → tokens; colours already tokenised): `app/app.css`, `features/home/home.css`,
`features/purchase-plan/purchase-plan.css`. The "previous plan" callout lost its 2px coloured left bar (detector finding)
and is now a quietly bordered note.

**Rewritten onto tokens**: `market-dashboard/stored-market.css` (97 literal colours → 0; 23 distinct sizes → scale;
gradients, teal top-bars and `!important` overrides removed; the lead series is marked by border weight instead of a
second palette; stale-data notices use the shared warning tokens), `market-dashboard/brent-market.css` (6 → 0).
`StoredMarketPanel.jsx` chart strokes read from `theme.ts` instead of hard-coded teal.

**Deleted**: `market-dashboard/dashboard.css`. It was imported nowhere. `MGOChart.jsx`, `TickerCards.jsx` and
`IndicatorsTable.jsx` are likewise unreferenced and are left for Day 5's `/simplify`.

## Findings

- **[P1, fixed] Market page text below the readable floor.** `stored-market.css` set 8–11px on 42 rules (kickers, footers,
  table headers, tooltips). WCAG does not fix a minimum, but 8px at 1.2px tracking fails any practical readability bar.
  Now 12px minimum. Verified: smallest rendered text on each page at both widths is 12px.
- **[P1, fixed] Two colour systems in one app.** Market panels used navy surfaces (#101f30…), teal accents (#39d4bd) and
  slate borders while every other page used charcoal and beige. Now one palette; the only non-neutral colours are the
  shared warning and price-direction tokens.
- **[P1, fixed] Price direction read as "green = up".** `.sm-up` was green and `.sm-down` red, the opposite of a buyer's
  interest. Now up is red (dearer), down is green (cheaper), matching the Day 4 brief; arrows carry the meaning.
- **[P2, fixed] Side-tab accent** on `.pp-previous-plan` (detector `side-tab`). Replaced with a 1px bordered note.
- **[P2, fixed] History controls overflowed the panel at 390px** once the range buttons reached 12px. Controls now wrap.
- **[P2, open] Eyebrow labels on the market page.** Four uppercase kicker labels above headings (craft-floor ban). Teammate's
  JSX; remove in the Day 3 market pass if time allows. Suggested command: `/impeccable distill` on `StoredMarketPanel.jsx`.
- **[P2, open] `forecast.css` (40 literal colours) and `organisation.css` (53)** still carry their own palettes. Forecast is
  Day 4's dataviz pass; organisation is not on the plan and is the next candidate if Day 3 runs short of pages.
- **[P3, open] `scripts/test-plan-layout.mjs` fails on `main` already** ("cards use available width" at 1920px with a
  single plan). The auto-fill grid deliberately keeps a lone plan at card width, so the assertion is stale, not the layout.
  Verified by running the script against the pre-change stylesheet.

## Verification

| Check | Result |
|-------|--------|
| `vitest run` (32 files) | 286 passed; 1 timeout in `recommendations.test.tsx` under full-suite load, passes alone (3/3), untouched by this change |
| `tsc --noEmit` | clean |
| `impeccable detect` on changed files | 0 findings (was 1) |
| `test:recommendation-layout` | all widths pass |
| `test:layout` | fails identically before and after (P3 above) |
| Renders at 1440 and 390 (home, plans, market; synthetic data, no Clerk or backend) | 0px horizontal overflow, 12px smallest text, screenshots in `day2-screens/` |

Not verified: Windows high-contrast mode, screen-reader pass, the real backend-fed market page (feeds are stale; see the plan's risk section).

## Recommended next

1. **Day 3** `design-taste-frontend` page passes as planned (home, purchase plans, recommendations). The market page's eyebrows go if it gets a turn.
2. **Day 4** `dataviz`: confirm or revise `--bb-price-*` values and give `forecast.css` the same treatment.
3. **Day 5** `/simplify`: drop the three unreferenced market components and fix or delete the stale layout assertion.
