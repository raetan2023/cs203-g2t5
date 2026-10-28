# Bunker Buddy — UI revamp plan (wireframe theme)

Status: **active prototype plan; checkpoint commits stay on feature/ui-revamp-wireframe.** Owner: UI revamp lead (sole owner).




### Latest integration status — 2026-10-26

- Fetched remote main (`d77a61c`, including forecast endpoint/widget and proxy analysis changes),
  merged it into local main, and pushed main through `b083a4f`.
- Backend current-date implementation is `8668945`; running-guide edit is `b083a4f`.
- Merged main into this prototype branch as `9de0ea6`, with no conflicts. Backend files here now
  exactly match main; Singapore-current-date behavior is restored alongside frontend rollover/draft handling.
- Prior rollback notes below are historical and superseded. Phase 3A implementation is integrated again;
  live Clerk/database validation remains pending. Home remains deferred for possible Impeccable/Claude work.
- Phase 6 inventory must now include `features/forecast/*` and the new widget rendered by MarketDashboard.
  Imported widget styling has not yet been adapted to this branch's beige design system.
- Verification: 57 backend tests passed on integrated main; prototype backend is identical. After merging, 132 prototype frontend tests and the production build passed (existing bundle-size warning).
- Main was pushed; prototype merge is local. No prototype UI was merged into main.

### Historical backend rollback — 2026-10-26 (superseded by main integration)

- Owner requested reverting the backend date-handling portion of `7d7a752` before doing backend work
  separately on main. Restored `backend/` exactly to `7d7a752^`: controllers, configuration, README,
  analysis copy and existing tests; removed OperationalDate and its two new test files.
- Frontend Phase 3A changes remain: refresh scheduling, draft preservation, labels and tests.
  They consume the date supplied by `/api/v1/config`; they do not force the backend to use today.
- **Phase 3A is now partial, not complete end-to-end.** Until main's backend work is merged here,
  the configured historical scenario date is active again (default 2025-10-24). The UI's “Current date”
  label currently refers to that configured planning date, not necessarily the real calendar date.
- The earlier completion section below is a historical record, superseded by this rollback.
  Keep the same API key `scenario_as_of_date` when implementing backend work on main, or adapt the frontend
  explicitly when integrating. Re-test deadlines, remaining days and analysis context after merging main.
- Rollback verification: backend tree exactly matches `7d7a752^`; `mvnw clean test` passed 52 tests.
- Home remains deferred for possible Claude/Impeccable work. Prototype branch only; no merge into main.
### Phase 3A original completion checkpoint — 2026-10-26 (backend subsequently reverted)

- Implemented the approved Singapore-current-date behavior. `OperationalDate` reads a runtime clock;
  config and purchase-plan endpoints use it per request. Historical `MGO_SCENARIO_DATE` no longer freezes
  operational dates. The API key `scenario_as_of_date` remains for compatibility.
- Past plans remain readable as overdue; create/edit require a deadline of today or later. Slow analysis
  crossing midnight is rejected as stale. Market source dates and deterministic mock previews are intact.
- Frontend refreshes the backend date at Singapore midnight and when returning to a tab after rollover;
  failures show a notice and retry. Unsaved idle plan drafts survive list refresh and retry; saving is
  blocked until fresh plan context is available. Existing in-flight-write reconciliation is retained.
- Labels now say Current date / current planning date. PRODUCT, PRD override and backend README updated.
- Verification: **121 frontend tests passed; 57 backend tests passed; TypeScript/Vite build passed**
  (existing bundle-size warning). New tests cover Singapore midnight/year boundary, overdue reads,
  deadline validation, stale analysis, tab resume/retry, and draft preservation. No database writes in tests.
- Review: attempted independent reviewer was unavailable due to its usage limit. Author reviewed the diff,
  found/fixed draft loss with a failing-then-passing regression test, and re-ran the full frontend suite.
- Live Clerk/database end-to-end check remains unverified: port 8000 was unavailable when checked.
  Phase 2 image baselines remain unchanged; Phase 3A text-label differences are expected.
- **Home redesign is explicitly deferred for possible Impeccable + Claude work by the owner.** Do not
  implement a guided-start/workspace/market-first design without a chosen direction. Auth styling is still
  pending; Phase 4 card grid and Phase 6 trend colours are also not started.
- Commit on this prototype branch only; do not push or merge into main. Unrelated changes in
  historical-market-dashboard/backend/target and local graphify/Impeccable files are excluded.
### Prototype checkpoint update (2026-10-26; supersedes earlier integration notes)

**Phase 3 decisions confirmed:** use today's Singapore calendar date for operational plan dates;
retain overdue plans and require today-or-later deadlines when creating/editing. Keep real market
observation dates. Home direction is deferred: owner may use Impeccable with Claude; do not build
a Home redesign or choose a direction on their behalf. Auth styling remains a separate later task.

**Phase 3A implementation plan (approved date behavior):**
1. Add an injectable backend `OperationalDate` backed by a runtime `Clock` in Asia/Singapore.
   Config and plan controllers use it per request (not a date captured at startup). Keep the existing
   `scenario_as_of_date` wire key for compatibility. Validate/write against one captured request date;
   re-check the current date after slow analysis to reject results that cross midnight.
2. Test Singapore midnight, due-today and overdue reads, create/update validation, unchanged stored
   observation dates, and analysis conflicts. Pin old fixture suites to an injected fixed date rather
   than keeping production on historical configuration.
3. Refresh frontend backend-config date at Singapore midnight and after tab focus/visibility resumes.
   Keep the mounted app/drafts during a successful refresh; retry failures and show a useful notice.
   Update visible operational labels to “Current date” (neutral enough for fixed preview fixtures).
4. Keep deterministic historical preview fixtures and screenshots for regression tooling. They are
   explicitly mock data, not production's clock. Update PRODUCT/PRD/backend documentation, run tests
   and build, review the diff, and commit on the prototype branch without pushing/merging.

Market-data finding: the active `/api/v1/market/stored` endpoint queries latest imported observations;
`fetchedAt` is check time, not observation time. Monthly series are not daily. Local endpoint port 8000
was unavailable during inspection, so actual database freshness is unverified; do not claim it is today.

- Owner accepts the current beige colour scheme and authorizes continuation from Phase 2.
- This branch is for prototyping: commit checkpoints here, **do not merge into main**. No PR or push requested.
- Verified the prior screenshots were separate captures, not re-baselines. Preserved all 34 original
  screenshots in `docs/ui-revamp/before/`, then regenerated all 17 desktop baselines with Playwright.
  Mobile baselines remain historical. Desktop baseline update: 17/17 passed.
- Frontend checks before checkpoint: 115/115 tests; production build passed (existing chunk-size warning).
- Commit `744aa71` includes the Phase 1/2 sources, design documents, browser-check tooling and screenshot evidence;
  unrelated graphify/Impeccable local artifacts are excluded.
- Phase 3 discovery: `ConfigController` and `PurchasePlanController` capture a fixed date from
  `mgo.scenario-date`; changing the header alone cannot implement today. Existing plan summaries already
  support negative days as overdue. Market data retains its own observation dates.
- Owner answered: Singapore date/overdue policy approved; Home design deferred for possible Impeccable/Claude work.
## Current continuation and scope update — 2026-10-26

The owner did not hand off to another agent and is continuing this session. Read this section
before older notes below. The previously prepared handoff remains useful as the implementation record.

**New requests recorded, not yet implemented:**

| Owner request | Phase | Type / status |
| --- | --- | --- |
| Replace the historical scenario date with today's date | Phase 3A, before Home and downstream plan work | Functional change: date source, validation, remaining days and backend consistency need review |
| Brainstorm a more inviting landing page after signup | Phase 3B (Auth and Home) | Product/content/layout discussion; use Impeccable/Claude if available, then review concrete options with owner |
| Purchase plans fill horizontal space first, then continue vertically | Phase 4 | Row-first card grid; preserve plan order, actions and CRUD behavior |
| Green/red upward/downward trends for every dashboard indicator, like a trading platform | Phase 6, with palette alignment in Phase 5 | Direction presentation plus verified comparison data; neutral flat/unavailable states |

These requests expand the original visual-only scope in the specific areas described below.
They do not authorize unrelated business-logic changes. Alert the owner when design or product
decisions arise. This update records the requirements; it does not claim the features are shipped.

- Phase 1: reconciled the checklist with source; tokens/base styles, JS mirror and drift test exist.
- Phase 2: implemented neutral shell/header/sidebar, circular brand, shared buttons, error/loading
  states, skip link and page-container tokens. Existing application logic and tests are unchanged.
- Latest owner request: replace the white look with **light beige**. Updated shared tokens,
  their JS mirror, this plan, DESIGN_SYSTEM.md and frontend/DESIGN.md. Beige now applies to
  migrated shared UI; later-phase hard-coded feature colours and isolated prototypes are not migrated.
- Current palette: primary text `#f0e6d2`, primary action/brand `#e8dcc4`, hover/focus `#f4e8d1`,
  secondary text `#b5ac9b`, supporting text `#c5bba7`, labels `#e4d8c0`, placeholders `#b6ac99`.
  Neutral overlays use beige: hover `#e8dcc412`, subtle border `#e8dcc426`, control border `#e8dcc466`.
- Border implementation decision: the earlier 35% white approval was superseded by the beige request.
  35% beige gives only about 2.6–2.7:1; use 40% beige for about 3.1:1 against existing dark surfaces.
