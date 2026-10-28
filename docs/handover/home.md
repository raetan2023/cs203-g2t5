# Handover: Home

**Updated:** 2026-10-28. Read [Start here](../handover.md#start-here) first.

**Status:** done. Role-aware Home for buyer, manager, analyst and admin (PR #40), built from `docs/ui-revamp/assets/inspo/home-page/`. Its `HANDOFF.md` has the decisions and the backend check.

**Still open:**
- Photo: one fixed image, or swap by time of day to match the greeting.
- Check the page against the real Clerk header.

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
- **What's built now:** no screenshots are committed yet. Run the preview (see [Start here](../handover.md#test-and-preview)) and open Home.
- **Patterns to reuse:**
  - the page: `features/home/HomePage.tsx`, `home.css`
  - the price card's data: `features/home/marketQuote.ts`
  - the photo: `features/home/assets/harbour-dusk.jpg`
