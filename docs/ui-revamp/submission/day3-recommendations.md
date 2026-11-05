# Day 3: recommendations page taste pass, 2026-11-05

Scope from the 5-day plan: `design-taste-frontend` in app-screen mode on `/purchase-plans/recommendation`, palette and type
kept, every state and all four roles (buyer, manager, analyst, admin). Branch `revamp/day3-recommendations`.
Screens: `day3-recommendations/` (before and after, 1440 and 390). Skill: tasteskill v2.1.5, `inspect.mjs --app` and
`lint.mjs --app`; captures by `docs/ui-revamp/tools/capture-states.mjs` (new, reusable for the other pages).

## States and roles captured

17 states from the preview app, each at 1440 and 390, as screenshots and as static snapshots for the inspector:

| Role | States |
|---|---|
| Buyer | Wait, Monitor, Buy now, loading (5 steps), no horizon fits (legacy fixture), unavailable, error, no saved plan, awaiting manager, approved, rejected, withdrawn, purchased |
| Manager | review (submitted, approve / reject form) |
| Analyst | Wait (read-only) and awaiting manager (read-only); two new preview states, `rec-analyst` and `rec-analyst-awaiting` |
| Admin | the shell's "Purchase-plan access is restricted" page (the route is role-guarded) |

## Measurements, before → after (Wait state at 1440 unless noted)

