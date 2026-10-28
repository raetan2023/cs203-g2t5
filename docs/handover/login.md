# Handover: Login

**Updated:** 2026-10-28. Read [Start here](../handover.md#start-here) first.

**Status:** done. Hybrid reactive ship (PR #37): a dusk scene whose ship reacts to the form, with Clerk's real form in a cream card. Code: `features/auth/ReactiveShip.tsx`, `useAuthFormSignals.ts`, `AuthLayout.tsx`. Screenshots: `docs/ui-revamp/login-ship/`.

**Optional follow-ups:**
- The "sail" after a *successful* sign-in doesn't play, because Clerk redirects immediately.
- Impeccable flags Geist as an overused font. Geist is the owner's choice and stays on the auth pages only.

## Design inspiration

- **Revamp mockup:** [`docs/ui-revamp/assets/inspo/sign-in-page/`](../ui-revamp/assets/inspo/sign-in-page/)
  - `Login — hybrid, reactive ship-html/SignInHybrid.dc.html`: the design that was built.
  - `sign-in-inspo.html` and `instr.txt`: the earlier night-ship scene and its animation brief.
- **Brief:** [`CREATIVE_BRIEF.md`](../ui-revamp/CREATIVE_BRIEF.md) §3.1 "Sign-up / sign-in": what was built, the scene options, motion rules.
- **Original mockups:** [`docs/ui-mockups/`](../ui-mockups/) `login-screen.png`, `signup-screen.png`, `forgot-password.png`.
- **Screenshots before the revamp:** `docs/ui-revamp/before/login-*.png`, `signup-*.png`; the wireframe ship it replaced is in `docs/ui-revamp/reference/wireframe-login-*.png`.
- **What's built now:** [`docs/ui-revamp/login-ship/`](../ui-revamp/login-ship/) (typing, sign-up, error, keyboard, 1024 and 1440 px) and [`docs/ui-revamp/login-port/`](../ui-revamp/login-port/) (Clerk's form in the card).
- **Patterns to reuse:**
  - the scene and its form reactions: `features/auth/ReactiveShip.tsx`, `useAuthFormSignals.ts`
  - the page frame: `features/auth/AuthLayout.tsx`
  - Clerk styling: `clerkAppearance` in `frontend/src/styles/theme.ts` and the `--bb-auth-*` tokens