- Keep the existing menu-button/modal sidebar. No desktop rail. Desktop is the acceptance target;
  no separate mobile redesign is required. Alert the owner when new design choices are needed.
- No commit, PR, merge or visual-baseline update has been performed. Preserve existing uncommitted work,
  including unrelated graphify/Impeccable artifacts. Do not treat unchecked integration tasks as missing code.
- Original before-images remain in `docs/ui-revamp/tools/baselines/`. Current desktop captures and check
  results live in `docs/ui-revamp/phase2/`; run `node phase2-check.mjs` from docs/ui-revamp/tools to refresh.
- Next: continue from the beige Phase 2 implementation, address Phase 3A's date semantics and brainstorm
  Phase 3B's post-signup Home before implementation. Visual acceptance and integration of Phases 1/2
  remain outstanding; no transfer to another agent occurred. Phase 3 is not started. Real Clerk/dashboard
  browser coverage remains in Phases 3/6. Impeccable commands were not run during this session.
- Final beige verification: `npm test` 115/115; `npm run build` passed (existing bundle-size warning); `node phase2-check.mjs` passed seven desktop states plus sidebar keyboard/axe checks. Desktop screenshots refreshed. No baseline updates or commits.

Drafted 2026-10-26 on `feature/ui-revamp-wireframe`. Read together with
`DESIGN_SYSTEM.md` (the visual spec), `frontend/AGENTS.md` and
`docs/frontend-design-guidelines.md` (process rules). If this plan and the
spec disagree on a value, the spec wins; update this plan.

**Revision 2 (2026-10-26):** Impeccable plugin v4.7.1 installed. Added: §2 rules 9–10,
Phase 0 setup, an `Impeccable:` line per phase, a rewritten §7 loop, and §10
(tooling and token budget). `frontend/PRODUCT.md` already exists (generated by
`/impeccable init`). Restart Claude Code so the plugin's skill loads: a session
started before the install does not see `/impeccable`.

**Revision 3 (2026-10-26):** removed the banned-commands rule; hook mode is now manual
(`detect` run by you); §7 rewritten as a you / lead session / subagent workflow; new §10.5
Playwright guide so you review a few flagged screens instead of every screenshot.

---


**Owner decisions and execution update (2026-10-26):**
- Desktop is the delivery and acceptance target. No separate mobile UI or mobile review is required.
  Preserve existing responsive rules where practical. Mobile examples/tests below are optional historical
  tooling references, not delivery gates; use `--project=desktop` for acceptance checks.
- Keep the current menu-button/modal sidebar. No persistent desktop rail.
- Control borders: contrast-preserving 40% beige (`#e8dcc466`).
- Agent runs routine build/test/browser checks and maintains the checklist; owner is alerted for design choices.
- Continue the existing uncommitted feature checkout for this handoff. Per-phase PRs remain the intended
  integration workflow; no commit, PR or merge is implied by a checked implementation item.
- Executable Playwright files already exist in `docs/ui-revamp/tools/`; the setup snippets below are historical
  examples. Do not reinstall or recreate the suite. Preserve before-images until visual approval.
## 1. Goal and decisions

Bring every production screen onto the dark-and-beige "wireframe" theme that
the team approved from the login preview (`frontend/dist-wireframe/wireframe.html`,
source in `frontend/src/prototypes/wireframe/`).

| Decision | Outcome |
| --- | --- |
| Scope | **Restyle + layout tweaks, plus explicitly requested functional work.** Phase 3A changes the active date to today; Phase 3B explores the post-signup Home experience; Phase 6 adds verified indicator-direction presentation. Other logic, data, API calls, routes and validation stay unchanged unless required by those scoped tasks and documented. |
| Theme | **Dark only.** No light mode, no toggle. |
| Colour | **Dark-and-beige by default, semantic exceptions only.** Recommendations carry rise/fall price colour; dashboard indicators explicitly use green for upward and red for downward movement. Direction is not buyer benefit. Exact tokens and contrast are reviewed in Phases 5–6. |
| Delivery | **2026-10-27: owner decided to merge this branch into `main` via PR** so a teammate can take over the recommendations page logic. Further revamp work continues on this branch and syncs with `main` per `SYNC_WITH_MAIN.md`. (Earlier rule "prototype checkpoints only, do not merge into main" is superseded.) |
| Reference | The wireframe login is the visual source of truth; `docs/ui-mockups/*.png` are the **state checklist** (which loading/empty/error/saving states each screen must cover), not the visual target. |

## 2. Non-negotiable guardrails

**Scoped exception for the 2026-10-26 requests:** Rules 1–2 below still govern aesthetic work.
Phase 3A may change date/scenario services, hooks, validation, contracts and tests where necessary
to implement today's date consistently. Phase 6 may add a narrowly scoped direction calculation or
comparison-data contract when the existing API does not supply one. First identify affected frontend
and backend paths and record the intended semantics; add/update behavior tests for the changed
requirements rather than preserving obsolete historical-date expectations or weakening tests to pass.
Phase 3B may change Home copy/content and onboarding presentation after the requested brainstorm;
it does not automatically authorize new authentication routes or unrelated services.

1. No changes to: `apiService.ts`, `mockService.ts`, `validation.ts`, `dates.ts`,
   `use*.js`/`use*.ts` hooks, `router.tsx`, `App.tsx` routing/session logic,
   `types.ts`, or any calculation, unit, rounding or date-format code.
2. Existing tests must pass **unchanged**. If a test fails, the change is wrong
   unless the test asserts an incidental class name/colour — then flag it in
   the PR rather than silently editing it.
3. Keep accessibility behaviour: skip link, `<dialog>` focus trap in
   `AppShell`, `aria-current`, `role="alert"`/`role="status"`, labels,
   password-toggle naming, focus return after dialogs.
4. No new colour literals in feature CSS or JSX. Every colour comes from a token.
   A missing token is added to `DESIGN_SYSTEM.md` first, then `tokens.css`.
5. No new dependencies or styling frameworks (no Tailwind, no CSS-in-JS lib).
6. Ship animation only on login/signup. No motion on financial data.
7. Prototype global styles (`oris.css` `body` rules) never get imported into the app.
8. Colour never carries meaning alone: rise/fall always also has a sign, arrow or word.
9. **Our spec outranks Impeccable's taste.** `DESIGN_SYSTEM.md` / `tokens.css` decide
   colours, type, radii and motion. If an Impeccable command or hook suggests a
   different aesthetic (new font, accent colour, bolder look), the spec wins. Use
   Impeccable to find defects and refine inside the theme, not to redefine it.
10. **Impeccable ignores are narrow and justified.** Real findings get fixed. A
    false positive or sanctioned exception is suppressed only via
    `/impeccable hooks ignore-value|ignore-file ... --reason "..."`, scoped to the
    smallest rule/file/value. Never ignore a rule to push an edit through.

## 3. Current-state inventory

Production entry: `frontend/src/main.tsx` → `ClerkProvider` → `app/ClerkApp.tsx`
→ `app/App.tsx`. Global CSS: `app/app.css` (imported in `main.tsx` and `App.tsx`).

| Route | Component | CSS | Notes |
| --- | --- | --- | --- |
| `/login`, `/signup` | `features/auth/ClerkAuthPage.tsx` (prod), `AuthPage.tsx` (mock/preview) | `auth.css` | Clerk `appearance` object is hard-coded light theme (`#008e90`, `#ffffff`, `#dbe4ec`). Has hero copy, illustration and "Advisory only" badges. |
| all private | `components/AppShell.tsx`, `Brand.tsx`, `StatusPage.tsx`, `AppIcon.tsx` | `app.css` | Header with menu button + date chip; navigation is a modal `<dialog>` sidebar. Teal `#0db3b1`, navy `#06111f`/`#081625`, glowing primary button, 8px radii, Inter-first font. |
| `/home` | `features/home/HomePage.tsx` | `app.css` (`.bb-home`) | Single welcome block + CTA. |
| `/purchase-plans` | `features/purchase-plan/*` | `purchase-plan.css` (`--pp-*` vars) | Form, summary, delete dialog, `Primitives.tsx` (`Icon`, `PlanButton`, `ErrorBanner`, `LoadingState`). `Icon` is also used by the shell. |
| `/purchase-plans/recommendation` | `features/recommendations/RecommendationsPage.tsx`, `PurchaseImpact.tsx` | `recommendations.css` | `rec-*` classes: plan card, analysis, costs, cost highlight, forecast, guidance, skeleton, empty/error/unavailable. |
| `/market-dashboard` | `features/market-dashboard/MarketDashboard.jsx` → `StoredMarketPanel.jsx` | `stored-market.css` (`--sm-*`) | Recharts line chart with literal strokes (`#203044`, `#7c91a8`, `#39d4bd`, `#3f5b70`, `#0d1c2b`). Owned by Anjali (per `App.tsx` comment). |

**Apparently unused in production** (verify before touching): `dashboard.css`
(647 lines, no importer found), `BrentMarketPanel.jsx` + `brent-market.css`
(only imported by its test), `MGOChart.jsx`, `TickerCards.jsx`,
`IndicatorsTable.jsx`, `useMarketDashboard.js`. `MarketDashboard.jsx` imports
only `StoredMarketPanel`. **Do not restyle these; decide in Phase 7 (with the
dashboard owner) whether to delete.**

Isolated, keep separate: `src/preview/*`, `src/prototypes/oris/*`,
`src/prototypes/wireframe/*`, `vite.*.config.ts`, `dist-*`.

