# Whole-app UI audit, 2026-11-05

Method: dual-agent `impeccable` critique (an independent design review and a separate detector scan, kept apart until both finished) plus `impeccable audit` for the technical checks. Report only: no app code changed.

Coverage: 34 preview states at 1440 and 390 across buyer, manager, analyst, admin and signed-out, with hierarchy metrics per state. Organisation selection and the live Clerk form need real auth, so they were reviewed from source only.

| Evidence | File |
|---|---|
| Full design review, with the reasoning behind every finding | [`ui-audit/design-review.md`](ui-audit/design-review.md) |
| Detector scan, each finding verified against source | [`ui-audit/detector-scan.md`](ui-audit/detector-scan.md) |
| Metrics per state | [`ui-audit/hierarchy-metrics.json`](ui-audit/hierarchy-metrics.json) |
| Screenshots | `ui-audit/*.png` |

## 1. The answer

**The complaint is correct, and the cause is about half tokens, half pages.** The tokens make every element the same weight. The pages then fail to choose what matters. Fixing only the tokens gives a tidier flat interface, so the work is two jobs:

1. One person fixes the shared layer (WP-0).
2. Each page owner removes what competes on their page (WP-1 to WP-6).

| Score | Result | Band |
|---|---|---|
| Design health (Nielsen heuristics) | 22 / 40 | Acceptable |
| Technical audit | 13 / 20 | Acceptable |
| Findings | 0 P0 · 29 P1 · 49 P2 · 24 P3 | |

No finding blocks a task. The 13/20 is not a regression from Day 2's 16/20: Day 2 scored the shell, home, plans and market only, and this run adds forecast, organisation and auth.

Severity: P0 blocks a task. P1 causes real confusion or looks broken in a demo. P2 is an annoyance. P3 is polish.

### Why nothing stands out: measured

| Cause | Measurement | Effect |
|---|---|---|
| Surfaces are almost identical | canvas to surface 1.13:1, surface to input 1.08:1 | A card is invisible without a border, so everything gets one. 14 bordered boxes above the fold on the recommendation page and on plans with decisions |
| Text tiers collapse | secondary and placeholder are 1.00:1 apart, supporting and secondary 1.18:1. The quietest text is still 7.7:1 | There is no quiet tier. Captions are as loud as body copy |
| The accent is the text colour | `--bb-action` to `--bb-text` is 1.10:1 | The accent only works as a filled block, and it is spent many times per page. 5 or 6 accent fills above the fold on Purchase plans |
| The type scale has no roles | 11 sizes, five of them 1px apart (12 to 16). 6 weights in use. `base.css` has no heading styles | 20/600 does ten different jobs on one page. Browser defaults leak through (21px/700, 16.38px/700) |
| Buttons have two tiers | filled or outlined only, 8 parallel implementations, heights 44 to 52 | Every minor action is an outlined box. The rail's Refresh (50px) is taller than Submit (48px) |
| Spacing stops at 40px | gaps sit between 16 and 32 everywhere; 100+ off-scale values | Space cannot group anything, so borders do it |

### Why tokens alone will not fix it

| Page problem | Where |
|---|---|
| The answer and the primary action are repeated, not chosen | Recommendation states the verdict 3 times. Plans has a filled primary on every card |
| The largest element carries no information | Home's 116px greeting |
| Caveats come before the content | Forecast widget, Market dashboard |
| Navigation, role and workflow position are hidden | Shell |
| Three areas never touch the tokens | Forecast, organisation, auth |

## 2. Technical audit

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Forecast notes are 11px at 3.6:1. Organisation goes down to 8px. Focus, ARIA and landmarks are otherwise good |
| 2 | Performance | 3 | Geist loads through a render-blocking `@import`. 4.3MB sign-in video. Four polling timers |
| 3 | Theming | 2 | Literal colours: organisation 53, forecast 49, auth 28. Shell, home, plans, recommendations and market have none |
| 4 | Responsive | 3 | 0px overflow in all 34 states. Up to 7 of 15 tap targets are under 44px at 390 |
| 5 | Implementation integrity | 2 | Three identities in one flow. `DESIGN.md` claims no size sits off the scale, but `auth.css`, `forecast.css` and `organisation.css` have 58 literal sizes |
| | **Total** | **13 / 20** | |

**Integrity verdict: fail, with a clear route to pass.** The core app is one system. Sign-in, organisation selection and the forecast widget are three others. A demo walks through all of them in order.

