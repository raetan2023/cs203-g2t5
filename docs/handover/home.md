# Handover: Home

**Updated:** 2026-10-28. Read [Start here](../handover.md#start-here) first.

**Status:** done. Role-aware Home for buyer, manager, analyst and admin (PR #40), built from `docs/ui-revamp/assets/inspo/home-page/`. Its `HANDOFF.md` has the decisions and the backend check.

**Still open:**
- Photo: one fixed image, or swap by time of day to match the greeting.
- Check the page against the real Clerk header.

**Watch out:** the Home price card reads the same `GET /api/v1/market/stored` as the market dashboard (`features/home/marketQuote.ts`, series `SGP_MGO_OBSERVED`). Changing that response changes Home too.