## 4. Token architecture

New files (Phase 1):

```
frontend/src/styles/
  tokens.css        # :root custom properties only — the single source of values
  base.css          # html/body/#root, font, box-sizing, focus ring, reduced motion, skip link
  theme.ts          # JS mirror of the tokens needed by Clerk + Recharts (see below)
```

Import order in `main.tsx`: `tokens.css` → `base.css` → `app/app.css`.

### 4.1 Token names (prefix `--bb-`, matching existing `.bb-*` classes)

From `DESIGN_SYSTEM.md` (values already approved):

```css
:root {
  /* surfaces */
  --bb-canvas: #0c0d0e;
  --bb-surface: #1a1b1c;
  --bb-surface-input: #121314;
  --bb-surface-hover: #e8dcc412;          /* ≈7% beige, from provider hover */
  /* text */
  --bb-text: #f0e6d2;
  --bb-text-secondary: #b5ac9b;
  --bb-text-supporting: #c5bba7;
  --bb-text-label: #e4d8c0;
  --bb-text-placeholder: #b6ac99;
  /* borders */
  --bb-border-subtle: #e8dcc426;
  --bb-border-control: #e8dcc466;
  /* actions + focus */
  --bb-action: #e8dcc4;
  --bb-action-hover: #f4e8d1;
  --bb-text-on-action: #171818;
  --bb-focus: #f4e8d1;
  /* errors */
  --bb-error-text: #efb9af;
  --bb-error-surface: #382b29;
  --bb-error-border: #e3b3a9;
  --bb-error-alert-text: #f2d9d2;
  /* type */
  --bb-font: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  /* spacing scale */
  --bb-space-1: 4px;  --bb-space-2: 8px;  --bb-space-3: 12px; --bb-space-4: 16px;
  --bb-space-5: 20px; --bb-space-6: 24px; --bb-space-7: 28px; --bb-space-8: 32px;
  --bb-space-10: 40px;
  /* shape */
  --bb-radius-card: 10px;
  --bb-radius-control: 5px;
  --bb-shadow-card: 0 16px 60px #00000026;
  --bb-motion-fast: 150ms;
}
```

**Placeholders, to be filled during the brainstorm (§6), not invented in code:**

```
--bb-price-up / --bb-price-up-surface
--bb-price-down / --bb-price-down-surface
--bb-price-flat
--bb-success-text / --bb-success-surface      (saved states)
--bb-warning-text / --bb-warning-surface      (stale / unavailable data)
--bb-chart-grid, --bb-chart-axis, --bb-chart-series-1..n,
--bb-chart-forecast, --bb-chart-band
```

### 4.2 Feature variable bridging

Keep the existing scoped variables so selectors don't need rewriting all at once.
Re-point them to shared tokens, e.g. in `purchase-plan.css`:

```css
.pp-page { --pp-surface: var(--bb-surface); --pp-text: var(--bb-text); /* … */ }
```

Same for `--sm-*` in `stored-market.css`. Remove a bridge only once nothing reads it.

### 4.3 Non-CSS consumers (`theme.ts`)

- **Clerk** `appearance.variables` takes colour strings. Export a
  `clerkAppearance` from `theme.ts` using literal values that mirror the tokens,
  with a comment pointing at `tokens.css`. (Try `var(--bb-*)` first; if Clerk
  renders it correctly, use the variables directly and skip the mirror.)
- **Recharts** props (`stroke`, `fill`, `tick`) are SVG attributes. Export a
  `chartTheme` object (`grid`, `axis`, `series`, `cursor`, `activeDotRing`).
  Check whether `var()` resolves in those attributes in Chrome, Edge and Firefox.
  If it does, use `'var(--bb-chart-axis)'` strings. If not, use mirrored literals.
- Rule: mirrors live **only** in `theme.ts`. Feature files import from there.

## 5. Phases

Each phase = one branch off `main`, one PR. Branch names below are suggestions.

### Phase 0 — Spec freeze and prep  *(no PR; commits on current branch)*

- [x] Run the wireframe preview (`cd frontend && npx vite --config vite.wireframe.config.ts`,
      open `http://127.0.0.1:5175/wireframe.html`). Captured desktop (1440×900) and
      mobile (390×844) into `docs/ui-revamp/reference/` (`node reference.mjs` in the tools folder re-takes them).
- [x] (Done 2026-10-26, results in `DESIGN_SYSTEM.md`: text passes; `border-control` was 2.2:1; border contrast corrected during Phase 2; see latest beige handoff.) Contrast-check the muted greys on `--bb-canvas` and `--bb-surface`
      (`text-secondary`, `text-placeholder`, `border-control`). Anything under
      4.5:1 for text / 3:1 for control borders gets adjusted in the spec.
- [x] "Before" screenshots of every state are produced by the Playwright baseline run below, not by
      hand (§10.5). Only the wireframe reference above and the real Clerk screens (Phase 3) are manual.
- [x] Add the §4.1 placeholder token names to `DESIGN_SYSTEM.md` as "pending".
- [x] `frontend/.graphifyignore` created (`dist*/`, `node_modules/`, `graphify-out/`).
- [ ] **You:** re-run graphify on `frontend` so the minified bundles stop polluting communities.
- [x] `/impeccable init` → `frontend/PRODUCT.md` (done; re-run only if product facts change).
- [ ] **You:** restart Claude Code and confirm `/impeccable` is listed (this session predates the install).
- [x] **Hook mode: manual (decided).** Done: hook disabled, `.impeccable/config.json` written. Run `/impeccable hooks off` so edits aren't auto-scanned;
      you run `detect` yourself at the end of each slice (§10.1). Confirm with `/impeccable hooks status`.
- [ ] Decide which Impeccable files are committed: `frontend/PRODUCT.md` is team-useful;
      `.impeccable/config.json` only matters if you add shared ignores. Check `git status`.
- [x] Set up Playwright once (§10.5; the `e2e-runner` subagent can create and debug the files) and run
      `npx playwright test -g visual --update-snapshots` to capture the current look as the baseline.
- [x] Save a zero-token detector baseline: `impeccable detect frontend/src > docs/ui-revamp/baseline-detect.txt`
      (path in §10.1). Today it finds 2 issues in regex-only mode: `Inter` in `purchase-plan.css`
      and a thick coloured `border-right` in `recommendations.css`. Regex-only mode skips
      contrast and tiny-text rules; the Playwright `a11y` and `layout` checks cover those.
- [ ] **You:** commit the Phase 0 changes you want shared and merge `feature/ui-revamp-wireframe` → `main`
      (nothing has been committed or merged yet).

**Phase 0 findings (2026-10-26):**

- Playwright 1.64.1 needed its own Chromium (revision 1248, 118 MB download); the cached 1228 did not match.
- Baselines: 17 states × 2 viewports = 34 PNGs in `docs/ui-revamp/tools/baselines/`; `gallery.html` shows them.
  The 8s-delay loading states are caught mid-load; error states appear after the first failed request.
- Detector: 2 regex-only findings (`Inter` in `purchase-plan.css`, `border-right` side-tab in `recommendations.css`).
- Playwright `layout` already flags the 11px date chip in the header (real).
- `theme` fails on every screen, as expected before `tokens.css` exists. It becomes the progress meter from Phase 1.
- Optional historical mobile finding — purchase-plan card: the action buttons (Delete / Edit / View recommendation) overflow the card on the left
  at 390px (visible in `saved-mobile.png`). The page-width overflow check does not catch this: optional Phase 4 follow-up;
  consider adding a per-element overflow check to `screens.spec.ts`.

**Exit:** spec approved, wireframe reference captured, Playwright baseline and detector baseline
saved, hook off, `main` has the spec.

### Phase 1 — Tokens and base (`ui/01-tokens`)

**Status (2026-10-26): implemented and checked; local changes remain uncommitted.**

Completed:
- [x] Added `styles/tokens.css`, `base.css`, `theme.ts` and the colour-mirror drift test.
- [x] Loaded tokens/base through `@import` in `app/app.css`. This deliberately replaces the
      proposed `main.tsx` imports: production and preview both receive the styles. Retained
      the existing App import; no routing/session change was needed.
- [x] Moved canvas, font, box-sizing, inherited control font, focus and disabled rules into base.css.
- [x] Added global reduced-motion handling.
- [x] Bridged neutral `--pp-*` and `--sm-*` values to shared tokens. Semantic accents remain later work.
- [x] Added `test.css.include` for tokens.css so the mirror test can read the CSS.
- [x] Re-ran `npm test`: 115/115 passed. Re-ran `npm run build`: passed (existing bundle-size warning).
- [x] Recorded implemented tokens in `frontend/DESIGN.md`, linked to DESIGN_SYSTEM.md.
      Maintained directly from source; not claimed as Impeccable-generated.
- [x] Owner approved stronger borders, then requested beige; implemented `border-control: #e8dcc466` (40% beige) to preserve contrast. Spec/CSS/JS synchronized.

Still outstanding:
- [ ] Owner visual acceptance, commit/PR and merge. These are separate from implementation completion.
- [ ] Impeccable `document` / `doctor`, if that tooling is used in the execution environment.
      The maintained DESIGN.md fulfills the documentation need; plugin commands have not been run here.

Deferred by design:
- Shell/header/nav/buttons: Phase 2. Auth/Clerk: Phase 3. Purchase forms/cards and remaining
  feature literals: Phase 4. Recommendation colours and skeletons: Phase 5. Charts: Phase 6.
