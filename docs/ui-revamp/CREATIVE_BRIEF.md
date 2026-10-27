# Bunker Buddy — creative brief (rough draft)

Status: **draft v0, 2026-10-27.** Owner: UI revamp lead. Written as the brief to take into Claude Design, then to use as the
"soft reference" when building here. It sits *above* `docs/ui-revamp/UI_REVAMP_PLAN.md`: that plan covers how we ship (phases,
guardrails, tests). This file covers what it should feel like. Where they disagree, decide explicitly and update both.

---

## 1. What the website is (paste this into Claude Design first)

> **Bunker Buddy** helps marine fuel buyers at shipping companies plan purchases of Marine Gas Oil (MGO) in Singapore.
> A buyer signs in, reads dated market history, saves purchase plans (quantity in metric tonnes and a deadline), and opens
> a cost-impact and advisory recommendation view for each plan. Singapore MGO prices are paywalled, so we use Singapore
> Gasoil futures as a proxy. Forecasts and recommendations are advisory and are labelled as unavailable until the models
> are connected. Users: procurement officers and bunker buyers. Secondary audience: CS203 assessors who judge the app in a
> demo, so the workflow must be clear without explanation.

### Essential features (from `frontend/PRODUCT.md`, so you can skip that round in Claude Design)

| # | Feature | Screen | Must show |
| --- | --- | --- | --- |
| 1 | Sign in / sign up (Clerk) | `/login`, `/signup` | Brand moment, form, provider buttons, errors |
| 2 | Organisation selection / access | after auth | Which org you are acting for, role |
| 3 | Home after sign-in | `/home` | Where to start: plans, market, what is new |
| 4 | Purchase plans: create, view, edit, delete | `/purchase-plans` | Quantity (MT), deadline, days remaining, overdue; empty, saving, error states |
| 5 | Recommendation + cost impact per plan | `/purchase-plans/recommendation` | Advisory action, cost range, forecast; unavailable / unsupported / loading states |
| 6 | Market dashboard | `/market-dashboard` | Price history chart, indicators with up/down direction, forecast widget |
| 7 | App shell | all private pages | Brand, date chip (Singapore today), menu sidebar, log out |

Principles to keep in every prompt: **label what is real** (no invented numbers presented as real), **plan first**,
**advisory not authoritative**, **demo-legible**.

## 2. Current visual baseline (what Claude Design should start from, or deliberately leave)

- Dark-only, near-black canvas `#0c0d0e`, light beige text and actions (`#f0e6d2` / `#e8dcc4`). Spec:
  `DESIGN_SYSTEM.md`; tokens: `frontend/src/styles/tokens.css`.
- Approved reference: the wireframe login (`docs/wireframe-login-desktop.png`).
- Desktop is the acceptance target. Rise/fall uses green/red **plus** an arrow, sign or word.

**Open decision:** is the revamp still dark-and-beige, or is Claude Design allowed to propose a new direction? Answer this
before the first Claude Design session, and tell it in the prompt.

## 3. Screen by screen

Each screen has a **Direction** (what we have agreed) and a **Brainstorm** list (loose ideas, not commitments). Add to the
brainstorm lists freely; move an idea up into Direction once it is chosen.

| Order (§4.1) | Screen | Status | Tool to start with |
| --- | --- | --- | --- |
| 1 | Purchase plans | **Built 2026-10-27** (§3.3) | Impeccable critique → reference image → polish |
| 2 | Recommendations | Cluttered; Taste review done (`critique-rec/TASTE_REVIEW.md`) | §4.2 loop: Taste → Claude Design → refine → Impeccable |
| 2½ (flexible) | Sign up / login | Direction OK | Claude Design (imagery + mood) |
| 3 | Market dashboard | Visibility + colour + news | §4.2 loop (Taste `--app`) |
| 4 | Home | Direction OK, last | Claude Design |

### 3.1 Sign-up / sign-in (first priority: it is the first impression)