| Measure | Before | After |
|---|---|---|
| Inspector | 1 FAIL (selected column's ring drawn as a shadow), 7 WARN | **0 FAIL**, 4 WARN (all defended below) |
| Inspector, no-horizon state | 3 FAIL (2 striped-gradient columns, ring shadow) | 0 FAIL |
| Inspector, manager review | 0 FAIL, 4 WARN | 0 FAIL, 5 WARN |
| Lint | 2 FAIL (two gradients), 13 WARN | 0 FAIL, 11 WARN (the kicker labels, defended below) |
| Type sizes in use | 12 (11 to 40px; 11px chips under the 12px floor) | 8, all on the token scale: 12 / 13 / 14 / 16 / 20 / 24 / 32 / 40 |
| Panel radii | 4 (14, 12, 10, 0) | 1 (`--bb-radius-card`) |
| Accent on chrome | icon tile, Total toggle fill, Accept button, selected ring | none: the accent is on the recommended data, the one primary button and the status pill |
| Horizontal overflow, 17 states × 2 widths | 0 | 0 |
| Tests | 286 pass | 287 pass (32 files); `tsc` clean; `vite build` clean |

## Critique, round 1 (before)

```
Seen in one second: the answer ("Wait", 40px) over two equal price tiles and a beige icon square; a dense right rail.
Screen's question: "When should I buy this plan, and what will it cost?"
Answered by: the verdict, once (good); but the answer figure (USD 58,687) is the same size as today's price.
1. Biggest thing: yes. Largest figure: no, the two tiles tie at 26px.
2. Edges: equal 80px margins. Voids: the submitted-status card holds a 60–90px blank band above its button, and the
   purchased state ends with an empty section; the "no forecast fits" note is a bordered box with one sentence floating.
3. Colour: the accent sits on seven things (icon tile, Submit, Accept, Total toggle, Recommended chip, selected ring,
   recommended bar). Two filled primaries in one rail.
4. Numbers: "Confirm a current supplier quote" said three times (rail note, detail foot, amber notice); the amber
   "Dated Ridge estimate" notice repeats the footnote's anchor/target dates and the detail foot's source label; the
   no-horizon tile note repeats the deadline card. Facts that disagree: see "Flagged, not changed".
5. Zeros and dashes: "Compared with buying today: Reference price" is a word in a 20px value slot.
7. Phone: nav folds, rail sits between answer and evidence; the 32px title wraps to two lines at 390.
Tells: icon in a tinted square; uppercase tracked label ("YOUR DECISION ON THIS RECOMMENDATION") with inline styles and
a literal #f2849e; striped gradient on late columns; shimmer gradient and glow keyframe; four radii.
Roles: analyst and manager see the buyer's Accept / Reject / Ignore on a draft plan although they cannot act on it.
Scores: design 6.5 · usability 7 · content 7.5 → 6.9 (capped by the FAILs).
```

## Three changes that moved the screen most

1. **One answer figure, data-only accent.** The recommended tile's figure steps up to 32px and its sibling down to 24px;
   the verdict icon is plain ink beside the heading (no tinted tile); the Total/Per MT toggle marks selection with a
   neutral step; Accept / Reject / Ignore are three peer secondary buttons so Submit for approval is the rail's one primary.
2. **Say each caveat once.** The limitations notice renders only when it carries a warning the explored-date detail does
   not already show (stale quote, target after the deadline, no Ridge run). Its source label moved into the detail foot
   ("Executed Ridge · experimental bounds" · "from the 26 Oct 2026 quote"), the supplier-quote reminder lives in the rail
   note only, and the no-horizon state drops the tile note that repeated the deadline card. "Reference price" became a
   grey dash with an accessible label.
3. **One token scale, one radius, flat surfaces.** Every size is a `--bb-text-*` token (chips and the deadline mark rose
   from 11px to the 12px floor); every panel uses `--bb-radius-card`; late columns sit one tone step back instead of
   striped; selection is a 2px border, not a ring shadow; placeholders breathe by opacity, no shimmer gradient or glow.

Also in this pass: the submitted-status card's stacked margins went, and a purchased plan no longer renders an empty
"next action" section; "Plan recommendation · WAIT" reads "· Wait"; the decision log is on classes and tokens with
sentence-case labels and a real `<label>` for the rejection reason; sentence-long legacy verdicts step down one size so
they hold two lines on a phone; the deadline column widened to 72px so its date no longer wraps; the page title is 24px
on a phone.

**Behaviour change, stated:** read-only roles (manager, analyst) no longer see the buyer's Accept / Reject / Ignore
block on a draft plan, and their rail reads "Recommendation" instead of "Your decision". The buyer's experience is
unchanged. Two tests changed their expected heading text from `WAIT` to `Wait` (`RecommendationApproval.test.tsx`).

## Critique, round 2 (after)

```
Seen in one second: "Wait" and USD 58,687 in a beige-bordered tile; four price columns on one scale; one beige button.
1. The answer is the biggest thing and the answer figure leads (32 vs 24px).
2. Equal margins; no blank bands in any status card; nothing stops short.
3. Accent on the recommended figure, column, chip and the one primary. Status colour on the rejected icon only.
4. Each caveat once; dates and totals agree between the tiles, columns and detail (except the flagged signal figure).
5. Dash for not-applicable; zeros print as zeros.
7. Phone: title 24px, columns stack as rows with their plots, three decision buttons fit one row.
Scores: design 7.5 · usability 8 · content 8 → 7.8. Still short: the backend explanation's "$1248.65/mt" formatting
and the signal-vs-column figure mismatch below.
```

## Defended warnings

- **palette-cream**: the beige text/action colour is the approved brand palette (`DESIGN_SYSTEM.md`), kept by instruction.
- **heavy-borders** (10 panel borders at "12.87:1"): the inspector reads the 40 % alpha control border as opaque. The
  comparison columns are buttons and keep the 3:1 control outline the design system requires; panels use the 15 % border.
- **panel-void** in the comparison columns: the blank is the shared price scale (each bar sits at its price); the
  columns are a chart, not stretched cards.
- **ragged-row** (answer card vs rail card): the rail is a sticky summary beside a scrolling column, not a peer card.
- **unused-canvas**: the page is a centred 1280px canvas with equal 80px margins; the inspector counted the header's
  menu button as a sidebar.
- **eyebrow** (11 `rec-kicker` labels, lint): 13px sentence-case labels naming the value beneath them ("Recommended
  action", "Your decision", "Approval status"), which the app-screen rules allow; none is uppercase or tracked.
- **edge-text** at 390 in the manager view: one list inside the closed "How this recommendation was calculated" details;
  its bullet indent is what the inspector measured. Left as is.

## Flagged, not changed (product or data, not design)

- **Two figures for one date.** In the Wait state the answer tile says "Buy on Wed 25 Nov · USD 58,687" (the weighted
  signal from the two eligible forecasts nearest the deadline) while the 30-day column for the same date shows a central
  estimate of USD 58,280 and the explored detail a range of 55,460–61,100. A grader will ask which is the price. Either
  the tile should show the column's central figure, or its label should say "blended signal". Owner's call.
- **Explanation copy formatting.** The backend explanation writes "$1248.65/mt" and "$103.35/mt" while the UI writes
  "USD 1,352/MT". `readableDates` fixes dates only; the money format belongs in the recommendation service.
- **Legacy fixture.** The "no horizon fits" preview state is dated 2025 against 2026 forecasts, so it prints "-345 days
  ago". Preview data only.
- **Market-page eyebrows** (Day 2 carry-over) remain for the market pass.

## Verification

| Check | Result |
|---|---|
| `vitest run` (32 files) | 287 passed |
| `tsc --noEmit` | clean |
| `vite build` | clean |
| `lint.mjs --app` on `features/recommendations` | 0 FAIL, 11 WARN (kickers, defended) |
| `inspect.mjs --app` on Wait, no-horizon and manager-review snapshots, 1440 / 768 / 390 | 0 FAIL each |
| 17 states × 1440 and 390 | 0px horizontal overflow; screenshots in `day3-recommendations/` |

Not verified: the live backend (feeds are stale, see the plan's risk section); screen-reader pass; Windows high-contrast.

## Recommended next

1. Decide the signal-vs-column figure (above) before the demo; it is the one number a grader can catch.
2. Day 3 continues with Purchase plans, then Home, using `capture-states.mjs` with the `multiple` / `home` preview keys.
3. Day 4 `dataviz`: the comparison columns could take `--bb-price-*` for cheaper / dearer than today.