- `--pp-teal`, `--pp-red`, `--sm-accent` and pending semantic/chart tokens are not missing Phase 1 tasks.
- The remaining `Inter` shorthand on `.pp-time-note` belongs to Phase 4; the earlier claim that all Inter
  use was removed was too broad.
- Keep the original Playwright baselines as before-images. Do not update them until the owner
  accepts the Phase 2 look; automated screenshots alone are not owner acceptance.

### Phase 2 — Shell and shared primitives (`ui/02-shell`)

**Status (2026-10-26): beige scheme accepted; desktop baselines refreshed; committed as 744aa71 on the prototype branch.**

Completed:
- [x] Neutral header, 44px ghost menu control, bordered 12px date chip.
- [x] Circular light beige brand mark and 20px/500 wordmark.
- [x] Surface-coloured navigation dialog, neutral dimmed backdrop, active fill + weight + 2px rule.
- [x] Owner decision: retain current modal sidebar; no desktop rail or separate mobile redesign.
- [x] Primary/secondary/destructive shared buttons use tokens, 5px radii and ≥44px targets;
      main page CTA is ≥50px. Removed glow and shared-control motion.
- [x] Shared session/error/loading states and notice use neutral or warm-error tokens.
      Loading indicators remain static with existing status text. Recommendation skeletons are
      feature-owned and explicitly deferred to Phase 5; there is no shared skeleton component.
- [x] Skip link uses action tokens. Dialog keyboard/focus behavior is unchanged.
- [x] Centered content max-width and shared padding tokens; page-specific layouts remain later phases.
- [x] Approved border token synchronized in CSS/JS/spec; added neutral backdrop token.
- [x] Unit/integration tests: 115/115. TypeScript + production build passed; existing bundle warning remains.
- [x] Fresh source review found no material production regression; stale documentation and screenshot paths corrected.
- [x] Desktop Chromium: seven preview states checked for header rendering/accessibility and page overflow.
      Sidebar focus loop, Escape, focus return, active marker, control bounds and axe audit passed.

Files changed for Phase 2: `app/app.css`, shared-control rules in `purchase-plan.css`,
`styles/tokens.css`, `styles/theme.ts`, `DESIGN_SYSTEM.md`, `frontend/DESIGN.md`.
No component logic, routes, services, data calculations, or existing tests changed.
The CSS for `Primitives.tsx` lives in purchase-plan.css, so those specific rules are included here.
No `.bb-button--secondary` was added because no current shell consumer needs one;
existing `PlanButton` secondary styling covers its consumers.

Still outstanding:
- [x] Owner accepts the current desktop beige colour scheme and authorizes continuation (2026-10-26).
- [x] Refreshed 17 desktop baselines after acceptance; 34 originals preserved in `docs/ui-revamp/before/`.
- [x] Phase 1/2 checkpoint committed as `744aa71` on `feature/ui-revamp-wireframe`. No push, PR or merge; prototype branch only.
- [ ] Real Clerk and live dashboard browser validation remain Phases 3 and 6. Preview cannot
      establish that those integrations are visually complete.

Checks: `npm test`, `npm run build` in frontend; `node phase2-check.mjs` in docs/ui-revamp/tools
with Vite serving port 5173. Results: `docs/ui-revamp/phase2/checks.json`.
Impeccable passes were not run; direct source review, browser screenshots and axe checks are recorded instead.
### Phase 3 — Auth and Home  *(`ui/03-auth-home`)*

#### Phase 3A — Today's date (functional prerequisite)

**Current status: implementation integrated from main via 9de0ea6. Backend current-date behavior and frontend refresh/draft preservation are present. Live Clerk/database validation is still pending.**

- [x] **Backend integrated from main:** replace the historical scenario date with the actual current date.
      Compute it at runtime; do not hard-code the date of this discussion (2026-10-26).
- [x] Traced the authoritative scenario source through backend configuration, `ClerkApp`, hooks,
      plan validation, remaining-day calculations and recommendation requests before editing.
      Changing only the displayed label while calculations retain the old date is not sufficient.
      Findings: ConfigController and PurchasePlanController use startup-injected LocalDate; plan reads
      recompute remaining days against that date. ClerkApp fetches config on sign-in/retry, not at midnight.
      Analysis compares the requested scenario with the active date; retain that consistency check.
      A runtime backend clock plus frontend rollover refresh is the proposed implementation, implemented with approved date policy.
- [x] Resolve the product date/timezone policy with the owner. Approved: calendar date in
      `Asia/Singapore`, with consistent frontend/backend behavior and a defined midnight refresh policy.
- [x] Keep the operational date distinct from market observation/forecast dates. Historical observations
      must retain their actual as-of dates; show stale/unavailable information when current data or
      forecasts are absent. This request does not imply live market ingestion or permission to redate data.
- [x] Decide how existing plans whose deadlines have passed behave (view/edit/overdue presentation),
      and how unsupported analysis dates are handled; preserve stored records and make limitations clear.
- [x] Update the affected contracts and tests together: timezone/date rollover, due today, past deadline,
      remaining days, existing plans and unavailable current analysis. Reconcile `frontend/PRODUCT.md`,
      the relevant PRD date statements and this plan with the implemented behavior, explicitly noting
      that the new owner request supersedes the previous historical-date requirement for operational dates.

**Exit:** displayed date, validation and calculations agree on today; actual market-data dates remain
truthful. Functional tests cover the new behavior. Do not mark this complete after a header-only change.

#### Phase 3B — Auth styling and post-signup Home

**Home design deferred by owner (2026-10-26): may run Impeccable with Claude. No direction selected; no Home redesign implemented. Auth styling below remains pending separately.**

- [ ] **Owner request — brainstorm before building:** the landing page after signup is too plain and
      uninviting. Scope this to authenticated `/home`, not a new public marketing page.
      Establish what a first-time user should understand/do, and what a returning user needs.
- [ ] Develop and show 2–3 concrete Home directions with real available content; review hierarchy,
      useful first action, explanatory copy and first-time versus returning-user states with the owner.
      Do not add fabricated market summaries, unsupported metrics or filler merely to occupy space.
- [ ] Ask Impeccable/Claude for critique or layout/content exploration if available. Treat this as a
      requested design aid, not a mandatory install or an already-completed consultation. Record the
      chosen direction before implementing; existing beige theme and honest data labels still apply.

- [ ] **Login/Signup layout:** adopt the wireframe composition: copy + vessel left,
      form card right; existing narrow-screen stacking may remain (not an acceptance gate). Move the vessel SVG into a shared
      component (e.g. `components/VesselIllustration.tsx`) used by both the prototype
      and `ClerkAuthPage`, rather than copying markup.
- [ ] **Clerk theming:** replace the light `appearance` with `clerkAppearance` from
      `theme.ts`: dark card `--bb-surface`, inputs `--bb-surface-input`, primary
      button `--bb-action`/`--bb-text-on-action`, radii 10px/5px, labels 13px.
      Check the social buttons, OTP and verification screens, error text and the
      "forgot password" flow (see `docs/ui-mockups/forgot-password.png`).
- [ ] Decide on the hero copy and "Advisory only" badges. Keep the copy (guardrail),
      restyle the badges as small outlined text.
- [ ] `AuthPage.tsx` (mock) gets the same styling so preview mode matches.
- [ ] **Home:** implement the direction selected in Phase 3B, using shared typography/actions.
      Quick links, first-plan guidance or a useful returning-user summary are candidates for discussion,
      not approved content. The previous simple welcome-plus-CTA restyle is no longer the full scope.

**Impeccable:** `/impeccable critique` on the login against the wireframe reference
(hierarchy, readability); `/impeccable typeset` for the hero scale; `/impeccable adapt`
only if a responsive issue warrants it (optional); `/impeccable live` (needs the dev server) to compare
variants of the Clerk card spacing. `/impeccable animate` is available for the login; the
existing vessel draw-once animation and the reduced-motion behaviour in `DESIGN_SYSTEM.md` still apply.

**Exit:** Clerk sign-in, sign-up and sign-out tested against the real Clerk dev
instance; reduced-motion shows the finished vessel immediately. Owner has reviewed the post-signup
Home direction, and first-time/returning-user states match that decision.

### Phase 4 — Purchase plans  *(`ui/04-purchase-plan`)*

Files: `purchase-plan.css`, `PurchasePlanForm.tsx`, `PurchasePlanSummary.tsx`,
`DeletePlanDialog.tsx`, `PurchasePlanPage.tsx` (markup/classNames only).

- [ ] **Owner request — row-first plan layout:** saved plan cards fill the available horizontal
      space before wrapping onto another row. Replace the fixed-width vertically stacked presentation
      with a desktop grid; choose a readable minimum card width and consistent gaps from actual content.
      Preserve source order and keyboard order (left to right, then next row); avoid masonry/dense reordering.
- [ ] Verify 0, 1, 2 and many plans, long values, and edit/delete/recommendation actions in the grid.
      Adjust fixed card width and sibling top-margin rules so they do not fight grid sizing/spacing.
      The form grid below is a separate layout concern. No CRUD or sorting behavior change is implied.
- [ ] Cards → `--bb-surface`, 10px radius, subtle border; inputs → spec input
      (48px, 5px radius, `--bb-surface-input`, `--bb-border-control`, focus `--bb-focus`).