Detector result: 13 warnings, of which 4 are real, 2 are the deliberate Geist choice and 7 are false positives. All 4 real ones are on the forecast widget and agree with FC-7. The detector found no problem the design review had missed. It also passed `frontend/src` clean for contrast, because it cannot resolve those rules from CSS, so a clean source scan proves little.

Technical findings not in the page lists:

- **T-1 · P2 · Render-blocking font.** `auth.css:3` imports Geist from a third-party host. Goes away with AU-1.
- **T-2 · P2 · Docs contradict the code.** `DESIGN.md` and `DESIGN_SYSTEM.md` say every stylesheet is on the scale and that `auth.css` is on the token set. Update them with WP-0.
- **T-3 · P2 · Alias layers.** `--pp-*` and `--sm-*` rename core tokens and hide them from search (`--sm-muted` ×31, `--pp-muted` ×15). Remove them when those files are next touched.
- **T-4 · P3 · Inline styles.** `BuyerDecisionHistory.tsx` has 7 and `ForecastChart.jsx` has 5. The 8 in `RecommendationLoading.tsx` are computed positions and are fine.
- **T-5 · P3 · Six refresh controls beside auto-refresh.** Polling runs at 30s and 60s, so most manual refresh buttons add noise. See X7.

## 3. Token and style proposal (for the brainstorm)

This is a draft. `DESIGN_SYSTEM.md` is the human-approved authority, so nothing here applies until Rae agrees. Every value below was checked for contrast.

**Surfaces: add one step up, so emphasis stops being a hole**

```css
--bb-canvas:         #0c0d0e;  /* keep: page */
--bb-surface:        #1a1b1c;  /* keep: panels */
--bb-surface-raised: #26272a;  /* NEW: selected item, popover, the one emphasised tile. 1.15:1 over surface */
--bb-surface-input:  #121314;  /* keep: inputs and chart wells only */
```

Rule: nothing inside a panel gets a border unless it is a control. Target: at most 4 bordered boxes above the fold.

**Text: three real tiers instead of five near-identical ones**

```css
--bb-text:           #f0e6d2;  /* 13.9:1  values, headings, the answer */
--bb-text-secondary: #b5ac9b;  /*  7.7:1  body copy */
--bb-text-tertiary:  #958e7e;  /* NEW 5.3:1 on surface, 4.6:1 on raised: labels, captions, units, placeholders */
--bb-text-disabled:  #6b665c;  /* NEW 3.0:1  disabled only */
```

Alias `supporting` to secondary, `label` to text and `placeholder` to tertiary, then delete them. The design review proposed tertiary `#8f8878`, but that is 4.24:1 on the raised surface and fails AA, so this report uses `#958e7e`.

**Accent: spend it once.** `--bb-action` is a fill once per view plus the brand mark, a 2px border on the single selected item, and chart series 1. It is never text, icon, filter or chip colour.

**Status tones: the missing layer.** These reuse hues already in the palette, so there is no new colour identity.

```css
--bb-status-positive: #8fd3a4;  /* Approved, Purchased, a saving */
--bb-status-negative: #efb9af;  /* Rejected, Overdue */
--bb-status-pending:  #e2c48a;  /* Awaiting approval, Due soon */
--bb-status-neutral:  var(--bb-text-tertiary);  /* Draft, Withdrawn, On track */
```

Chips: no border, text in the tone, fill `color-mix(in srgb, <tone> 14%, var(--bb-surface))`, always an icon and a word.

**Type: six sizes with named jobs**

| Role | Style | Use | Limit |
|---|---|---|---|
| display | 600 40/44 | The answer (verdict) | One per page |
| figure-lg | 600 32/38 | The lead figure | One per page |
| title, figure | 600 24/30 | Page h1, secondary figures | 3 figures per group |
| heading | 600 16/24 | Section and card h2 | |
| lead | 400 16/24 | One sentence under the display | One per page |
| body, body-strong | 400 or 600 14/21 | Copy, row values | |
| label | 500 12/16 | Labels, captions, meta, chips | |

Retire 13, 15, 18, 20 and 28, and weights 300, 650 and 700. The h1 drops from 32 to 24, so the page name stops competing with the content. This is the largest visual change in the proposal.

**Buttons: one component, three tiers.** Primary (fill, 600, one per view), secondary (outline, 500), ghost (new: no border, for Refresh, Edit, Retry, Ignore). Heights 40 and 32, with 44 minimum under `pointer: coarse`.

**A real bug to fix first:** `base.css:6` `.bb-app button { font: inherit; }` beats `.bb-button` on specificity. Every real `<button>` primary renders at weight 400 and every `<a>` button at 600. Use `:where(.bb-app, .auth-page) button { font: inherit; }`.

