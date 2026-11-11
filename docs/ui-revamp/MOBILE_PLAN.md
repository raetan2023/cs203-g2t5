# Mobile web plan

Branch: `revamp/mobile` (worktree `.claude/worktrees/revamp-mobile`), based on main ec637b2.
Started 2026-11-11. Project due 2026-11-13.

Goal: every view works and feels deliberate on a phone. Order: Procurement Officer first, then Procurement Manager, then Admin.

## 1. Locked scope

### Viewports

| Use | Width | Device |
|---|---|---|
| Base (design here) | **390px** | iPhone 13/14 |
| Check | **402px** | iPhone 16 Pro |
| Upper bound | **430px** | iPhone 15/16 Pro Max class |
| Floor (must not break, no polish) | 360px | small Android |

- Portrait only. Landscape and tablet are out of scope.
- **One breakpoint for all new work: `@media (max-width: 480px)`.**
- Existing breakpoints (640/760/900/1000/1050/1180 and the others) are left as they are. Don't consolidate them.

### In scope

- Layout and touch ergonomics on every routed view, for all three roles (phases below).
- Shell: the top nav becomes a **hamburger menu** at 480px and below.
- JSX changes only for layout structure: wrappers, ordering, the menu toggle and its open/closed state.

### Out of scope

- Backend logic, API routes, data contracts.
- Hooks, contexts, services, fetches, and data-carrying props.
- New features, copy changes, new design tokens, new libraries.
- `src/prototypes/` and `src/preview/` (the preview harness may gain mobile scenarios, but no product code lives there).

## 2. Design constraint prompt

Paste this at the top of any chat or agent working on a page:

```
MOBILE PASS — HARD CONSTRAINTS
Target: 390px base, verify at 402 and 430, must not break at 360. Portrait only.
Plan: docs/ui-revamp/MOBILE_PLAN.md

1. Desktop is frozen. All new CSS lives inside @media (max-width: 480px).
   Screenshots at 1440px must be unchanged before vs after.
2. No backend, API, data-contract, hook, context or state changes.
   JSX edits are allowed only for layout structure (wrappers, order, the
   nav toggle). No new props carrying data, no new fetches.
3. Use existing --bb-* tokens only. No new colours, fonts, shadows or radii.
   Type may step down the existing scale; nothing below the 12px floor.
4. No horizontal page scroll at any target width. Wide content (charts,
   comparison groups, tables) either reflows to one column or scrolls inside
   its own container with a visible edge.
5. Touch: every tappable target is at least 44x44px, with at least 8px
   between targets. No hover-only affordances. Inputs use 16px text (stops
   iOS zoom).
6. Layout: 16px side gutters, single column, the primary action reachable
   without hunting (sticky bottom bar only for the page's one main action).
   Respect env(safe-area-inset-*) on anything fixed to an edge.
7. Keep content and its meaning: hide nothing the desktop shows unless it is
   decorative; collapse secondary detail behind an existing disclosure.
8. No new libraries. Touch only the page's own CSS file and its layout JSX.
   Only the shell work touches AppShell and the shell styles.
9. Done = screenshots at 360/390/430 for every state of the page, zero
   horizontal overflow (document scrollWidth == clientWidth), tsc + tests pass.
```

## 3. Hamburger menu spec (shell, `components/AppShell.tsx`)

At 480px and below:

- The header row has the brand (links Home) on the left. On the right are the unread-decisions badge (only when count > 0, 44px tap target, links to `/purchase-plans/notifications`) and the menu button (44x44, icon, `aria-label="Menu"`).
- The menu button has `aria-expanded` and `aria-controls` pointing at the panel.
- The panel opens full width under the header. Its contents, in order:
  1. the role's nav links (same ones and same order as desktop; the current page is marked)
  2. the unread-decisions link (if any)
  3. the organisation control
  4. Sign out (last, visually separated)
- Each row is at least 48px tall.
- It closes on: a link tap, the button again, Escape, a tap outside, or a route change.
- Focus moves to the first link on open and returns to the button on close. The page behind doesn't scroll while the panel is open.
- Motion: one short fade/slide on the existing motion tokens, none under `prefers-reduced-motion`.

Above 480px the button is hidden and the desktop header renders exactly as today.

## 4. Phases and checklist

Status: `[ ]` to do, `[~]` in progress, `[x]` done (verified at 360/390/430 + desktop unchanged).