- [ ] Unit adornments (MT, USD, etc.) as `--bb-text-secondary` inside the field.
- [ ] Date input: review the existing calendar-icon `filter` hack for a dark field.
- [ ] Review the focus suppression flagged in `DESIGN_SYSTEM.md` and restore visible focus.
- [ ] Delete dialog: surface card, destructive action uses error tokens and a clear
      label ("Delete plan"). Keep the focus trap and return behaviour.
- [ ] Saved/saving/failed states (`purchase-plans-*.png`) use the placeholder
      success/error tokens. **Fill `--bb-success-*` during this PR** (brainstorm item).
- [ ] Layout tweak: tighten the form grid to two columns ≥761px, one below.

**Impeccable:** `/impeccable harden` for the loading/saving/failed/empty/delete states and
long-value overflow (this is the best match for the mockup checklist); `/impeccable audit`
then `polish`. Remove `Inter` from `purchase-plan.css` (the detector already flags it).

**Exit:** all 10 purchase-plan mockup states reproduced and screenshotted.

### Phase 5 — Recommendations (colour exception)  *(`ui/05-recommendations`)*

**Dependency update:** Phase 6 now explicitly requires green-up/red-down indicator colours.
Align reusable direction tokens with that requirement while keeping price direction separate from
buyer favourability. A rise can be green as an upward movement and still be unfavourable for a buyer;
copy must explain the recommendation rather than implying green always means good.

Files: `recommendations.css`, `RecommendationsPage.tsx`, `PurchaseImpact.tsx`.

- [ ] **Brainstorm first (before code):** produce 2–3 rise/fall palette options as
      screenshots of the real page (e.g. A: muted sage/clay, B: desaturated
      green/red, C: monochrome + single warm accent for "rise"). Decide, then write
      the values into `DESIGN_SYSTEM.md` and `tokens.css`.
- [ ] Remember the semantics: for a fuel **buyer**, a price rise is unfavourable.
      Name tokens by direction (`price-up`/`price-down`), and let the copy state
      favourability ("Buying now avoids an expected rise").
- [ ] `rec-cost-highlight`, `rec-forecast`, `rec-central`: apply direction colour
      plus an arrow (▲/▼) and a signed value. Tabular numerals, right-aligned numbers.
- [ ] `rec-guidance`, `rec-symbol`, `rec-context`: neutral surfaces and type hierarchy.
      The recommendation verdict is the most prominent element on the page.
- [ ] States: loading skeleton, updating analysis, couldn't load, unavailable
      (all 5 recommendation mockups). Stale/unavailable uses `--bb-warning-*`
      (fill during this PR).
- [ ] `rec-demo` / mock-data notice stays clearly visible.

**Impeccable:** this is where it earns its keep. Use `/impeccable live` on the real page
to compare the 2–3 palette options in the browser instead of hand-building screenshots,
and `/impeccable colorize` scoped to the price-direction tokens only. Then
`/impeccable critique` for verdict prominence, `/impeccable distill` if the page is
cluttered, and `/impeccable harden` for unavailable/error states. The detector already flags
the `border-right: 2px solid #4cdddd` side-tab in `recommendations.css`: replace it with a
non-border cue (icon/label), consistent with rule 8.

**Exit:** palette approved and recorded; all recommendation states screenshotted;
each colour has a non-colour cue alongside it.

### Phase 6 — Market dashboard  *(`ui/06-market`)*

**Owner request — trading-style indicator trends (2026-10-26):**
- [ ] Each displayed indicator shows upward movement in green and downward movement in red,
      with a signed change and/or arrow plus an accessible direction label. Flat stays neutral;
      missing or incomparable observations show unavailable, never an invented trend.
- [ ] Inventory the comparison data for each indicator. Define and label the comparison period
      (previous observation/session or another meaningful period); do not assume daily comparisons
      for weekly/monthly series. Resolve ambiguous indicator semantics with the owner before coding.
- [ ] Reuse valid backend deltas where supplied. If a delta must be derived or fetched, document
      its source, units, interval and formula under the scoped functional exception in §2. Test rises,
      falls, zero changes, zero previous values, missing data and mismatched observation dates.
- [ ] Apply approved semantic tokens consistently across indicator cards/table entries; maintain
      dark-and-beige surfaces and avoid flashing/ticking animation. Historical data stays labelled as
      historical: the trading-platform appearance does not make this a live-data product.

Primary files: `stored-market.css`, `StoredMarketPanel.jsx`, `MarketDashboard.jsx`.
Presentation-only by default; any comparison-data/helper/service changes must be scoped and tested
under §2's functional exception. Coordinate with the dashboard owner before implementation.

- [ ] Remove the teal gradient decoration; panels become standard surface cards.
- [ ] Replace chart literals with `chartTheme`: grid `--bb-chart-grid` (subtle, dashed),
      axis ticks `--bb-chart-axis` at ≥12px (raise from 11px), series line `--bb-text`
      or `--bb-chart-series-1`, cursor `--bb-border-control`, active-dot ring `--bb-canvas`.
- [ ] Reuse the Phase 5 `price-up`/`price-down` tokens for any change indicators.
      Monochrome everywhere else.
- [ ] Tooltip: `--bb-surface`, subtle border, tabular numerals, unit shown.
- [ ] Tables: header `--bb-text-secondary`, row dividers `--bb-border-subtle`,
      numeric right-align, horizontal scroll on narrow screens.
- [ ] Loading / failed states (`market-dashboard-*.png`).

**Impeccable:** `/impeccable adapt` for the desktop chart/table pass, `/impeccable audit`
(chart text legibility, contrast), `/impeccable harden` for no-data/stale. Skip `optimize`
unless a real slowdown shows up.

**Exit:** chart readable at desktop width; every indicator has an accurate labelled up/down/flat or
unavailable state. Any necessary data/helper changes are documented and tested; no unrelated logic changes.

### Phase 7 — Cleanup and QA  *(`ui/07-cleanup`)*

- [ ] With the dashboard owner, confirm and delete (or archive) the unused files in §3.
- [ ] Remove bridged `--pp-*`/`--sm-*` variables that are no longer read.
- [ ] Repo-wide grep for hex literals in `src/app`, `src/components`, `src/features`.
      The only remaining ones should be in `tokens.css` and `theme.ts`.
- [ ] Full accessibility pass (`/design:accessibility-review`) on every route, plus
      `/impeccable audit` and a full-page detector scan of each route on the dev server
      (catches contrast/tiny-text rules the regex-only scan skips). Compare against
      `docs/ui-revamp/baseline-detect.txt`; the finding count should be zero or each remainder justified.
- [ ] `/impeccable polish` as the final pass per route; `/impeccable document` to refresh `DESIGN.md`.
- [ ] Screenshot sweep: every route × state at 1440px desktop (other widths optional) → `docs/ui-revamp/after/`.
- [ ] Decide fate of `prototypes/`, `dist-oris/`, `dist-wireframe/`, `oris.html`,
      `wireframe.html`, the vite prototype configs. Keep as reference or delete.
- [ ] Update `DESIGN_SYSTEM.md`: mark placeholders filled, remove "proposed" labels
      that are now implemented, document the nav/active state actually shipped.

## 6. Brainstorm backlog (decide as we go)

| Item | Decide in | Constraint |
| --- | --- | --- |
| Rise/fall colours | Phase 5, reused in Phase 6 | Dashboard requires green-up/red-down; choose accessible shades with signs/arrows/labels, ≥4.5:1 for text |
| Success (saved) colour | Phase 4 | May just be neutral text + check icon; colour optional |
| Warning (stale/unavailable) | Phase 5 | Must differ from error by more than hue (icon/label) |
| Chart series 1..n | Phase 6 | Start with 1 series in monochrome; add only if a second series ships |
| Forecast vs actual | Phase 5/6 | Solid vs dashed + legend label; band = subdued fill |
| Persistent nav rail on desktop | Decided Phase 2 | Keep existing modal sidebar; no rail |
| Today's date policy | Phase 3A | Resolve timezone, rollover, old plans and unsupported analysis; keep observation dates distinct |
| Inviting post-signup Home | Phase 3B | Brainstorm first-time and returning-user content/layout; Impeccable/Claude if available; owner selects direction |
| Row-first plan cards | Phase 4 | Readable card width, horizontal fill then wrap, stable source/keyboard order |
| Visible save/delete confirmation | Phase 4 — done 2026-10-28 | "Plan saved" / "Plan deleted" beside Create plan (`.pp-notice`): fades in, holds ~4s (hover pauses), fades out and unmounts; cleared by the next create/edit/delete. The new or edited card gets a 2s beige ring (`.pp-summary--saved`). Save/delete logic and the `role="status"` announcement unchanged. Under reduced motion both stay as opacity-only fades, exempted from `base.css`'s global .01ms animation cut so the notice stays readable. From the 2026-10-27 critique (P1 #3). |
| Purchase plans motion pass | Phase 4 — done 2026-10-28 | Tokens `--bb-motion-base` (200ms) and `--bb-ease-out`. Loading spinner rotates (reduced motion: opacity pulse). Buttons and sort options scale to .97 on press (not under reduced motion); colour changes ease over `--bb-motion-fast`. Delete dialog fades in from 96% scale; closes instantly. Deferred: sort-reorder view transition, first-load reveal. |
| Plan sort switch | Phase 4 — done 2026-10-27; restyled 2026-10-28 | "Sort by: Deadline / Volume" text toggle above the grid (`aria-pressed`; only the selected option gets a raised surface chip), display order only; default soonest deadline. |
| Dashboard trend comparison | Phase 6 | Define interval per indicator; truthful green-up/red-down with neutral flat/missing states |