**Done 2026-10-27:** the wireframe prototype (traced wireframe container ship, dark-and-beige card) is now the real
Clerk login and sign-up (`features/auth/AuthLayout.tsx`, `WireframeVessel.tsx`, `clerkAppearance` in `styles/theme.ts`).
Screenshots: `docs/ui-revamp/login-port/`. The options below are for a later round, if you want to go further.

**Direction (earlier ideas):** replace the current white ship on a grid. Candidates, pick one or two to prototype:

| Option | Idea | Notes |
| --- | --- | --- |
| A | Minimalist, realistic single ship at dusk/night, lit by its deck lights, on dark water | Fits the dark canvas best; light source becomes the beige accent |
| B | Aerial (top-down) view of many ships at anchor or at dock (Singapore anchorage) | Says "scale, logistics"; works as a slow pan or still |
| C | A or B with a subtle price line that rises and falls across the horizon or water | Must read as decorative motion, not a real price. No numbers, or clearly sample ones |

Constraints: motion is allowed on login/signup only (plan guardrail 6); respect `prefers-reduced-motion` (static frame);
the image must not reduce form contrast; keep the file light (compressed video/WebP/AVIF, or CSS/SVG).

**Brainstorm:**
- Split layout: imagery fills the left 55–60%, form on a solid panel on the right. Or full-bleed image with the form on a
  frosted/dark card.
- Login and sign-up share the scene but differ slightly (e.g. login at night, sign-up at dawn; or the camera is closer).
- One-line value statement over the image: "Plan your next MGO purchase with the market in view." (draft copy)
- The ship's deck light or harbour lights pulse very slowly; the price line (option C) is drawn once on load, then rests.
- Small trust strip under the form: "Advisory only · Singapore MGO · Data dated daily" (keep wording honest).

### 3.2 Home (last priority)

**Direction:** a ship whose components map to the app's features (e.g. hull = purchase plans, bridge = market dashboard,
fuel tank = recommendations / cost impact). Hover or click a part to go to that feature.

Risk: novelty can hurt legibility. Always keep plain text links/cards next to (or below) the illustration so a first-time
user and an assessor can navigate without decoding the ship.

**Brainstorm:**
- First visit vs returning: first visit shows the ship + "Create your first purchase plan"; returning shows the next plan
  due (days remaining) and the latest MGO move above the ship.
- Ship parts light up when they have something new (a plan near its deadline, a fresh market import).
- Keyboard and screen-reader path: each ship part is a real link with a label; the illustration is decorative on top.
- Fallback for small screens: the ship collapses into three plain cards.

### 3.3 Purchase plans

**Direction (built 2026-10-27):** follows `assets/inspo/purchase-plans-page/image.png`, without the dashed
"Create plan" grid card (header button only) and without a progress bar (plans have no start date to measure from).
- Summary strip: **Active plans** (deadline not passed) · **Overdue plans** (icon + error colour when > 0) ·
  **Next deadline** ("4 days · 31 Oct", or "Today"). Derived from the loaded plans; no backend change.
- "Your plans" heading with a **Soonest deadline / Largest volume** sort switch (display order only).
- Card: status badge (**Due soon** ≤ 7 days, **On track**, **Overdue**; icon + word) and a "…" menu holding **Delete**
  (same confirmation dialog; focus returns to "…"). Quantity is the large figure ("99 MT"), then "Due 31 Oct 2026",
  then "**4 days** left". Actions: View recommendation (primary, also the whole card) and Edit.
- Today's date stays in the app header chip, as on every other page.
- The "due soon" threshold is `DUE_SOON_DAYS` in `PurchasePlanSummary.tsx` (presentation rule, not stored).

**Brainstorm:**
- Cards show urgency at a glance: days remaining as the largest number, overdue clearly marked (word + icon, not only colour).
- Sort or group by deadline: "This week", "Later", "Overdue".
- A small sparkline or "price since plan created" on each card (needs data check before promising).
- Clicking a card goes straight to its recommendation; edit/delete move into a "…" menu to reduce clutter.