### Phase 0: shared layer (blocks everything)

- [ ] Hamburger menu (section 3)
- [ ] Shell gutters 16px, `#app-content` padding, safe-area insets
- [ ] Global: inputs/selects/textarea 16px text at 480 and below; `.bb-button` min-height 44px
- [ ] Mobile capture script: Playwright at 360/390/402/430 plus a 1440 desktop baseline, with an overflow assertion per screen (extends `docs/ui-revamp/tools/capture-states.mjs`)
- [ ] Desktop baseline screenshots taken **before** any CSS change

### Phase 1: Procurement Officer

| # | View | Route | Main files | Watch for |
|---|---|---|---|---|
| 1.1 | Login | `/login` | `features/auth/auth.css` | 900px rule exists; video panel vs form at phone height |
| 1.2 | Home | `/home` | `features/home/home.css` | MGO card, news and alerts (real login only, not in preview) |
| 1.3 | Purchase plans | `/purchase-plans` | `features/purchase-plan/purchase-plan.css` | To do / Awaiting approval / Finished tabs, card actions, Sort toggle |
| 1.4 | Create / edit plan dialog | (dialog) | `purchase-plan.css` | full-screen sheet, 16px inputs, keyboard covering the submit button |
| 1.5 | Recommendation | `/purchase-plans/recommendation` | `features/recommendations/recommendations.css` | 40px verdict hero, read-only comparison groups, cost detail, sticky Accept and submit, confirm step |
| 1.6 | Recommendation loading | (state) | `RecommendationLoading.tsx` styles | 5-step view, slow notice |
| 1.7 | Manager decisions | `/purchase-plans/notifications` | `purchase-plan.css` | list rows, back link |
| 1.8 | Decision history | `/purchase-plans/decisions` | `features/decision-history/decision-history.css` | three hairline columns become stacked rows |
| 1.9 | Market dashboard | `/market-dashboard` | `features/market-dashboard/stored-market.css` | 4 forecast tiles, history chart (own scroll or reflow), Refresh button |
| 1.10 | Status pages | not found / restricted | `components/StatusPage.tsx` | quick check |

### Phase 2: Procurement Manager

| # | View | Notes |
|---|---|---|
| 2.1 | Home (manager) | role-specific blocks |
| 2.2 | Purchase plans (manager view) | approval list, manager loading skeleton (`manager-loading.css`) |
| 2.3 | Manager decision panel | `manager-decision.css` already has a 440px rule; check approve/reject and comment field |
| 2.4 | Recommendation (manager, read-only) | no Accept block |
| 2.5 | Market dashboard | same as 1.9, check the role differences |
| 2.6 | Decision history restricted page | status page |

### Phase 3: Admin

| # | View | Notes |
|---|---|---|
| 3.1 | Organisation administration | `/admin`, `features/admin/admin.css` (640px rule exists) |
| 3.2 | Organisation management + team reporting | `features/organisation/organisation.css` (several rules exist); tables need their own scroll |
| 3.3 | Purchase plans (admin view) | admin controls |
| 3.4 | Home (admin) | |

## 5. How to verify

1. Run the preview harness on port 5197 (`npm run dev` in the worktree, `/preview.html`) and pick each state from "Demo controls".
2. Run the mobile capture script: it takes screenshots into `docs/ui-revamp/submission/mobile/<phase>/` and fails on any horizontal overflow.
3. Compare the desktop 1440 screenshots against the Phase 0 baseline; they must match.
4. `npx tsc --noEmit` and `npm test` in `frontend/`. Run the vitest journeys alone, because they time out when a Playwright script runs alongside.
5. Finish each phase with a real-account check in Chrome DevTools device mode (iPhone 14 Pro / 15 Pro Max) and on a real phone against the deployed build, if possible.

## 6. Timeline (2 days)

| When | Work |
|---|---|
| Day 1 morning | Phase 0 (shell + hamburger + capture script) |
| Day 1 afternoon | Phase 1 (officer), PR at end of day |
| Day 2 morning | Phase 2 (manager) + Phase 3 (admin) |
| Day 2 afternoon | Real-phone pass, fixes, freeze, demo run-through |

If time runs short, Phase 3 drops to "no overflow, nothing broken" without polish.

## 7. Log

- 2026-11-11: scope locked. Viewports 390/402/430 (+360 floor), single 480px breakpoint, hamburger nav, all roles with officer first.