## 7. Workflow: you, the lead session, and subagents

### 7.1 Roles

| Who | Does | Does not |
| --- | --- | --- |
| **You** | Make the decisions, approve at the two gates (§7.3), run `detect` and Playwright yourself, look at the Playwright report/gallery, merge PRs | Re-explain decisions in chat (they live in this plan and `DESIGN_SYSTEM.md`) |
| **Lead session** (main Claude) | Reads the spec and this phase, writes and edits code, owns the shared files (`tokens.css`, `theme.ts`, `app.css`), runs `npm run build && npm test`, runs the `/impeccable` pass, commits when you say so | Do broad file searching or full-diff review itself: that bloats its context |
| **Subagents** | One-shot specialists the lead spawns with a self-contained brief; they return a short report. Their tool output never enters the lead's context | See your conversation, or edit outside the files they are given |

Subagents are for work that is **noisy or independent**. For a five-line token swap in one file the lead
should just do it: a subagent has to re-read the rules and re-load the files, which costs more than it saves.

### 7.2 Subagent roster

| Subagent (type) | Use for | Phase | Writes? | Model |
| --- | --- | --- | --- | --- |
| `Explore` | Scope a feature: files, importers, CSS owners, every colour/font/radius literal, which states exist | start of every phase | No | haiku or sonnet |
| `Plan` | Turn the Explore report into a literal→token mapping and slice order; flag missing tokens | start of Phases 2–6 | No | sonnet (opus for 2 and 5) |
| `general-purpose` with `isolation: "worktree"` | Implement one **independent** feature slice in its own worktree/branch, in parallel with another | Phases 3 and 4 (see §7.4) | Yes, only listed files | sonnet |
| `everything-claude-code:e2e-runner` | Build and maintain the Playwright suite (§10.5); run it and summarise failures to a short list | Phase 0, then on request | Yes, only `docs/ui-revamp/tools/` | sonnet |
| `everything-claude-code:code-reviewer` | Fresh-eyes review of the diff: no logic/data/test-behaviour changes, no new hex values, tokens used correctly | end of every slice or PR | No | sonnet |
| `everything-claude-code:refactor-cleaner` | Evidence-based removal of dead CSS/files (`dashboard.css`, Brent panel, prototypes) | Phase 7 | Yes | sonnet |
| `impeccable-documenter` | Generate `DESIGN.md` from shipped code (invoked via `/impeccable document`) | after Phase 1, Phase 7 | Writes `DESIGN.md` | inherit |
| `impeccable-finish-reviewer` | Optional second reviewer against the design direction. It is built for Impeccable's own build flow (direction contract, approved comp), so trial it on one phase before relying on it | optional | No | inherit |

Rules for every subagent:

1. **Self-contained brief** (template in §7.5): goal, exact files, what it may and may not touch, the §2
   rules that apply, and the output format. It has not seen this conversation.
2. **Short return**: ≤ 15 lines or a file list plus open questions. Ask for a path to a longer report
   file if needed, not the report inline.
3. **No shared files**: only the lead edits `tokens.css`, `theme.ts` and `app.css`. A subagent that
   needs a new token reports "token needed: name, intended use" and stops.
4. **No commits, no PRs, no installs.** The lead commits; you decide about PRs.
5. **Read-only by default.** Only `general-purpose` (worktree), `e2e-runner`, `refactor-cleaner` and
   `impeccable-documenter` write, and only in the places listed above.

### 7.3 Per-PR loop (who does what)

| # | Step | Who | Output |
| --- | --- | --- | --- |
| 1 | Branch from up-to-date `main`; `/clear` for a fresh session | You | clean context |
| 2 | Load context: `DESIGN_SYSTEM.md`, `frontend/PRODUCT.md`, §2 and this phase of the plan, `frontend/AGENTS.md`, `docs/frontend-design-guidelines.md` (AGENTS.md is not auto-loaded) | Lead | context loaded |
| 3 | Scope: graph first (`graphify-out/GRAPH_REPORT.md`), then an `Explore` subagent for the details the graph lacks | Lead → Explore | file list + literals ≤ 15 lines |
| 4 | Plan: `Plan` subagent maps literals → tokens and orders the slices | Lead → Plan | plan |
| **G1** | **Approve the plan** (files, token mapping, any new tokens, layout tweaks) | **You** | go / change |
| 5 | Implement one slice at a time (a component or CSS file), or hand independent slices to worktree subagents (§7.4). Lead owns the shared token files | Lead (+ worktree subagents) | edits |
| 6 | `cd frontend && npm run build && npm test` | Lead | pass/fail |
| 7 | **Manual detector scan** on the changed paths (§10.1) and the Playwright text-only checks (§10.5). Paste only non-empty output | You | findings list |
| 8 | Fix real findings; suppress only false positives via `/impeccable hooks ignore-*` with a reason (rule 10) | Lead | clean scan |
| 9 | Visual check: run Playwright visual tests, open the HTML report, look **only** at failing screens that are in this phase's scope; confirm out-of-scope screens still pass | You | approved / change requests |
| **G2** | **Approve the look** | **You** | go / change |
| 10 | One `/impeccable` pass from the phase's `Impeccable:` line (`critique` or `audit`, then `polish`), then re-run steps 6–7 | Lead | refined |
| 11 | `code-reviewer` subagent on the diff; `/design:accessibility-review` on phases that add interaction (2, 3, 4) | Lead → reviewer | material findings only |
| 12 | Re-baseline just this phase's screens (`npx playwright test -g "<states>" --update-snapshots`); open the PR with the report, tokens added, checks run, anything unverified | You (Lead drafts text) | PR |
| 13 | After merge: incremental graphify re-run on `frontend` | You | fresh graph |

### 7.4 Parallel work

You are the only person, but git worktrees let two Claude workers run at once. Dependency order:

```
Phase 0 → 1 → 2 → 3A (today/date behavior) → 3B (auth, Home) → 4 → 5 → 6 → 7
```

- The old assumption that Phases 3 and 4 are independent is no longer valid: Phase 3A touches
  plan/date behavior. Default to sequential work. Consider parallel styling only after date contracts
  stabilize and actual file ownership is checked; shared app.css remains lead-owned.
- **Phase 5 before 6**: both consume the `price-up`/`price-down` tokens decided in Phase 5.
- **Never parallelise 1 and 2**, or anything that edits `tokens.css`, `theme.ts` or `app.css`.
- A worktree subagent may need `npm install` in its checkout (separate `node_modules`); budget for that.
- Parallel runs spend tokens twice as fast. Use them when you want the time saved, not by default.

### 7.5 Prompt templates

The older visual-only templates below apply to aesthetic slices. For Phases 3A, 3B and indicator
logic in Phase 6, include the latest scope update and §2 exceptions; do not blindly carry forward
the blanket prohibition on all logic, copy and test changes.

**Lead (start of a phase):**

```
Phase <N> of docs/ui-revamp/UI_REVAMP_PLAN.md. Read DESIGN_SYSTEM.md, frontend/PRODUCT.md,
docs/ui-revamp/UI_REVAMP_PLAN.md §2 and §5 Phase <N>, frontend/AGENTS.md and
docs/frontend-design-guidelines.md. Do not read feature files yourself yet.
Spawn an Explore subagent to scope <feature folder(s)>, then a Plan subagent to map literals to
--bb-* tokens. Show me the plan and stop for approval.
After approval: implement one slice at a time. Do not change logic, data, routes, copy or tests.
No new hex values; if a token is missing, stop and ask. DESIGN_SYSTEM.md outranks any Impeccable suggestion.
When a slice is done, say so and wait: I will run detect and Playwright and paste the results.
```

**Explore brief:**

```
Read-only. In frontend/src/<paths>, list: (1) every .tsx/.jsx/.css file and what imports it,
(2) every hex/rgb/hsl colour, font-family, border-radius and box-shadow literal with file:line,
(3) every UI state the code renders (loading/empty/error/saved/...). Do not edit anything.
Return at most 15 lines: a file table, then literals grouped by file, then states. If more detail
is needed, write it to <scratch path>/explore-<phase>.md and return only the path.
```

**Worktree implementer brief:**

```
You are implementing Phase <N> (<feature>) of the Bunker Buddy UI revamp in your own worktree.
Read docs/ui-revamp/UI_REVAMP_PLAN.md §2 (rules) and §5 Phase <N>, DESIGN_SYSTEM.md, and only these files: <list>.
You may edit only: <list>. You may NOT edit tokens.css, theme.ts, app.css, any service/hook/test file,
or add dependencies. Use --bb-* tokens only; if one is missing, stop and report "token needed: name, use".
No logic, data, route or copy changes. Run `npm run build && npm test` in frontend/ before you finish.
Return: files changed, tokens used, tokens needed, build/test result. Do not commit.
```

**Reviewer brief:**

```
Review `git diff main...HEAD -- frontend/src`. Report only material problems, max 10 lines:
(1) any change to logic, data, routes, validation, copy or tests, (2) any new colour literal outside
tokens.css/theme.ts, (3) removed accessibility behaviour (skip link, focus trap/return, aria-*, roles, labels),
(4) states that lost their styling. Do not suggest aesthetic changes.
```

## 8. Definition of done (whole revamp)