**Spacing:** `4, 8, 12, 16, 24, 32, 48, 64`. Rhythm: 4 to 8 between a label and its value, 12 to 16 within a group, 24 for panels, 48 between page sections.

**Missing base primitives:** link style (fixes the browser-blue links), heading roles, one `.bb-page` container (content currently jumps from x=40 to x=120 between pages), `.bb-segmented` (five implementations today) and `.bb-tag` (eleven chip styles today).

Implementation notes: `theme.ts` mirrors token colours and `theme.test.ts` enforces the mirror, so colour changes touch both. Clerk and Recharts read from `theme.ts`.

## 4. Decisions needed before the work is split

These change behaviour or an approved rule, and `PRODUCT.md` says the revamp must not change logic, routes or user flows without a decision.

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| D1 | Approve the token proposal in section 3? | Yes, at least surfaces, text tiers, status tones and the button fix | WP-0 |
| D2 | Persistent navigation, which overturns `DESIGN.md`'s "no persistent rail"? | Yes. Four links in the header, no route changes. A four-role demo needs the structure on screen | NAV-1 |
| D3 | Home: keep the hero, or show role-specific facts? | Keep the photo, cut the greeting to 24px, add 3 or 4 facts from data already loaded | HOME-1, HOME-2 |
| D4 | Why both Accept/Reject/Ignore and Submit for approval? | Keep Submit as the one prominent action and demote the rest to a quiet row with one line of explanation | REC-2 |
| D5 | **Which cost goes to the manager?** A Wait targeting 25 Nov submits the 7-day figure for 02 Nov unless the buyer clicks a column, because the horizon defaults to 7 (`ForecastContext.tsx:11`) | Logic owner should default the submission to the recommended date. This is the one finding that is a behaviour problem, not styling | REC-3, REC-4 |
| D6 | Show the verdict on each plan card? It may need a new API call | Only if the data is already available. Otherwise record it as a product gap | PLAN-3 |
| D7 | Market chart defaults to Brent, not MGO. Is a default value presentation? | Change it. One line, and it is the product's subject | MKT-2 |

## 5. Work packages

Owners are suggestions from `docs/team-overview.md` and the commit history, for Rae to confirm. Size is a rough judgement: S is under half a day, M about a day, L more.

**Run WP-0 first.** The others build on it. Page owners can start the items marked "no WP-0 needed" straight away.

| WP | Scope | Suggested owner | Size | P1 / P2 / P3 |
|---|---|---|---|---|
| WP-0 | Shared layer: tokens, base styles, button, tag, segmented control, links, page container (S1 to S7, T-2) | Luck (shared frontend) or Rae | L | systemic |
| WP-1 | Shell and navigation (NAV, ORG-5) | Luck | M | 3 / 6 / 1 |
| WP-2 | Home (HOME) | Rae | M | 2 / 2 / 3 |
| WP-3 | Purchase plans and decision views (PLAN) | Rae | L | 6 / 12 / 4 |
| WP-4 | Recommendation page (REC) | Rae with the recommendations teammate | L | 8 / 14 / 4 |
| WP-5 | Market dashboard and forecast widget (MKT, FC) | Anjali or Yash | L | 6 / 11 / 6 |
| WP-6 | Sign-in and organisation selection (AU, ORG) | Luck or Nelson | M | 4 / 4 / 6 |

**If time runs short** (freeze is the end of Day 4), do these in order:

1. The `base.css` button bug, link style and status tags. Small changes, seen on every page.
2. **No WP-0 needed:** REC-8 (debug strings in the demo), PLAN-7 (blue link), FC-2 (reversed price colours), MKT-2, ORG-5 and NAV-2 (show the role).
3. Text tiers and the surface step.
4. PLAN-1 and PLAN-2, REC-1 to REC-3, HOME-1 and HOME-2, FC-1 and ORG-1.

Everything P3 can be cut.

**Do not break** (see `design-review.md` section 10):

- The answer-first verdict and its honest labels ("Synthetic demo data", "Approval does not place an order").
- The state coverage and accessibility plumbing: skip link, focus trap, status announcements.
- The compare-buying-dates strip, the one visual only this product could have.

## 6. Corrections to the design review

Checked against the code after the review finished:

- **PLAN-5 lowered from P1 to P2.** The empty manager view in `plans-manager-1440.png` is a preview artefact: the mock service has no `notifications`, but the real `apiService.ts:147` does, so the inbox renders for a live manager. What remains is the missing inbox empty state. Check it with a real manager account.
- **Decision history was never seen populated.** `decision-history-1440.png` shows an error only because the mock lacks `readRecommendationDecisions`. PLAN-18 is valid as a comment on the error state, and PLAN-17 is from source. The populated page still needs a look.
- **REC-4's `rec-awaiting` figure comes from a fixture** (`recommendationScenarios.ts:146` hard-codes 7), but the problem is real in the live code path. See D5.
- **Tertiary text value changed** to `#958e7e` (section 3).
- **REC-18 is probably a fixture effect** of the 2025-dated legacy state. The layout rule is still worth fixing.

Also not verified: the live Clerk form (AU-2 applies only if the mock form is demoed), organisation selection in a browser, hover and focus states in the detector scan, and any screen reader.

## 7. Every finding

One row per finding, most severe first within each package. The fix, file and reasoning for each ID are in [`ui-audit/design-review.md`](ui-audit/design-review.md) section 4. Cross-page inconsistencies X1 to X21 are in its section 5.

### WP-1 Shell and navigation

| ID | Severity | Finding |
|---|---|---|
| NAV-1 | P1 | Navigation is hidden behind a hamburger on desktop |
| NAV-2 | P1 | No identity or role in the shell |
| NAV-3 | P1 | "Manager decisions" is reachable only from the "N unread decisions" chip, which disappears at zero |
| NAV-4 | P2 | The date chip has no label and changes meaning |
| NAV-5 | P2 | Two items are current at once |
| NAV-6 | P2 | "Purchase plans" and "Decision history" share the same icon |
| NAV-7 | P2 | The logo is not a link |
| NAV-8 | P2 | The unread chip looks like a button and wraps at 390px |
| NAV-10 | P2 | The restricted and not-found pages use a fourth type scale |
| NAV-9 | P3 | The active item is a tinted row with a 2px left stripe in the text colour |

### WP-2 Home

| ID | Severity | Finding |
|---|---|---|
| HOME-1 | P1 | The largest type in the product is a greeting |
| HOME-2 | P1 | The four role homes are identical apart from one button label |
| HOME-3 | P2 | The only data is the smallest element |
| HOME-4 | P2 | The primary button carries no count |
| HOME-5 | P3 | The price error state has no retry |
| HOME-6 | P3 | The photo is a hillside harbour town, not Singapore |
| HOME-7 | P3 | A fifth button size |

### WP-3 Purchase plans

| ID | Severity | Finding |
|---|---|---|
| PLAN-1 | P1 | A filled primary button on every card |
| PLAN-2 | P1 | Every approval status looks the same |
| PLAN-3 | P1 | The list does not show the recommendation |
| PLAN-4 | P1 | The empty state is a 1360 by 684px dashed void with one muted sentence and no action |
| PLAN-6 | P1 | The approval inbox and the decisions list are unformatted |
| PLAN-7 | P1 | "Back to purchase plans" is browser-default blue |
| PLAN-5 | P2 | The manager's landing page does not say "approval" (lowered from P1, see section 6) |
| PLAN-8 | P2 | The selected filter uses the accent fill and has square corners |
| PLAN-9 | P2 | The filter floats in the middle of the row |
| PLAN-10 | P2 | Seven controls before the first plan |
| PLAN-11 | P2 | The overview strip is a full-width band for three small integers, one of them usually 0 |
| PLAN-12 | P2 | Quantity is set at 40px weight 300 |
| PLAN-13 | P2 | The decision note is a box inside a card, in the darker "well" colour |
| PLAN-14 | P2 | Card buttons have long, slash-joined labels |
| PLAN-15 | P2 | The load error offers three overlapping retries |
| PLAN-16 | P2 | Source only: the create/edit form has no width rule |
| PLAN-17 | P2 | Decision history uses inline styles, literal colours and a 3px side stripe |
| PLAN-18 | P2 | The Decision history error says the same thing twice and uses a filled button |
| PLAN-19 | P3 | A menu with one item |
| PLAN-20 | P3 | "Finished" does not match the status words |
| PLAN-21 | P3 | Six or seven targets under 44px at 390px |
| PLAN-22 | P3 | Card links have identical accessible names |

### WP-4 Recommendation