### 3.4 Recommendations (cluttered, needs inspo)

Reached by opening a purchase plan. Today it stacks many blocks with similar visual weight, so nothing reads as the answer.

**What is on the page today** (inventory, so no redesign drops a financial detail):

| Block | Contents |
| --- | --- |
| Header | Eyebrow, "Purchase recommendation", back link |
| Plan summary | Quantity (MT), deadline, days remaining, overdue/after-deadline states |
| Timing guidance / forecast | Dated Ridge estimate, horizon bar, "deadline before forecasts" and unavailable states |
| Timing comparison | 7 / 14 / 30-day horizons, lowest central estimate, uncertainty, reason |
| Cost scenario (`PurchaseImpact`) | Estimated cost on a date, range, experimental news-width method note |
| Recommendation | Action, explanation, evidence grid, reasons, current date |
| Labels and notices | Demo/synthetic label, source label, notices, loading/error/unavailable for each block |

**Claude Design or Impeccable first? (Superseded 2026-10-27 by the §4.2 loop: a Taste review now comes first, and
Claude Design gets the content inventory below so it cannot drop states.)** Original reasoning:
- Impeccable runs on the real page and code, so it sees every field and every state above. Claude Design only sees what you
  paste in, and is likely to drop states (unavailable, overdue, after-deadline) and caveats (experimental, demo) that
  matter here.
- The problem is hierarchy and density, not missing imagery. That is what Impeccable's critique and simplify commands are for.
- It costs less: no export and rebuild loop.

Suggested order:
1. `/impeccable critique` on `/purchase-plans/recommendation` (ready, unavailable and loading states). Ask for a hierarchy
   diagnosis and what to merge, collapse or demote.
2. Decide on the answer-first structure (below) using that critique.
3. Only if you want visual inspiration, take the inventory table above plus screenshots into Claude Design and ask for
   **layout options for this content**, not a new design. Treat the result as a sketch.
4. Build here, block by block, keeping every state and test.

**Constraints (owner, 2026-10-27):** keep **all information** unless it duplicates or is redundant with something
else on the screen, and flag those for a decision first (list: `critique-rec/TASTE_REVIEW.md`, D1-D6, R1). Keep
**three evidence blocks** (timing comparison, estimate for the selected horizon, cost impact); do not merge them.

**Brainstorm:**
- **Answer first.** One hero card at the top: the action ("Buy within 7 days" / "Wait" / "No recommendation yet"), the
  estimated cost range for the plan quantity, and the deadline. Everything else is supporting evidence below it.
- **Progressive disclosure:** method notes, evidence grid and the news-width explanation go in "How we got this" expanders.
- ~~One chart instead of several blocks~~ (ruled out: three evidence blocks stay). A chart can still live inside the
  timing-comparison block: cost range across 7 / 14 / 30 days with the deadline marked as a vertical line.
- **Two-column on desktop:** left = the decision (action, cost, reasons); right = the plan summary pinned as a sticky card.
- **Fewer badges and eyebrows.** Keep one status label per block (Demo, Experimental, Unavailable), in one consistent style.
- **Unavailable state as a calm single card**, not several "unavailable" blocks stacked on each other.
- Inspiration to collect into `assets/inspo/`: brokerage order tickets, flight-price "best time to book" views, loan or
  mortgage calculators (answer + breakdown), weather forecast range charts.

### 3.5 Market dashboard (visibility, colour, news)

**Direction:**
- Better visibility: the key prices should read in one glance (bigger current price, change, date of observation).
- **Colour = price movement:** green for up, red for down, neutral for flat or no comparison, always with an arrow and a
  signed change (+1.2% / −0.8%). This was already requested (plan Phase 6) and needs accessible shades on the dark canvas.
  Decide what "change" compares against for each indicator (previous observation? 7 days?) and show it ("vs 7 Oct").
- **Improve the news display.** Today the "Market pulse" panel shows two GDELT numbers: matched article count and
  average news tone. There are no headlines in the data.

