# Handover: Login

**Updated:** 2026-10-28. Read [Start here](../handover.md#start-here) first.

**Status:** done. **Owner now:** nobody; follow-ups are optional.

## Where we left off

- **Built and merged:** the hybrid reactive ship (PR #37, `feature/login-reactive-ship` → wireframe, commit e01fbf2). It replaced the earlier wireframe ship.
  - A full-bleed dusk scene (moon, stars, tanker) with Clerk's real sign-in and sign-up forms in a cream card. Geist is used on these pages only.
  - The ship reacts to the form: deck lights come on as the email is typed and dim on the password field. A submit sets the ship off; an error turns it back and shakes the card.
  - Reduced motion shows a lit, still ship. The animation pauses in a hidden tab.
- **Since then:** Clerk's organisation pop-ups were restyled in the beige theme (d9dbe57).
- **Not done:**
  - The "sail" after a *successful* sign-in doesn't play, because Clerk redirects immediately.
  - Impeccable flags Geist as an overused font. Geist is the owner's choice and stays on the auth pages only.

## Where your agent should continue

Nothing is required. If someone picks up the optional "sail on success":

1. Branch from `feature/ui-revamp-wireframe`.
2. Delay Clerk's redirect just long enough for the animation, without changing auth (`ClerkAuthPage.tsx`, `useAuthFormSignals.ts`).
3. Keep reduced motion still. Run `npm test` and check the screens in `docs/ui-revamp/login-ship/` still match.

> **Prompt for your agent:** Read `docs/handover.md` (Start here) and `docs/handover/login.md`. On a branch off `feature/ui-revamp-wireframe`, make the ship in `features/auth/ReactiveShip.tsx` play its sail animation after a successful sign-in, before Clerk redirects. Don't change authentication behaviour. Respect `prefers-reduced-motion`. Run `npm test` and `npm run build` in `frontend/`.

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