- Every production route and every state in `docs/ui-mockups/` renders in the theme.
- Hex literals exist only in `tokens.css` and `theme.ts`.
- All existing tests pass unmodified (or each modification is justified in a PR).
- Keyboard, focus, contrast (AA) and reduced-motion verified in a real browser.
- `DESIGN_SYSTEM.md` matches what shipped.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Clerk widgets ignore part of the dark theme (OTP, modals, alerts) | Test every Clerk screen in Phase 3; use `elements` overrides; accept and document limits |
| Recharts can't read CSS vars | `theme.ts` mirror (§4.3) |
| Dashboard owned by a teammate; parallel edits conflict | Announce Phase 6 timing; presentation-only diff |
| Muted greys fail contrast | Fixed in Phase 0 before tokens are coded |
| Layout tweaks creep into redesign | Each tweak listed in its phase; anything else goes to §6 for approval |
| `App.tsx` also imports `app.css`; preview/test entry may rely on it | Check before removing the duplicate import |

## 10. Tooling and token budget

### 10.1 Zero-token checks (run these before asking Claude anything)

Impeccable's detector is a deterministic CLI, not an LLM call. Path on this machine
(Windows has `impeccable.cmd` beside it):

```bash
IMP="$HOME/.claude/plugins/cache/impeccable/impeccable/4.7.1/skills/impeccable/scripts/impeccable"
"$IMP" detect frontend/src/features/purchase-plan          # files/dirs, regex-only mode
"$IMP" detect http://127.0.0.1:5173/home                    # rendered page: adds contrast, tiny-text
"$IMP" detect --viewport 390x844 http://127.0.0.1:5173/home # mobile pass
"$IMP" detect --json --quiet frontend/src                   # count only
```

**You run these manually; the hook is off** (Phase 0), so Claude doesn't spend tokens on per-edit
reminders. Use `--quiet` to get just the count, and paste output to Claude only when it is non-empty.
The plugin path contains the version, so update it after `npx impeccable update`, or add a shell alias.
The detector opens a URL as an anonymous browser, so private screens aren't reachable by URL. The mock
entry `http://127.0.0.1:5173/preview.html` starts on one state (recommendation ready) and the state
dropdown can't be deep-linked, so for the other states rely on the Playwright `theme` / `a11y` checks (§10.5)
and use `detect` on source paths. Verify this on first use.

Other zero-token guards (a script or one-liner, not Claude):

- **Hex-literal audit:** `grep -rnE "#[0-9a-fA-F]{3,8}\b" frontend/src/app frontend/src/components frontend/src/features --include=*.css --include=*.tsx --include=*.jsx`
  should shrink to zero by Phase 7 (outside `tokens.css`/`theme.ts`).
- **Playwright suite (§10.5):** DOM checks for overflow, off-token colours, contrast and focus, plus
  pixel-diff against approved baselines. Run it yourself; hand Claude only failing text and the one or
  two images that matter. It lives in `docs/ui-revamp/tools/`, outside `frontend/` (rule 5).
- **Build/test:** `npm run build && npm test` outputs are short; paste only failures.

### 10.2 Impeccable commands, mapped to this project

| Use | Command | When |
| --- | --- | --- |
| Setup | `init`, `document`, `doctor`, `hooks` | Phase 0–1 |
| Find defects | `audit`, `critique` | end of every phase |
| Fix states | `harden` | Phases 4–6 |
| Layout/type | `layout`, `typeset`, `adapt` | Phases 2, 3, 6 |
| Shared patterns | `extract` | Phase 2, 7 |
| Palette exploration | `live`, `generate`, `colorize` (scoped) | Phase 5–6 |
| Finish | `polish`, `distill`, `quieter` | end of each phase |
| Available, use when a screen calls for it | `bolder`, `animate`, `delight`, `overdrive`, `onboard`, `optimize`, `clarify` | as needed |

Every result is still judged against `DESIGN_SYSTEM.md` (§2 rule 9) and the guardrails in §2.

### 10.3 Reducing Claude token use

1. **Graph first, files second.** Already set up. Re-run graphify after each merged phase.
   `.graphifyignore` for `dist*/` keeps it from indexing minified bundles.
2. **Run the checkers yourself.** `detect` and the Playwright text checks cost you seconds and Claude
   nothing; their findings are a few lines. Asking Claude to "review the CSS for problems" costs the whole
   file plus reasoning.
3. **One phase, one fresh session.** `/clear` between phases; use `/compact` mid-phase
   only at a slice boundary. Don't carry the PR 3 conversation into PR 5.
4. **Load small, specific context.** CSS files here are small; read the target file, not the
   folder. The plan, spec and PRODUCT.md stay under a few thousand tokens: reference them
   by path rather than pasting.
5. **Pick the model per task.** Mechanical token mapping and CSS conversion: Sonnet.
   Layout decisions, palette brainstorm, `critique`: Opus. (`/model` switches.)
6. **Delegate noisy work to subagents** (roster in §7.2): scoping, plan drafting, diff review.
   Only their short report returns to the main context.
7. **Images are expensive.** Don't paste screenshots by default. Let Playwright's DOM checks and pixel
   diffs find problems (§10.5); paste only the one or two failing screens you want help with.
8. **Batch the edits.** "Convert all literals in `purchase-plan.css` to tokens" in one
   turn beats ten micro-requests that each re-read the file.
9. **Keep plans written down.** This file plus `DESIGN_SYSTEM.md` are the memory; don't re-explain
   decisions in chat. Update the plan when a decision changes.

### 10.4 Tooling reference (installation status noted per tool)

| Tool | Helps with | Caveat |
| --- | --- | --- |
| Playwright + `@axe-core/playwright` (own folder, §10.5) | DOM/colour/contrast/focus checks and pixel-diff regression without eyeballing every screen | Installed in docs/ui-revamp/tools; use the existing executable files |
| Claude Code built-in browser / Claude in Chrome skills | Visual checks, rendered-page scans without scripting | Interactive; costs image tokens |
| Stylelint (via `npx`, with a rule banning hex colours outside token files) | Enforces rule 4 mechanically | A config to maintain; only worth it if the grep proves too manual |
| Figma MCP | Comparing against a design file | Not authorized in this session, and there's no Figma source yet; skip unless the team makes one |
| Graphify MCP / queries | Impact discovery before a change | Already in use; code-structure only, no aesthetic judgement |

### 10.5 Playwright: check most things without looking at images

**Goal:** you look at a handful of flagged screens per phase, not every screenshot. The suite does this in
three tiers, cheapest first.

| Tier | What it checks | Output | Costs |
| --- | --- | --- | --- |
| 1. DOM checks | No horizontal overflow at 390px; every rendered colour is a `--bb-*` token value (this catches leftover teal/navy even where the CSS looks fine); text smaller than 12px; keyboard focus ring visible; axe-core WCAG A/AA violations | a few lines of text | no images, no model |
| 2. Visual regression | Pixel diff against an approved baseline per state × viewport | pass/fail; a diff image only when something changed | you open the HTML report |
| 3. Gallery | All baselines on one scrolling page for your own skim | `gallery.html` | you only |

Claude sees only tier-1 failure text, plus the one or two images from tier 2 you choose to paste.

**Why this works without Clerk:** the app has a mock entry, `frontend/preview.html`
(`src/preview/PreviewApp.tsx`), with a "Demo controls" dropdown (`#preview-state`) that already covers
login, signup, home, plans (empty / multiple / saved / loading / load error) and all recommendation states.
The suite drives that dropdown, so no login is needed. Slow states (8s delay) are captured while loading.

**Not covered, and what to do instead:**

- **Real Clerk widgets** (sign-in/sign-up, OTP): the preview uses the mock auth page. Check them by hand
  against your Clerk dev instance in Phase 3: desktop screenshots; mobile optional.
- **Market dashboard:** the preview doesn't pass `MarketDashboard`, and the real panel calls `/api`
  (proxied to `127.0.0.1:8000`). In Phase 6, either run the backend or add a dashboard state to
  `PreviewApp.tsx` plus `page.route('**/api/**', ...)` fixtures. That touches preview tooling only, but
  ask before doing it.
- **Interactive states** that need an action (login/signup/save/edit/delete failures, nav dialog open,
  editing a plan): version 1 skips them; add them as extra tests with a small `act()` step.

#### Setup (once, about 10 minutes)

The tool lives outside `frontend/` so it adds nothing to the app's `package.json` (rule 5):

```bash
mkdir -p docs/ui-revamp/tools && cd docs/ui-revamp/tools
npm init -y
npm i -D @playwright/test @axe-core/playwright
npx playwright install chromium     # a Chromium is already cached on this machine; this only downloads if the revision differs
```

Start the app in another terminal: `cd frontend && npm run dev` (serves `http://127.0.0.1:5173`).
Check that `http://127.0.0.1:5173/preview.html` opens and the "Demo controls" dropdown works.
If the dev server picks another port, change `baseURL` below.

**Starter files** (untested: the first run will probably need small adjustments to waits and selectors).
Ask the `e2e-runner` subagent to create and debug them:

`playwright.config.ts`

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  snapshotPathTemplate: '{testDir}/baselines/{arg}-{projectName}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' } },
  use: { baseURL: 'http://127.0.0.1:5173', reducedMotion: 'reduce' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
```

`screens.spec.ts`

```ts
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Keys of `examples` in frontend/src/preview/PreviewApp.tsx that render without an extra action.
const STATES = [
  'login', 'signup', 'home', 'home-loading', 'session-error',
  'multiple', 'empty', 'saved', 'loading', 'load-error',
  'rec-ready', 'rec-loading', 'rec-error', 'rec-unavailable', 'rec-missing', 'rec-unsupported', 'rec-empty',
];
const only = process.env.STATES?.split(',');

async function openState(page: Page, key: string) {
  await page.goto('/preview.html');
  await page.locator('summary', { hasText: 'Demo controls' }).click();
  await page.selectOption('#preview-state', key);
  await page.addStyleTag({ content: '.preview-tools{display:none!important}' });
  await page.waitForTimeout(key.includes('loading') ? 400 : 1500); // mock services take ~0.7s
}

for (const key of STATES.filter(k => !only || only.includes(k))) {
  test.describe(key, () => {
    test.beforeEach(async ({ page }) => openState(page, key));

    test(`${key} · layout`, async ({ page }) => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(0);
      const tiny = await page.evaluate(() => [...document.body.querySelectorAll<HTMLElement>('*')]
        .filter(e => !e.closest('.preview-tools') && e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim()))
        .filter(e => parseFloat(getComputedStyle(e).fontSize) < 12)
        .map(e => `${e.tagName.toLowerCase()}.${e.className}`).slice(0, 10));
      expect.soft(tiny, 'text under 12px').toEqual([]);
    });

    test(`${key} · theme`, async ({ page }) => {
      // Every rendered colour must equal one of the --bb-* colour tokens.
      const offTheme = await page.evaluate(() => {
        const probe = document.createElement('i'); document.body.append(probe);
        const norm = (v: string) => { probe.style.color = ''; probe.style.color = v; return getComputedStyle(probe).color; };
        const allowed = new Set(['rgba(0, 0, 0, 0)']);
        const root = getComputedStyle(document.documentElement);
        for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) {
          const r = rule as CSSStyleRule;
          if (r.selectorText !== ':root') continue;
          for (const name of r.style) {
            const v = root.getPropertyValue(name).trim();
            if (name.startsWith('--bb-') && CSS.supports('color', v)) allowed.add(norm(v));
          }
        }
        probe.remove();
        const bad: string[] = [];
        for (const e of document.body.querySelectorAll<HTMLElement>('*')) {
          if (e.closest('.preview-tools')) continue;
          const s = getComputedStyle(e);
          const checks: [string, string][] = [['color', s.color], ['background', s.backgroundColor]];
          if (parseFloat(s.borderTopWidth) > 0) checks.push(['border', s.borderTopColor]);
          if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) checks.push(['outline', s.outlineColor]);
          for (const [prop, val] of checks) if (!allowed.has(val)) bad.push(`${e.tagName.toLowerCase()}.${e.className || '-'} ${prop}=${val}`);
        }
        return [...new Set(bad)].slice(0, 25);
      });
      expect(offTheme, 'colours that are not --bb-* tokens').toEqual([]);
    });

    test(`${key} · a11y`, async ({ page }) => {
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(result.violations.map(v => `${v.id} x${v.nodes.length}`)).toEqual([]);
    });

    test(`${key} · focus`, async ({ page }) => {
      const hidden: string[] = [];
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Tab');
        const r = await page.evaluate(() => {
          const e = document.activeElement as HTMLElement | null;
          if (!e || e === document.body) return null;
          const s = getComputedStyle(e);
          const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
          return { name: `${e.tagName.toLowerCase()}${e.getAttribute('aria-label') ? `[${e.getAttribute('aria-label')}]` : ''}`, ring };
        });
        if (r && !r.ring) hidden.push(r.name);
      }
      expect.soft([...new Set(hidden)], 'focused elements with no outline/shadow').toEqual([]);
    });

    test(`${key} · visual`, async ({ page }) => {
      await expect(page).toHaveScreenshot(`${key}.png`, { fullPage: true });
    });
  });
}
```

`gallery.mjs`

```js
import { readdirSync, writeFileSync } from 'node:fs';
const imgs = readdirSync('baselines').filter(f => f.endsWith('.png'));
writeFileSync('gallery.html', `<body style="background:#111;color:#eee;font:13px sans-serif;display:flex;flex-wrap:wrap;gap:12px">${
  imgs.map(f => `<figure style="margin:0"><img src="baselines/${f}" width="320" loading="lazy"><figcaption>${f}</figcaption></figure>`).join('')}</body>`);
```

Add `docs/ui-revamp/tools/node_modules/`, `test-results/` and `playwright-report/` to a local ignore if git
ever lists them (the plan folder is untracked anyway).

#### Day-to-day commands

Run from `docs/ui-revamp/tools` with the dev server up. A full run is about 170 tests (17 states × 2 viewports ×
5 checks) and takes a few minutes, so narrow it with `STATES`, `--project` or `-g` while iterating.
`-g` takes a regular expression.

```bash
# Phase 0: capture the current look as the baseline ("before")
npx playwright test -g visual --update-snapshots

# After each slice: text-only checks, no images
npx playwright test -g "layout|theme|a11y|focus" --reporter=line

# One feature, one viewport
STATES=saved,empty,multiple npx playwright test --project=mobile

# End of slice: visual diff, then open the report and look only at in-scope failures
npx playwright test -g visual
npx playwright show-report

# Approve: re-baseline only the screens you accepted
STATES=rec-ready,rec-error npx playwright test -g visual --update-snapshots

# Skim every baseline yourself (no Claude involved)
node gallery.mjs && start gallery.html
```

#### How to use it per phase

1. **Phase 0:** run the baseline command once. Copy `baselines/` to `docs/ui-revamp/before/` if you want to
   keep the old look after re-baselining.
2. **While implementing:** run the text-only line after each slice. Paste only failing lines to Claude.
   The `theme` test lists the exact selectors still on old colours, which makes it the fastest progress meter
   for the whole revamp: it should go to zero by Phase 7.
3. **End of slice:** run the visual tests. Screens **in** this phase's scope are expected to fail:
   open the report and look at those only. Screens **outside** scope must still pass; if one fails, the change
   leaked and needs a fix (that is the regression check you don't have to eyeball).
4. **Phases 1–2** affect shared styles. Preserve Phase 0 baselines through Phase 1; re-baseline desktop screens only after owner acceptance of Phase 2.
5. **Approve** by re-baselining only the screens you accepted (the `STATES=...` command).
6. **Phase 7:** run everything on desktop, skim `gallery.html`, and keep the report with the PR. Other widths are optional.

#### Reading failures

- `colours that are not --bb-* tokens` lists `element.class property=rgb(...)`. Search that class in the
  feature CSS and replace the literal with a token.
- `theme` is expected to fail until the phase that owns the screen is done. Phase 1 adds the tokens, so the
  suite has no allowed colours before then: expect everything to fail until `tokens.css` exists.
- Axe reports contrast problems only where it can compute the background. Semi-transparent surfaces may land
  in "incomplete"; check those by eye once.
- `focus` is soft because the spec focuses inputs with a border colour, which the check reads as "no ring".
  Treat a hit on a button or link as real, and a hit on an input as "verify by eye".

## 11. Open questions for the owner

1. Decided: keep the existing modal sidebar; no desktop rail or separate mobile redesign.
2. Keep the login hero copy and "Advisory only" badges as they are, or is copy in scope for auth?
3. Who owns the dashboard (Anjali?), and are they OK with Phase 6 and the Phase 7 deletions?
4. Should `docs/ui-revamp/` screenshots be committed, or kept local like this plan?
5. Anything from the Notion "Vibecode tips" page beyond what's in
   `docs/frontend-design-guidelines.md`? (The page couldn't be fetched automatically.)
6. Should `.impeccable/config.json` and `frontend/PRODUCT.md` be committed for the team, or kept local
   like this plan? Teammates running their own Claude sessions would benefit from `PRODUCT.md`.
7. ~~Hook mode~~ Decided: hook off, you run `detect` manually (Phase 0, §10.1).
8. Are you happy to run the two parallel worktree phases (3 and 4, §7.4), or keep everything sequential?
9. Should the Phase 6 dashboard get a mock state in `PreviewApp.tsx` so Playwright can reach it (§10.5)?

## 12. Keeping the UI branch in sync with `main`

The full runbook (rules, drift check, procedure, subagent roles and a dated sync log) lives in
**`docs/ui-revamp/SYNC_WITH_MAIN.md`**. Read it before merging or comparing with `main`. Summary:

- `main` owns behaviour, this branch owns presentation. Merge (never rebase), with `rerere` on, rehearsed on a throwaway
  `sync/main-<date>` branch, then fast-forward.
- Sync at the start of every phase, before every phase PR, and when a teammate PR touching `frontend/` lands.
- Last sync: **2026-10-27**, 0 behind `origin/main`. All 7 conflicts were resolved to `main`'s version (they were this
  branch's earlier date-wording work, not restyling). New un-themed UI from `main` to add to the phases: organisation,
  forecast, timing comparison.
- Do Phase 5 (recommendations) on top of the synced page, not before.

## 13. Creative direction and revamp order (draft)

The look-and-feel brief for the Claude Design round (product summary, feature list, sign-up and home imagery ideas,
asset folders, how to import designs back) is **`docs/ui-revamp/CREATIVE_BRIEF.md`**. Assets live in
`docs/ui-revamp/assets/{inspo,aim,actual}`. It is a draft; its open questions decide whether this plan's dark-and-beige
theme and guardrail 9 still hold.