| ID | Severity | Finding |
|---|---|---|
| REC-1 | P1 | The answer is stated three times and the page title competes with it |
| REC-2 | P1 | Two decision systems share one 320px card |
| REC-3 | P1 | Five different money figures for one purchase, and the saving is the quietest of them |
| REC-4 | P1 | Exploring a column silently changes what is submitted |
| REC-5 | P1 | On the submitted views the h1 and the status h2 are the same style |
| REC-6 | P1 | The manager is asked to decide before seeing the evidence, in buyer-voiced copy, without the buyer's name |
| REC-7 | P1 | Read-only roles get no read-only marker |
| REC-8 | P1 | Internal identifiers appear in the main content |
| REC-9 | P2 | Headings and figures share 20/600 |
| REC-10 | P2 | The compare strip is outlined more heavily than the answer |
| REC-11 | P2 | "Selected" and "Recommended" look the same |
| REC-12 | P2 | Four chip treatments in one row |
| REC-13 | P2 | The strip takes about 390px of height to show four numbers |
| REC-14 | P2 | The tiles are boxes inside the answer box, and the recommended tile is marked only by an accent border |
| REC-15 | P2 | The stale-quote warning is the least visible text on the page |
| REC-16 | P2 | The error state has no error treatment and offers two retries |
| REC-17 | P2 | The "nothing to recommend" states still render the whole page |
| REC-18 | P2 | The verdict contradicts the notice on `rec-ready-1440.png` |
| REC-19 | P2 | The purchase record is ten equal figures with the outcome last and orphaned |
| REC-20 | P2 | The purchased view still leads with the manager's decision |
| REC-21 | P2 | Loading: the chart placeholder looks like a failed chart |
| REC-22 | P2 | Jargon in the detail footer |
| REC-23 | P3 | `document.title` says "Purchase estimate" |
| REC-24 | P3 | Six targets under 44px at 390px: |
| REC-25 | P3 | The decision group's label is ignored |
| REC-26 | P3 | Accept and Ignore save on one click; Reject asks for a reason |

### WP-5 Market dashboard

| ID | Severity | Finding |
|---|---|---|
| MKT-1 | P1 | The first number is at y≈412 of a 900px viewport |
| MKT-2 | P1 | The chart opens on Brent crude, not MGO |
| MKT-3 | P2 | Four cards in a five-column grid |
| MKT-4 | P2 | Context numbers are the same size as the MGO price |
| MKT-5 | P2 | Each price card holds eight or nine text items in six styles |
| MKT-6 | P2 | A different editorial voice |
| MKT-7 | P2 | The featured card is marked only by a 40% border |
| MKT-8 | P2 | The page is "Market dashboard" in the navigation and tab title, "Market overview." in the h1 and "MARKET OVERVIEW" in the header chip |
| MKT-9 | P3 | "Monthly" looks like a control but is a label |
| MKT-10 | P3 | The y-axis has no unit and the legend describes a single series |
| MKT-11 | P3 | At 390px the refresh button should collapse to an icon but does not |
| MKT-12 | P3 | Two footnote blocks, |

### WP-5 Forecast widget

| ID | Severity | Finding |
|---|---|---|
| FC-1 | P1 | It looks like a different product |
| FC-2 | P1 | Price direction means the opposite of the panel above it |
| FC-3 | P1 | The forecast is placed after the page footnotes, at a different width |
| FC-4 | P1 | Four lines of provenance with raw ISO timestamps come before the number |
| FC-5 | P2 | Three caveat sentences in a bordered box sit between the number and the chart, with a fourth below |
| FC-6 | P2 | The "Weak" badge is unexplained |
| FC-7 | P2 | 11px notes at about 3.6:1 |
| FC-8 | P2 | The time axis is uneven |
| FC-9 | P2 | Currency format differs from the rest of the app |
| FC-10 | P3 | Targets and wrapping at 390px |
| FC-11 | P3 | The loading text has no `role="status"` |

### WP-6 Sign-in

| ID | Severity | Finding |
|---|---|---|
| AU-2 | P1 | Three "not real" notices on the first screen (P1 only if the mock form is demoed, else P3) |
| AU-1 | P2 | Third typeface and a private token set |
| AU-3 | P2 | The h1 is the marketing tagline |
| AU-4 | P3 | The hero promises forecasts |
| AU-5 | P3 | A different focus style |
| AU-6 | P3 | 390px |
| AU-7 | P3 | Small targets |

### WP-6 Organisation selection

| ID | Severity | Finding |
|---|---|---|
| ORG-1 | P1 | A different brand between sign-in and Home |
| ORG-2 | P1 | A landing-page composition for a utility step |
| ORG-5 | P1 | The live header's role badge is 10px teal, and it is the only role indicator in the app |
| ORG-3 | P2 | Type below the 12px floor |
| ORG-4 | P2 | The four-role explanation is the quietest content and is hidden on phones |
| ORG-6 | P3 | Filler copy |
| ORG-7 | P3 | Teal focus ring |