**Brainstorm:**
- Ticker strip across the top: each price with arrow, signed change and colour, like a trading terminal.
- Tint the chart line or area by direction over the selected range (green if the range ended higher). Keep the line
  itself readable when colour is not visible.
- Tiny sparklines in each price card.
- News, using what we already have: show article count and tone as small charts over time, with a plain-language label
  ("Coverage high this week · tone slightly negative") and the existing caveat that tone is not a price signal.
- News, with new data (needs backend work and a team decision): a short list of real headlines with source and time. This
  is a feature change, not restyling, so it goes through `main` first.
- Put the forecast widget next to the history chart so past and forecast read as one story (solid vs dashed line).
- Note: the dashboard has another owner (see `App.tsx`). Check with them before a large layout change.

### 3.6 Other screens (shell, organisation selection)

Default: keep them calm and data-first, restyled within the chosen theme. The ship/water imagery stays on auth and
home; data screens get at most a subtle texture.

**Brainstorm:**
- Date chip in the header becomes "Singapore · 27 Oct 2026" with a small dot that shows data freshness.
- Organisation selection could reuse the auth background so it feels like part of signing in.

## 4. Workflow

1. **Claude Max** for the extra usage on Claude Design + Claude Code.
2. **Skills.** Already installed here: `impeccable` (v4.7.1). Not installed yet: "taste" and Emil Kowalski's motion skill;
   check each one's source before installing. Use the motion skill only near the end (auth motion polish).
   Plan guardrail 9 says our spec outranks Impeccable's taste; revisit that rule if Claude Design sets the new direction.
3. **Assets folder** (created at `docs/ui-revamp/assets/`):
   ```
   assets/
   |_ inspo/   reference photos, screenshots of sites you like, short .md notes on why
   |_ aim/     aim.md: the target in a few lines (this brief can be the source)
   |_ actual/  final images, GIFs, video, SVGs that will ship
   ```
   Files in `actual/` move to `frontend/src/assets/` (or `public/`) when they are wired into the app.
4. **Claude Design.** Paste §1, attach `inspo/` and the current screenshots in `docs/ui-revamp/before/`. Iterate on
   sign-up first, then the shell + one data screen (purchase plans) so the system is tested on real content, then home.
5. **Bring it back here** (see §5) and build phase by phase, with the design as a soft reference: match its feel,
   layout and tokens; keep our behaviour, states and accessibility rules.

### 4.1 Revamp order (rough)

| # | Screen | Why here |
| --- | --- | --- |
| 0 | **Sync with `main`** | `main` owns logic; this branch keeps only design (colours, tokens, layout). Runbook: `SYNC_WITH_MAIN.md`. Done 2026-10-27. |
| 1 | Purchase plans | Smallest data screen. Sets the card, button, badge and empty/error patterns the later screens reuse. |
| 2 | Recommendations | Opened from a plan, so it reuses step 1's patterns. Decides the rise/fall colours the dashboard needs. |
| 2½ | Sign up / login | Optional break between 2 and 3. Otherwise do it just before Home. Independent of the data screens. |
| 3 | Market dashboard | Reuses the rise/fall colours from step 2. Check with the dashboard owner first. |
| 4 | Home | Last, because it links to every other screen and should show them in their final look. |

Before step 1, answer open question 1 (keep dark-and-beige or not). Every later screen depends on it.

### 4.2 Loop for each screen

**Taste diagnoses and deals a direction → Claude Design sketches → refine here → Impeccable finishes.**
Playwright does the mechanical work at every step (opening each state, screenshots, clicking through flows), so
skills and reviewers judge real renders, not code. Use one critic per step: Taste and Impeccable score against
different rules.

Skill settings that protect our spec: Taste runs as an **app screen** (`--app`) for recommendations and the
market dashboard, as a **page** for home and sign-up, always with `--keep palette,type` (Taste deals composition
only) and `--allow <rule>` only where `DESIGN_SYSTEM.md` needs something Taste bans. Working files go to
`.taste-skill/` and `.impeccable/` (both git-ignored); anything worth keeping is copied into
`docs/ui-revamp/critique-<screen>/`.

