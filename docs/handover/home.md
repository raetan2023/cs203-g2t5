# Handover: Home

**Updated:** 2026-10-28. Read [Start here](../handover.md#start-here) first.

**Status:** done. **Owner now:** nobody; two small items are open.

## Where we left off

- **Built and merged:** role-aware Home for buyer, manager, analyst and admin (PR #40, `feature/home-page` → wireframe, merge 9e20c5b). It was built from the Claude Design mocks in `docs/ui-revamp/assets/inspo/home-page/`. That folder's `HANDOFF.md` records every decision and the backend check.
  - **Layout:** a full-bleed harbour photo, the greeting by time of day with the user's full name, today's Singapore date, and one button per role.
  - **Price card:** shows the latest Singapore MGO price, marked "est." with its own quote date. It reads `/api/v1/market/stored`, so admins can load it too.
- **Already handled:**
  - the price card's loading, "No price stored yet" and "Price unavailable right now" states, with tests
  - the transparent header over the photo, using the app's own `AppShell` header
  - the phone layout (`@media (max-width: 640px)` in `home.css`)
- **Backend:** no new endpoints were needed. The daily market import is on and writing MGO quotes. Quotes are sparse, so the card often shows a price from a few days back.
- **Still open:**
  - Photo: keep one image (`harbour-dusk.jpg`), or swap by time of day to match the greeting. Candidates are in `home-page-pics/`; the `afternoon/` folder holds the daylight ones.
  - Check the page against the real Clerk header with a signed-in user. `/preview.html` runs without Clerk, so it can't show this.

## Where your agent should continue

1. Branch from `feature/ui-revamp-wireframe`.
2. Get the photo decision from the team. If it's "swap", pick one photo per time of day and key it off the same hour `greetingFor()` uses in `HomePage.tsx`.
3. Sign in for real (`npm run dev` with Clerk keys) for each role and compare against the mocks. Fix only what differs.

> **Prompt for your agent:** Read `docs/handover.md` (Start here), `docs/handover/home.md` and `docs/ui-revamp/assets/inspo/home-page/HANDOFF.md`. On a branch off `feature/ui-revamp-wireframe`, [swap the Home hero photo by time of day using these photos: …] / [check Home against the real Clerk header for all four roles and fix differences from the mocks]. Keep the price card's states and tests. Run `npm test` and `npm run build` in `frontend/`.

**Watch out:** the Home price card reads the same `GET /api/v1/market/stored` as the market dashboard (`features/home/marketQuote.ts`, series `SGP_MGO_OBSERVED`). Changing that response changes Home too.

## Design inspiration

- **Revamp mockup:** [`docs/ui-revamp/assets/inspo/home-page/`](../ui-revamp/assets/inspo/home-page/), one Claude Design export per role
  - `Home — buyer-html/HomeBuyer.dc.html`
  - `Home — manager-html/HomeManager.dc.html`
  - `Home — analyst-html/HomeAnalyst.dc.html`
  - `Home — admin-html/HomeAdmin.dc.html`
  - `HANDOFF.md`: the decisions and the backend check. `home-page-pics/`: the candidate photos for the time-of-day question.
- **Brief:** [`CREATIVE_BRIEF.md`](../ui-revamp/CREATIVE_BRIEF.md) §3.2 "Home". Its ship-map idea came before the role-aware design; where they differ, `HANDOFF.md` wins.
- **Original mockups:** [`docs/ui-mockups/`](../ui-mockups/) `home-welcome.png`, `home-loading.png`, `Shared Navigation.png`.
- **Screenshots before the revamp:** `docs/ui-revamp/before/home-*.png` (ready and loading, desktop and mobile).
- **What's built now:** no screenshots of the role-aware Home are committed yet. Run the preview (see [Start here](../handover.md#test-and-preview)), then Demo controls → "Home - buyer / manager / analyst / admin / price unavailable". `docs/ui-revamp/phase2/home-*.png` shows the earlier plain Home after the beige theme pass.
- **Patterns to reuse:**
  - the page: `features/home/HomePage.tsx`, `home.css`
  - the price card's data: `features/home/marketQuote.ts`
  - the photo: `features/home/assets/harbour-dusk.jpg`
