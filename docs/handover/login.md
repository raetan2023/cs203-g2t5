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
3. Keep reduced motion still. Run `npm test` and check the sign-in page in the preview (see [Start here](../handover.md#test-and-preview)).

> **Prompt for your agent:** Read `docs/handover.md` (Start here) and `docs/handover/login.md`. On a branch off `feature/ui-revamp-wireframe`, make the ship in `features/auth/ReactiveShip.tsx` play its sail animation after a successful sign-in, before Clerk redirects. Don't change authentication behaviour. Respect `prefers-reduced-motion`. Run `npm test` and `npm run build` in `frontend/`.

## Design inspiration

- **Revamp mockup:** [`docs/ui-revamp/assets/inspo/sign-in-page/`](../ui-revamp/assets/inspo/sign-in-page/)
  - `Sign in — source 2, video warmed to match-html/`: the design now live.
  - `sign-in-inspo.html` and `instr.txt`: the earlier night-ship scene and its animation brief.
- **Original mockups:** [`docs/ui-mockups/`](../ui-mockups/) `login-screen.png`, `signup-screen.png`, `forgot-password.png`.
- **What's built now:** run the preview (see [Start here](../handover.md#test-and-preview)).
- **Patterns to reuse:**
  - the scene and its form reactions: `features/auth/ReactiveShip.tsx`, `useAuthFormSignals.ts`
  - the page frame: `features/auth/AuthLayout.tsx`
  - Clerk styling: `clerkAppearance` in `frontend/src/styles/theme.ts` and the `--bb-auth-*` tokens