1. **Sync** with `main` (2-minute drift check in `SYNC_WITH_MAIN.md`). Teammates are still changing these pages.
2. **Capture every state with Playwright.** Open `preview.html`, pick each state from "Demo controls", wait for it
   to settle, and save a 1440px screenshot plus a static HTML snapshot (rendered DOM with inlined styles, scripts
   removed) to `.taste-skill/before/states/`. The snapshots let Taste's inspector measure states that the preview
   only reaches through its controls. Scripts live in `docs/ui-revamp/tools/` (Playwright is installed there).
3. **Taste review (before).** Run `inspect.mjs --app` on the ready-state snapshot and `lint.mjs --app` on the
   feature's source, critique the screenshots with Taste's rubric, and write down the three changes that would
   move the screen most (example: `critique-rec/TASTE_REVIEW.md`). No code changes.
4. **Taste direction.** Deal options with `draw.mjs --app --keep palette,type` (or the page draw for home and
   sign-up). Pick the one that fits the content and note why.
5. **Claude Design sketch.** Give Claude Design the screen's content inventory (every block and state, as in
   §3.4), the before screenshots, the three Taste changes and the chosen direction. Ask for layout options for
   this content only, in our palette. Save what comes back in `assets/inspo/<screen>/` (HTML export preferred,
   screenshots otherwise, §5).
6. **Refine here.** Compare the sketch against the content inventory and the states; agree the direction in chat
   and record it under the screen's **Direction** in §3. Anything that would change behaviour or need backend
   work is called out before building.
7. **Build** inside the existing components with the `--bb-*` tokens; keep `main`'s behaviour, states and tests
   (update a test only when the agreed UI changes how it is reached, and say so).
8. **Impeccable finish.** `harden` (loading, empty, error, success states), then `polish`; targeted commands where
   they fit (`layout`, `distill`, `colorize` for rise/fall). `impeccable detect` on the changed files.
9. **Verify with Playwright, then Taste after.** Walk every state and flow (create, edit, delete, menus, keyboard
   focus) at 1440 and 390, check for console errors and horizontal overflow, then re-run Taste's inspector into
   `.taste-skill/after` and compare before and after side by side.
10. **Commit.** `npm test`, `npm run build`, look at the screenshots yourself, commit on this branch.

Motion (Emil Kowalski's skill) comes after all screens are done, starting with sign up / login.

## 5. Bringing a Claude Design result back into Claude Code

Best to worst:

1. **HTML export / handoff bundle** (download the HTML or zip). Put it in `docs/ui-revamp/reference/claude-design/<date>/`.
   Claude can read exact layout, spacing, colours and copy, and translate them into our tokens and components. This is
   the most accurate option.
2. **PNG screenshots** of each screen (desktop width, plus any hover/empty/error states you designed). Drop them in the same
   folder. Good for overall feel; values are approximate.
3. **Share link** only: useful for you, but Claude here cannot reliably read it. Export instead.

Do not paste exported HTML straight into `frontend/src/`. Treat it as a spec: it will not have our Clerk, routing, test
IDs or loading/error states.

Also possible: Claude Code can create a Design artifact on claude.ai directly from this repo, which skips the export step.

## 6. Open questions

1. Keep dark-and-beige, or let Claude Design propose a new direction (§2)?
2. Sign-up imagery: A, B or C (§3)? Still image, looped video, or CSS/SVG animation?
3. Home "ship of features": committed, or one option among several to explore?
4. Does anyone else on the team need to approve the new direction (e.g. the market dashboard owner)?
5. Recommendations: after the Impeccable critique, is "answer first" the structure we commit to (§3.4)?
6. Dashboard: what does each indicator's change compare against? Do we want real headlines, which needs new data (§3.5)?
