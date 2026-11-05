# Independent design review of Bunker Buddy

See `../ui-audit.md` section 6 for corrections made after this review, including the PLAN-5 severity and the tertiary text value.

Reviewed 2026-11-05 from the 1440px and 390px screenshots in `ui-audit/`, the day-2 market screenshots, `hierarchy-metrics.json`, and source. No detector or linter was run. Organisation selection, the live header role badge and the create/edit plan form were reviewed from source only (no screenshot), and are marked "source only".

Paths are relative to the repository root.

Contrast ratios are computed by hand from the token hex values with the WCAG formula. Counts such as "14 boxes above the fold" come from `hierarchy-metrics.json`.

---

## 1. Verdict on the owner's belief

The complaint is correct: there is no visual hierarchy. The belief about the cause is about half right.

**Where it is right.** Six causes sit in `tokens.css`, `base.css` and `app.css`: a text ladder whose lowest step is still 7.7:1, three surfaces within 1.13:1 of each other, an accent that is 1.10:1 from the text colour, an 11-step type scale with no roles, a button system with two tiers and a specificity bug, and a spacing scale that stops at 40px. These make every page look the same weight no matter who builds it.

**Where it is wrong.** Fixing those will not produce hierarchy on its own, because the pages have not decided what matters most. Home spends the largest type in the product on a greeting. Purchase plans puts a filled primary button on every card. The recommendation page states its answer three times and its cost with five different numbers. The forecast widget, organisation selection and sign-in do not use the token set at all, so no token change reaches them. Navigation and role identity are hidden, which is an information-architecture decision.

Treat it as two jobs: one person fixes the shared layer (section 3), and each page owner then removes the competing elements on their page (section 4). Doing only the first gives a tidier flat interface.

---

## 2. Design specificity

**Overall.** The content is specific to bunker procurement (tonnes, deadlines, MGO quotes, an advisory verdict, an approval chain). The visual language is not: bordered dark cards, outlined pills, KPI tiles and a hero photo. Change the labels and Purchase plans is any task tracker and Market is any analytics dashboard. Only two things could not be reused by an unrelated product: the "Compare buying dates" strip (a shared price scale with a deadline marker) and the plan card that leads with tonnage and days left.

| Page | Verdict |
|---|---|
| Sign in / sign up | Generic split-screen auth with stock footage. The tagline is the only product signal. |
| Organisation selection | A marketing landing page for a utility step, in a navy and teal brand used nowhere else. |
| Shell / navigation | Generic. A hamburger and a logo. Nothing shows role, organisation or workflow position. |
| Home | A marketing hero. The one product fact (MGO price) is the smallest element. |
| Purchase plans | Specific data model, generic card grid. The product's main output (Buy / Wait / Monitor) is absent from the list. |
| Recommendation | The most specific page. The verdict and the compare strip are grounded in the product; the rail and tiles are generic. |
| Market dashboard | Generic KPI row, chart, table and side panel. Leads with Brent, not MGO. |
| Forecast widget | A different product's widget (navy, teal, red and green) pasted under the dashboard. |

---

## 3. Hierarchy diagnosis: system-level causes, ranked by impact

### S1. One emphasis device, used at every level: the 1px bordered box

**Evidence.** `--bb-canvas` #0c0d0e, `--bb-surface-input` #121314 and `--bb-surface` #1a1b1c have relative contrast 1.00 : 1.05 : 1.13. A card is invisible without its border, so every grouping gets `border: 1px solid` plus `--bb-radius-card`: page panel, tile inside panel, note inside card, column, chip. `rec-wait-1440.png` has 14 bordered boxes above the fold and `plans-decisions-1440.png` has 14. The compare columns use the heavier `--bb-border-control` (40% beige, `recommendations.css:99`) while the answer card that contains the verdict uses `--bb-border-subtle` (15%, `:24`), so the evidence strip is outlined more strongly than the answer. Passive chips ("On track", "Eligible", "Observed", "Approved") also use the 40% border (`purchase-plan.css:83`, `:177`, `recommendations.css:112`), which gives a label the same outline as a button. The only nested fill, `--bb-surface-input`, is darker than its parent, so emphasis inside a card reads as a hole (`.pp-decision`, `.rec-status-comment`).

**Change.**
```
--bb-canvas:         #0c0d0e   page (keep)
--bb-surface:        #1a1b1c   panels (keep)
--bb-surface-raised: #26272a   NEW. selected item, popover, hovered row, the one emphasised tile
                               (1.16:1 over surface, 1.30:1 over canvas)
--bb-surface-input:  #121314   inputs and chart wells only (keep, narrow its use)
--bb-border-subtle:  15% beige panel edge and hairline dividers only
--bb-border-control: 40% beige inputs and secondary buttons only
```
Rules: a panel sits on the canvas with a fill and a subtle border. Nothing inside a panel gets its own border unless it is an interactive control. Groups inside a panel are separated by space or one hairline. Emphasis inside a panel uses `--bb-surface-raised`. Passive chips lose their border and take a tinted fill (see S4). Target: at most 4 bordered boxes above the fold on any page.

### S2. No type roles: headings, figures and the page title share styles

**Evidence.** `tokens.css:68-78` defines 11 sizes (12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40) with comments, not roles, and five of them are 1px apart. `base.css` defines no heading styles, so each feature invents its own and browser defaults leak through.
- 20px/600 is the section heading ("Compare buying dates"), the detail heading, the rail action, all four column values and all three detail values: ten uses of one style on `rec-wait-1440.png` (`recommendations.css:51`, `:87`, `:124`, `:137`).
- The page title competes with the answer: h1 "Purchase recommendation" 32/600 sits above the verdict "Wait" 40/600, a ratio of 1.25. On the submitted views the h1 and the status h2 are identical at 32/600 (`hierarchy-metrics.json`: rec-awaiting, rec-approved, rec-rejected, rec-review).
- Purchase plans: h1 32/650, h2 "Your plans" 16/600, h3 (card title) 14/400. The section heading is half the title and smaller than the 40/300 quantity beside it.
- Leaked browser defaults: "Recorded purchase" h2 21px/700 (`PlanLifecycleActions.tsx:100`), "Manager review" h3 16.38px/700 (`ManagerDecisionForm.tsx:31`), status-page h1 28/700 (`app.css:20`).
- Six weights are in use: 300, 400, 500, 600, 650, 700. Figures are 300 on Purchase plans and 600 on Recommendation.
- 12px, 13px and 14px at weight 400 carry almost all text (rec-wait: 1,640 + 998 + 426 characters), so label, body and meta cannot be told apart by size.
- `DESIGN.md` says no stylesheet sets a size outside the scale. `auth.css` has 19 literal sizes, `forecast.css` 20, `organisation.css` 19 (down to 8px), and Home sets 116px in `HomePage.tsx:10`.

**Change.** Six sizes, two weights (plus 500 for labels and buttons), each with one job:

| Role token | Value | Colour | Use | Limit |
|---|---|---|---|---|
| `--bb-type-display` | 600 40/44, -0.03em | text | The answer (verdict) | One per page |
| `--bb-type-figure-lg` | 600 32/38, tabular | text | The lead figure | One per page |
| `--bb-type-title` and `--bb-type-figure` | 600 24/30 | text | Page h1; secondary figures inside panels | Figures: 3 per group |
| `--bb-type-heading` | 600 16/24 | text | Section and card h2 | |
| `--bb-type-lead` | 400 16/24 | text | One sentence under the display | One per page |
| `--bb-type-body` / `-strong` | 400 or 600 14/21 | secondary / text | Copy; row values, list titles | |
| `--bb-type-label` | 500 12/16 | tertiary | Labels, captions, meta, chips, units | |

Retire 13, 15, 18, 20 and 28. Drop the h1 from 32 to 24 so the page name stops competing with the content. Remove weights 300, 650 and 700. Put h1 to h3 on these roles in `base.css` so a forgotten heading cannot fall back to browser defaults.

### S3. The text ladder is compressed into one tier

**Evidence.** On `--bb-surface`: `--bb-text` 13.9:1, `--bb-text-label` 12.2:1, `--bb-text-supporting` 9.1:1, `--bb-text-secondary` 7.7:1, `--bb-text-placeholder` 7.7:1 (`tokens.css:21-25`). Five tokens, and the quietest is still above AAA. Supporting and secondary differ by a factor of 1.18 and are used interchangeably (`.recommendations p` is supporting, `.rec-kicker` is secondary). Placeholder text has the same contrast as real labels. There is no quiet tier, so captions, units, provenance and footnotes are as loud as body copy.

**Change.**
```
--bb-text:           #f0e6d2  13.9:1  values, headings, the answer, input text
--bb-text-secondary: #b5ac9b   7.7:1  body copy and descriptions (same value, wider job)
--bb-text-tertiary:  #8f8878   4.9:1 on surface, 5.5:1 on canvas. NEW. labels, captions, meta, units, placeholders
--bb-text-disabled:  #6b665c   3.0:1  disabled only
```
Alias `--bb-text-supporting` to secondary, `--bb-text-label` to text, `--bb-text-placeholder` to tertiary, then delete them.

### S4. The accent is the text colour, it is spent on everything, and there are no status tones

**Evidence.** `--bb-action` #e8dcc4 against `--bb-text` #f0e6d2 is 1.10:1. As ink or as a border it signals nothing: the verdict icon (`recommendations.css:34`), the recommended tile border (`:41`), the approved icon (`purchase-plan.css:182`) and the Home greeting are indistinguishable from plain text. It only works as a fill, and the fill is spent many times per page: `multiple-1440.png` has 5 accent fills above the fold and `plans-decisions-1440.png` has 6 (brand mark, "Create plan", the selected "All" filter, and a full-width button on every card). On the compare strip the 2px accent border means both "selected for detail" and "recommended" (`recommendations.css:102`, `:122`). `success-*` is still pending in `tokens.css`, so "Rejected", "Withdrawn", "Approved" and "Submitted for approval" are four identical outlined rectangles (`plans-decisions-1440.png`).

**Change.** Accent rule: `--bb-action` appears as a fill once per view (the primary action) plus the brand mark, as a 2px border on the single selected item, and as chart series 1. Never as text or icon colour, never on filters or chips. Add status tones from hues already in the palette:
```
--bb-status-positive: #8fd3a4  Approved, Purchased, a saving
--bb-status-negative: #efb9af  Rejected, Overdue, costlier
--bb-status-pending:  #e2c48a  Awaiting approval, Due soon
--bb-status-neutral:  var(--bb-text-tertiary)  Draft, Withdrawn, On track
```
Chips: no border, text in the tone, fill `color-mix(in srgb, <tone> 14%, var(--bb-surface))`, always with an icon and a word.

### S5. Buttons: two tiers, a weight bug and eight parallel implementations

**Evidence.**
- `app.css:11-14` has only filled and outlined. Every other action (Refresh, Edit, Retry, Withdraw, Accept, Reject, Ignore, Mark as seen) becomes a 40% outlined box. The recommendation rail holds five buttons, and "Refresh prices" (50px, outlined, full width) is taller than the primary "Submit for approval" (48px).
- `base.css:6` `.bb-app button { font: inherit; }` has specificity (0,1,1) and beats `.bb-button` and `.pp-button` (0,1,0). Every real `<button>` primary renders at weight 400 and every `<a>` styled as a button renders at 600. Visible in the screenshots: "Create plan", "Retry", "Record purchase", "Copy to new draft" and "Approve recommendation" are regular; "View recommendation", "Create purchase plan" and "Back to Home" are semibold. On Purchase plans the page-level primary is lighter than the card-level one.
- Parallel systems: `.bb-button` (50px), `.pp-button` (44px, `purchase-plan.css:34`), `.rec-submit` (48px), `.bb-home-cta` (52px, radius 10), `.auth-submit` (48px, radius 8), `.sm-refresh`, `.forecast-retry` (teal), `.bb-org-signout` (navy).

**Change.** One component with three tiers and two sizes:
- Primary: accent fill, 600. One per view.
- Secondary: 1px `--bb-border-control`, text colour, 500.
- Ghost (new): no border, secondary text, `--bb-surface-raised` on hover. For Refresh, Edit, Retry, Mark as seen, Ignore.
- Heights: 40px default, 32px small, 44px minimum under `@media (pointer: coarse)`. Remove 50px.
- Fix the bug with `:where(.bb-app, .auth-page) button { font: inherit; }` (zero specificity).
- Delete `.pp-button`, `.sm-refresh`, `.forecast-retry`, `.bb-org-signout` and `.auth-submit` in favour of the shared one.

### S6. Spacing: a linear scale capped at 40px, so inner and outer gaps are equal

**Evidence.** `tokens.css:81-89` runs 4 to 32 in steps of 4, then 40. There is no section-sized step, so every gap lands between 16 and 32. Recommendation: panel padding 32 and 28, gap between panels 28, gap inside the answer 24 (`recommendations.css:19-25`). Purchase plans: header to overview 22, overview to list 32, list heading to grid 16, grid gap 24, card padding 24. Space does not group anything, which is why borders do the grouping (S1). Feature CSS also uses off-scale literals: 34/40/32 page padding, 30/31 card padding, 22, 26, 27, 18, 14, 10, 6.

**Change.** `4, 8, 12, 16, 24, 32, 48, 64`. Drop 20 and 28, add `--bb-space-12: 48px` and `--bb-space-16: 64px`. Rhythm: 4 to 8 between a label and its value, 12 to 16 between items in a group, 24 for panel padding and between panels, 48 between page sections.

### S7. Base primitives are missing, so every feature rebuilds them

**Evidence.** `base.css` is 19 lines with no link style, heading style, page container, segmented control or chip.
- Links: any `<a>` without a class is browser blue. "Back to purchase plans" on Manager decisions is `rgb(158,158,255)` (`manager-decisions-1440.png`, `App.tsx:110`). Also unstyled: "View previous plan" (`PurchasePlanSummary.tsx:58`), "View copied plan" (`PlanLifecycleActions.tsx:90`), "View plan" (`BuyerDecisionHistory.tsx:58`).
- Page container: Purchase plans starts at x=40 (`purchase-plan.css:12`), Recommendation and Decision history at x=120 (`recommendations.css:4`, max-width 1280), the forecast section is 1560 wide (`MarketDashboard.jsx:10`). Content jumps 80px sideways between the list and the detail page and does not align with the header.
- Segmented controls: five implementations (see section 5).

**Change.** Add to `base.css`: `.bb-app a` (text colour, underline), heading roles, `.bb-page` (one max-width, 1280px suggested, with `--bb-page-pad`, and align the header's content to it), `.bb-segmented` (selected is `--bb-surface-raised` plus text colour, never the accent) and `.bb-tag`.

### S8. Three areas are not on the token set

`forecast.css` (navy #0c1524, teal #00d4c8, red #f85149, green #3fb950, sizes 10 to 22px), `organisation.css` (navy #071422, teal #35d0c3, Inter, sizes 8 to 56px) and auth (`--bb-auth-*`, 14 duplicate tokens, Geist, radius 8 and 20). This is a consistency failure more than a hierarchy one, but it is the first thing an assessor will notice: three typefaces and three palettes in one flow.

### Causes that are not in the tokens

| | Cause | Where |
|---|---|---|
| C1 | Pages repeat their answer and their primary action instead of choosing one | Recommendation (verdict stated 3 times), Purchase plans (a primary on every card) |
| C2 | The largest element carries no information | Home greeting |
| C3 | Provenance, caveats and meta come before the content | Forecast widget, Market dashboard |
| C4 | Navigation, role and workflow position are hidden | Shell |
| C5 | Density swings 13 times within one flow: 28 words on Home, 73 on Purchase plans, 376 on Recommendation | Whole flow |

### Where the eye lands, per page

| Page | First | Second | Third | What it should be |
|---|---|---|---|---|
| Sign in | Ship footage | Tagline 52px | "Sign in" title and button | Acceptable for an auth page |
| Home | "GOOD MORNING, JOHN" 116px | The lit ship | "Go to your plans" | What needs this role's attention today, then the price |
| Purchase plans | The full-width filled "View recommendation" bars | "Purchase plans" h1 | "Create plan" and the filled "All" filter | The plan that needs action, then its status, then quantity and deadline |
| Plans with decisions | Five equal filled bars | Five 40px quantities | Decision notes | Approved (record purchase) and Rejected (revise) first |
| Recommendation | "Wait" 40px and the h1 32px together | "USD 58,687" and "Submit for approval" | Four column figures at 20px | Verdict, then the saving, then one action |
| Submitted view | h1 and status h2, identical | The action button | Three equal figures | Status, then next step, then evidence |
| Market | "Market overview." 40px | The chart line | Four equal 32px prices | MGO price and direction, then history |
| Forecast widget | Red "$1,275" | Teal "Refresh forecast" | Chart | Forecast and range, then chart, then caveats |

---

## 4. Per-page findings

P0 blocks a task. P1 causes significant confusion or looks broken in a demo. P2 is an annoyance. P3 is polish. I found no P0: every task can be completed.

### 4.1 Auth (sign in, sign up)

Screens: `login-1440.png`, `signup-1440.png`, `login-390.png`. The form shown is the mock `AuthPage`; the live build uses Clerk inside the same layout, so check AU-2 against the live form.

- **AU-1 · P2 · Third typeface and a private token set.** `auth.css:3` imports Geist; `tokens.css:49-63` adds 14 `--bb-auth-*` tokens that duplicate core ones; radii are 8 and 20, not 5 and 10; controls are 46 and 48px. Why: the typeface changes at the moment of sign-in. Fix: use `--bb-font`, alias auth tokens to core tokens, use the shared button and input.
- **AU-2 · P1 if the mock form is demoed, else P3 · Three "not real" notices on the first screen.** Disabled Microsoft and Google buttons come first with "Social sign-in is not available yet." (`AuthPage.tsx:68`), then "Remember me (available after integration)" (`:73`), then "Demo only" (`:74`). Why: the assessor's first impression is a list of missing features. Fix: remove the social buttons and the checkbox until they work; keep one demo note.
- **AU-3 · P2 · The h1 is the marketing tagline.** "Sign in" is an h2. `hierarchy-metrics.json` reads the h1 as "A clearer course.A smarter purchase." with no space between the two lines. Fix: make "Sign in" the h1, demote the tagline to a paragraph, add a space or line break element.
- **AU-4 · P3 · The hero promises forecasts.** "Forecasts for Singapore MGO" leads, while `PRODUCT.md` says forecasts are not yet validated. Fix: lead with plans and deadlines.
- **AU-5 · P3 · A different focus style.** Inputs use a 3px glow with `outline: none` (`auth.css:95`); the app uses a 2px outline at 4px offset. Fix: use the shared ring.
- **AU-6 · P3 · 390px.** Social button labels wrap to two lines and the hero pushes the submit button to y≈1030 of 1143. Fix: shorten the hero to about 200px on phones.
- **AU-7 · P3 · Small targets.** Two targets under 24px at 390 (`hierarchy-metrics.json`), including the 16px checkbox.

### 4.2 Organisation selection (source only)

- **ORG-1 · P1 · A different brand between sign-in and Home.** Navy #071422 with a radial gradient, teal #35d0c3, Inter, 18px radius, a 70px shadow (`organisation.css:2-14`, `:44`). Why: three consecutive screens show three identities. Fix: move it onto `--bb-*` tokens and the shared font.
- **ORG-2 · P1 · A landing-page composition for a utility step.** A 36 to 56px h1, an eyebrow with a glowing dot, a decorative route drawing with three slogans, a numbered role list and a footer slogan (`OrganisationSelectionFrame.tsx:26-43`, `:60`). The task is choosing one item from a list. Fix: one centred panel on the app canvas with a 24px title, the organisation list and the invitation note.
- **ORG-3 · P2 · Type below the 12px floor.** 8px (`organisation.css:68`), 9px (`:65`), 10px (`:25`, `:36`, `:72`), 11px (`:41-43`). Fix: 12px minimum.
- **ORG-4 · P2 · The four-role explanation is the quietest content and is hidden on phones.** 11 to 12px in muted blue, `display: none` at 760px and below (`organisation.css:84`). Why: it is the one thing here that helps an assessor. Fix: keep it, at body size, as a short "Your role decides what you can do" list.
- **ORG-5 · P1 · The live header's role badge is 10px teal, and it is the only role indicator in the app.** `OrganisationAccess.tsx:27-36`, `organisation.css:66-73`; the "ORGANISATION" label is 8px. In the preview screenshots no role appears at all. Fix: see NAV-2.
- **ORG-6 · P3 · Filler copy.** "Plan with clarity", "Stay connected", "Move together", "FOUR ROLES. ONE TEAM." Fix: delete.
- **ORG-7 · P3 · Teal focus ring** (`organisation.css:18`). Fix: `--bb-focus`.

### 4.3 Shell and navigation

Screens: `navigation-1440.png` and the header in every app screenshot.

- **NAV-1 · P1 · Navigation is hidden behind a hamburger on desktop.** A 64px header with about 1,000px of empty space hides four destinations in a modal (`AppShell.tsx:19`, `:54-77`). Why: every move costs two clicks and a scrim; the current location is invisible; the per-role difference in available pages, which is what the demo is meant to show, is never on screen. Fix: put the same links in the header as a persistent row and keep the dialog below about 900px. No routes or logic change. This contradicts the `DESIGN.md` line "No persistent rail"; see the questions in section 10.
- **NAV-2 · P1 · No identity or role in the shell.** The four Home screenshots differ only in a button label. The user's name appears only in the Home greeting. Fix: a header item on the right reading "John · Buyer · Organisation name" at 12 to 14px in the app palette, opening a menu with Sign out.
- **NAV-3 · P1 · "Manager decisions" is reachable only from the "N unread decisions" chip, which disappears at zero.** `AppShell.tsx:24` is the only link to `/purchase-plans/notifications`. Why: once everything is marked seen, the page cannot be reached. Fix: add it to the navigation, or merge it into Decision history as a tab.
- **NAV-4 · P2 · The date chip has no label and changes meaning.** "24 Oct 2025" is the application date that drives days remaining. On Market the same chip reads "MARKET OVERVIEW" (`AppShell.tsx:22`). Fix: label it "Today" and remove the Market variant.
- **NAV-5 · P2 · Two items are current at once.** On `/purchase-plans/decisions` both "Purchase plans" (`startsWith`, `AppShell.tsx:72`) and "Decision history" (`:73`) get `aria-current="page"`. Fix: exact match for the parent.
- **NAV-6 · P2 · "Purchase plans" and "Decision history" share the same icon** (`AppShell.tsx:72-73`). Fix: a distinct icon, or drop the icons.
- **NAV-7 · P2 · The logo is not a link.** `Brand.tsx:9` renders a span. Fix: link it to `/home`.
- **NAV-8 · P2 · The unread chip looks like a button and wraps at 390px.** A 40% outline (`app.css:39`); `max-width: 100px` forces two lines beside the brand (`plans-decisions-390.png`). Fix: a count badge on the navigation item.
- **NAV-9 · P3 · The active item is a tinted row with a 2px left stripe in the text colour** (`app.css:31`). Fix: `--bb-surface-raised` and weight 600 only.
- **NAV-10 · P2 · The restricted and not-found pages use a fourth type scale.** `.bb-status` sets 18px body and a 28/700 h1 with an 18px button (`app.css:19-20`, `rec-admin-1440.png`). Fix: shared roles.

### 4.4 Home

Screens: `home-1440.png`, `home-manager-1440.png`, `home-analyst-1440.png`, `home-admin-1440.png`, `home-price-error-1440.png`, `home-390.png`.

- **HOME-1 · P1 · The largest type in the product is a greeting.** 116px uppercase (`HomePage.tsx:10`, `home.css:15`); the largest-to-body ratio is 9.67 against 2.29 to 2.86 elsewhere; the page holds 26 to 28 words. Why: this is an app people work in, and the page tells the buyer nothing about their plans. Fix: greeting at 24px; give the freed space to three or four role-specific facts.
- **HOME-2 · P1 · The four role homes are identical apart from one button label** (`HomePage.tsx:22-30`). Why: the assessor cannot tell a role changed. Fix: a role line ("Buyer at Organisation") and role-specific facts: buyer (plans due this week, decisions waiting, approved and awaiting purchase), manager (submissions awaiting review), analyst (latest price and forecast status), admin (members and roles).
- **HOME-3 · P2 · The only data is the smallest element.** The MGO quote card has 12px labels at the bottom right. "▲ 0.33%" is uncoloured here but coloured on Market. The quote is two days old with no stale marker. Fix: promote it and use the price-direction tokens.
- **HOME-4 · P2 · The primary button carries no count.** "Plans for approval" and "Go to your plans" do not say how many. Fix: "3 plans awaiting your approval".
- **HOME-5 · P3 · The price error state has no retry** ("Price unavailable right now", `home-price-error-1440.png`). Fix: a ghost "Retry".
- **HOME-6 · P3 · The photo is a hillside harbour town, not Singapore.** Fix: use a Singapore anchorage image, or drop the photo once the page has content.
- **HOME-7 · P3 · A fifth button size.** 52px high with a 10px radius (`home.css:21`). Fix: shared primary.

### 4.5 Purchase plans (list, approval inbox, decision views)

Screens: `multiple-1440.png`, `saved-1440.png`, `empty-1440.png`, `load-error-1440.png`, `plans-decisions-1440.png`, `plans-manager-1440.png`, `decision-history-1440.png`, `manager-decisions-1440.png`, and the 390 versions.

- **PLAN-1 · P1 · A filled primary button on every card.** `PurchasePlanSummary.tsx:61` gives `pp-button--primary` to each card's link; `plans-decisions-1440.png` shows five full-width filled bars plus "Create plan". Why: nothing is primary; the eye lands on the bars, not on the plan that needs action. Fix: the card is already one large link (`purchase-plan.css:108`), so drop the bar to a ghost "Open" link. Give a primary only to cards waiting on the user: "Record purchase" on Approved and "Copy to new draft" on Rejected.
- **PLAN-2 · P1 · Every approval status looks the same.** "Rejected", "Withdrawn", "Approved" and "Submitted for approval" are identical outlined rectangles (`purchase-plan.css:177`); "On track" is a pill beside them (`:83`). Fix: one tag component with the status tones from S4.
- **PLAN-3 · P1 · The list does not show the recommendation.** No card shows Buy now, Wait or Monitor. Why: the product's main output is one click away from every plan. Fix: show the latest verdict on the card when one exists, or state "Not yet analysed". If that needs a new API call it is outside the revamp; record it as a product gap.
- **PLAN-4 · P1 · The empty state is a 1360 by 684px dashed void with one muted sentence and no action** (`empty-1440.png`, `PurchasePlanPage.tsx:196-198`, `purchase-plan.css:52`). "Create plan" is 600px away. Why: it is the first screen of the core flow and the best place to explain plan, recommendation, approval. Fix: a compact panel with a title, one sentence on the three steps and the "Create plan" primary inside it.
- **PLAN-5 · P1 · The manager's landing page does not say "approval".** Home's "Plans for approval" lands on "Organisation purchase plans" and the same dashed void: "No purchase plans have been assigned to this organisation yet." (`plans-manager-1440.png`). The inbox renders only when `service.notifications` exists (`PurchasePlanPage.tsx:189`). Fix: always render the inbox for managers with its own empty state ("Nothing is waiting for your approval"), placed first.
- **PLAN-6 · P1 · The approval inbox and the decisions list are unformatted.** Raw ISO dates ("Due 2026-11-05", `BuyerDecisions.tsx:65`, `ApprovalInbox.tsx:38`), raw status values (`ApprovalInbox.tsx:39`), the refresh button touching the description (`manager-decisions-1440.png`), and the row's main action as a text link beside an outlined "Mark as seen" button (`BuyerDecisions.tsx:67-68`). The actions sit about 1,000px to the right of the row's subject (`.pp-actions` is `justify-content: flex-end`). Fix: use `formatDate`, map statuses to tags, make the row a link, show the buyer's name, keep "Mark as seen" as ghost.
- **PLAN-7 · P1 · "Back to purchase plans" is browser-default blue** (`App.tsx:110`). Fix: S7 link style, and use the same back link as the recommendation page.
- **PLAN-8 · P2 · The selected filter uses the accent fill and has square corners.** `.pp-filter button[aria-pressed="true"]` (`purchase-plan.css:199-201`) matches "Create plan" in weight; the buttons have no `border-radius` and no minimum height (37px). Fix: shared segmented control.
- **PLAN-9 · P2 · The filter floats in the middle of the row.** `.pp-list-heading` is `space-between` with three children, so the filter is detached from both "Your plans" and "Sort by" (`multiple-1440.png`). Fix: heading on the left, filter and sort together on the right.
- **PLAN-10 · P2 · Seven controls before the first plan.** Refresh, Create plan, All, Open, Finished, Deadline, Volume; `hierarchy-metrics.json` counts 12 buttons above the fold with two plans. Fix: hide filter and sort below about six plans; make Refresh ghost or remove it (the list already polls).
- **PLAN-11 · P2 · The overview strip is a full-width band for three small integers, one of them usually 0.** 32px weight-300 numerals in 450px cells (`purchase-plan.css:115-119`); "22 days · 15 Nov" repeats what the cards say. Fix: one line of text under the title ("2 active · next deadline in 22 days"), or show "Overdue" only when it is above zero.
- **PLAN-12 · P2 · Quantity is set at 40px weight 300** (`purchase-plan.css:88`). Thin numerals are large but weak, and they differ from the 600-weight figures elsewhere. Fix: 24/600 figure role.
- **PLAN-13 · P2 · The decision note is a box inside a card, in the darker "well" colour** (`purchase-plan.css:180`). Three nesting levels and 13px text. Fix: no border or fill; a status icon and two lines separated by a hairline.
- **PLAN-14 · P2 · Card buttons have long, slash-joined labels.** "View decision / record purchase →", "View submitted recommendation →", "View withdrawn request →" (`PurchasePlanSummary.tsx:61`). Fix: "Open" plus the action-specific primary from PLAN-1.
- **PLAN-15 · P2 · The load error offers three overlapping retries.** "Refresh", "Retry" (filled) and a disabled filled "Create plan"; the error banner is a bordered box inside a bordered card; the heading says "plan" in the singular (`load-error-1440.png`, `PurchasePlanPage.tsx:191-195`). Fix: one message, one "Try again".
- **PLAN-16 · P2 · Source only: the create/edit form has no width rule.** `PurchasePlanForm.tsx:51` renders `.pp-card.pp-form`, and `purchase-plan.css` has no `.pp-form` selector, so the card and its two inputs should span about 1,300px. Please verify in the browser. Fix: `max-width: 480px`. "Application date" (`:73`) is internal wording; use "Today".
- **PLAN-17 · P2 · Decision history uses inline styles, literal colours and a 3px side stripe.** `BuyerDecisionHistory.tsx:11`, `:49-59`; dates use the browser locale (`:12`); a raw recommendation id is printed (`:59`). Fix: tokens, tags, `decisionTime`, remove the id.
- **PLAN-18 · P2 · The Decision history error says the same thing twice and uses a filled button.** "Couldn't load your decisions" then "Decision history is unavailable." then a filled "Retry" (`decision-history-1440.png`). Fix: one sentence, a secondary button.
- **PLAN-19 · P3 · A menu with one item.** The "…" menu holds only Delete (`PurchasePlanSummary.tsx:92-98`).
- **PLAN-20 · P3 · "Finished" does not match the status words.** It means rejected, withdrawn or purchased, and "Open" includes approved (`PurchasePlanPage.tsx:166-168`). Fix: "Active" and "Closed", or filter by status.
- **PLAN-21 · P3 · Six or seven targets under 44px at 390px** (`hierarchy-metrics.json`): filter 37px, sort 36px, menu 36px.
- **PLAN-22 · P3 · Card links have identical accessible names.** Every card reads "View recommendation →". Fix: add the quantity and deadline to an `aria-label`, and hide the arrow from assistive technology.

### 4.6 Recommendation page

Screens: all `rec-*` at 1440 and `rec-wait-390.png`.

- **REC-1 · P1 · The answer is stated three times and the page title competes with it.** "Purchase recommendation" 32px, "Wait" 40px, the rail's "Wait" 20px, and the recommended tile (`RecommendationsPage.tsx:76`, `:184`, `:207`, `:195`). Fix: h1 at 24px, the verdict alone at display size, the rail showing only what the buyer does next.
- **REC-2 · P1 · Two decision systems share one 320px card.** "Your decision: Wait" (which is the recommendation, not the user's decision, `:206`), "Submit for approval", then "Your decision on this recommendation: Accept / Reject / Ignore" (`BuyerDecisionLog.jsx:61-75`), then "Refresh prices". Five buttons with no stated relationship. Why: neither a buyer nor an assessor can say whether Accept is needed before Submit. Fix: label the rail "Next step"; keep "Submit for approval" as the only prominent action; move Accept, Reject and Ignore to a quiet row with one line saying what it records, or behind a "Not submitting?" disclosure; move Refresh to a ghost icon button beside the quote date.
- **REC-3 · P1 · Five different money figures for one purchase, and the saving is the quietest of them.** For "buy on Wed 25 Nov" the page shows USD 58,687 (tile), USD 58,280 (column), USD 55,460 to 61,100 (detail), and savings of "about USD 4,857" (13px note), "USD 5,264" (footer), "USD 8,084 less to USD 2,444 less" (20px) and "$103.35/mt" (reason text) (`rec-wait-1440.png`). Why: the buyer cannot tell which number their manager will see. Fix: one lead figure at 32px, "Saves about USD 4,857 versus buying today", with the two totals beneath at 14px. Use one estimate consistently, or name the difference where it appears.
- **REC-4 · P1 · Exploring a column silently changes what is submitted.** The detail card says "Exploring a date shows what it could cost. It doesn't change the recommendation." (`TimingComparison.tsx:139`), while the rail says "Cost detail included: 7-day forecast … Select an eligible date to change it." (`RecommendationApproval.tsx:53`), and `explore()` sets the horizon (`RecommendationsPage.tsx:70`). In the Wait fixture the recommendation targets 25 Nov but the submitted cost detail is the 7-day figure for 02 Nov (`rec-awaiting-1440.png`: "Saved estimate USD 62,510"). Why: the manager approves "Wait until 25 Nov" with a cost for 02 Nov. Fix: this touches behaviour and is outside the revamp's remit, so raise it with the logic owner. The presentation fix is to show "This is what will be sent" on the selected column and in the rail.
- **REC-5 · P1 · On the submitted views the h1 and the status h2 are the same style.** "Submitted recommendation" and "Awaiting manager approval" are both 32/600 (`recommendations.css:12`, `:197`). Fix: 24px h1, status at display size.
- **REC-6 · P1 · The manager is asked to decide before seeing the evidence, in buyer-voiced copy, without the buyer's name.** `rec-review-1440.png`: the headline tells the manager "All managers in your organisation have been notified"; Approve and Reject sit in the status card above the "Plan recommendation" figures (`RecommendationApproval.tsx:119`); nothing says who submitted. Fix: for managers, headline "Awaiting your decision", "Submitted by <name> on <date>", evidence first, Approve and Reject in the sticky rail.
- **REC-7 · P1 · Read-only roles get no read-only marker.** `rec-analyst-1440.png` is the buyer page minus three buttons. Fix: a "View only · Analyst" tag at the top of the rail.
- **REC-8 · P1 · Internal identifiers appear in the main content.** "Model ridge-7d-sha256-preview00000000 · run preview-wait", "Urgency NORMAL" (`RecommendationApproval.tsx:151-152`), "Manager account: user_preview_manager" (`:110`). Why: it looks unfinished in a demo. Fix: move them into the "How this was calculated" disclosure; format urgency as a word.
- **REC-9 · P2 · Headings and figures share 20/600.** See S2. Fix: headings 16/600, column values 14/600, detail values 24/600.
- **REC-10 · P2 · The compare strip is outlined more heavily than the answer.** `.rec-col` uses the 40% border, `.rec-answer` the 15% border (`recommendations.css:99`, `:24`). Fix: columns without borders on one panel, separated by hairlines; the selected column takes `--bb-surface-raised`.
- **REC-11 · P2 · "Selected" and "Recommended" look the same.** Both use the 2px accent border and accent bar (`recommendations.css:102`, `:122`); on `rec-monitor-1440.png` the 7-day column is selected but not recommended and looks like the recommended column on the other screens. Fix: selection is the raised fill; "Recommended" is the single filled chip.
- **REC-12 · P2 · Four chip treatments in one row.** "Observed", "Eligible", "After deadline" (dashed) and "Recommended" (filled). "Eligible" labels the default state. Fix: label only the exceptions.
- **REC-13 · P2 · The strip takes about 390px of height to show four numbers.** Each column is a 330px button with a 150px plot containing a small bar. Fix: plot height about 80px, or one shared plot with four marks.
- **REC-14 · P2 · The tiles are boxes inside the answer box, and the recommended tile is marked only by an accent border.** `recommendations.css:40-46`. Fix: no tile borders; two figures side by side with a hairline, the recommended one first.
- **REC-15 · P2 · The stale-quote warning is the least visible text on the page.** "Prices use the MGO quote observed Mon 26 Oct, 2 days ago…" is 12px secondary outside the rail card (`RecommendationsPage.tsx:220`). Fix: put it directly under the lead figure, in the warning tone when older than a set number of days.
- **REC-16 · P2 · The error state has no error treatment and offers two retries.** `rec-error-1440.png`: "Couldn't load analysis" looks the same as "No recommendation available"; "Retry recommendation" and "Refresh prices" are both present. Fix: error icon and tone; one retry.
- **REC-17 · P2 · The "nothing to recommend" states still render the whole page.** `rec-unavailable-1440.png`, `rec-ready-1440.png` and `rec-error-1440.png` are 1,820 to 1,890px tall: three paragraphs of notice, a compare strip where every forecast is "After deadline", and a detail card with a dash. Fix: collapse the strip behind "Show forecasts after your deadline"; cut the notice to one sentence and one action.
- **REC-18 · P2 · The verdict contradicts the notice on `rec-ready-1440.png`.** "Consider purchasing on 29 October" sits above "Your deadline is before the available forecasts". This may be a fixture effect, but the layout lets both show. Fix: when no horizon fits, the notice replaces the verdict.
- **REC-19 · P2 · The purchase record is ten equal figures with the outcome last and orphaned.** `rec-purchased-1440.png`: supplier, date and quantity are styled as 20/600 figures; "USD 60,630.00–USD 64,155.00" wraps; "Compared with estimate" sits alone on a fourth row; amounts have two decimals here and none elsewhere (`PlanLifecycleActions.tsx:100-110`). Fix: lead with "Paid USD 61,100, USD 1,410 less than the estimate"; put the rest in a two-column list at body size.
- **REC-20 · P2 · The purchased view still leads with the manager's decision.** "Decided by…" and the comment box take the top. Fix: lead with the purchase and fold the approval into a line.
- **REC-21 · P2 · Loading: the chart placeholder looks like a failed chart.** A 190px dark box with one dot and "Today" (`rec-loading-1440.png`). The deadline notice also shows during loading. Fix: draw the reference line and the three empty slots from the start; hold the notice until loading ends.
- **REC-22 · P2 · Jargon in the detail footer.** "Executed Ridge · experimental bounds", "weighted forecast signal", "Coverage has not been measured". Fix: plain wording ("Model estimate. The range is experimental."), technical names in the disclosure.
- **REC-23 · P3 · `document.title` says "Purchase estimate"** (`App.tsx:86`) while the h1 says "Purchase recommendation".
- **REC-24 · P3 · Six targets under 44px at 390px:** back link 32px, Accept, Reject and Ignore 40px, Total and Per MT 36px.
- **REC-25 · P3 · The decision group's label is ignored.** `aria-label` on a plain div (`BuyerDecisionLog.jsx:61`). Fix: `role="group"`.
- **REC-26 · P3 · Accept and Ignore save on one click; Reject asks for a reason.** No undo is offered. Fix: allow changing the answer, or show a short undo notice.

### 4.7 Market dashboard, stored-data panel

Screens: `docs/ui-revamp/submission/day2-screens/market-1440.png`, `market-390.png`.

- **MKT-1 · P1 · The first number is at y≈412 of a 900px viewport.** Before it: eyebrow, h1, subtitle, refresh button, a five-fact status bar and a collapsed "1 series awaiting data" panel. Fix: title row, then prices; move status facts to a caption under the prices and the coverage notice below the chart.
- **MKT-2 · P1 · The chart opens on Brent crude, not MGO.** `StoredMarketPanel.jsx:55` `useState('BRENT_CRUDE')`, while the MGO card is the featured one. This is a default value, so check whether changing it counts as presentation. Fix: default to MGO, or to the featured card's series.
- **MKT-3 · P2 · Four cards in a five-column grid.** `stored-market.css:49` leaves about 275px empty on the right at 1440. Fix: `repeat(auto-fit, minmax(240px, 1fr))`.
- **MKT-4 · P2 · Context numbers are the same size as the MGO price.** "1,284" matched articles and "-1.73" news tone are 32px (`stored-market.css:115`) under a note saying "Context, not a price signal". The tone has no scale. Fix: 16/600 with a one-line scale.
- **MKT-5 · P2 · Each price card holds eight or nine text items in six styles.** Symbol chip, "OBSERVED", name, price, unit, change, date, source, warning. Cards stretch to the tallest, leaving empty space. "OBSERVED" appears on every card. Fix: name, price with unit, change; date and source on one caption line; say "observed" once for the row.
- **MKT-6 · P2 · A different editorial voice.** Uppercase tracked eyebrows ("MARKET INTELLIGENCE", "THE BIGGER PICTURE", "PHYSICAL MARKET", "NEWS CONTEXT") and an h1 with an accent full stop (`StoredMarketPanel.jsx:83`, `:115`, `:138`, `:151`); elsewhere the app uses sentence-case kickers or none. Fix: remove the eyebrows and the full stop.
- **MKT-7 · P2 · The featured card is marked only by a 40% border** (`stored-market.css:52`). It reads as hover or focus. Fix: put MGO first at a larger figure size, or use the raised surface.
- **MKT-8 · P2 · The page is "Market dashboard" in the navigation and tab title, "Market overview." in the h1 and "MARKET OVERVIEW" in the header chip.** Fix: one name.
- **MKT-9 · P3 · "Monthly" looks like a control but is a label** (`.sm-period`). Fix: plain caption text.
- **MKT-10 · P3 · The y-axis has no unit and the legend describes a single series.** Fix: put the unit in the chart title and remove the legend.
- **MKT-11 · P3 · At 390px the refresh button should collapse to an icon but does not.** `.sm-refresh { font-size: 0 }` (`stored-market.css:124`) loses to `.stored-market .sm-refresh` (`:30`), so the label stays and the h1 wraps (`market-390.png`). Fix: match the specificity.
- **MKT-12 · P3 · Two footnote blocks,** then the forecast widget appears below what looks like the page footer.

### 4.8 Forecast widget

Screens: `forecast-widget-1440.png`, `forecast-widget-390.png`. `DESIGN.md` already schedules its token migration for Day 4; these are the issues that migration must cover.

- **FC-1 · P1 · It looks like a different product.** Navy #0c1524, teal #00d4c8, saturated red and green, 12 text colours, sizes 10, 11, 12, 12.5, 13, 17 and 22px (`forecast.css`, `hierarchy-metrics.json`). Fix: tokens and type roles.
- **FC-2 · P1 · Price direction means the opposite of the panel above it.** Here down is red and up is green (`forecast.css:139-144`); the stored panel and `tokens.css:104-105` make up pink (dearer) and down green (cheaper). `market-1440.png` shows "-4.05%" in green; `forecast-widget-1440.png` shows "$1,275 ▼22" in red. Fix: `--bb-price-up` and `--bb-price-down`.
- **FC-3 · P1 · The forecast is placed after the page footnotes, at a different width.** `MarketDashboard.jsx:10` uses an inline 1560px max-width under `StoredMarketPanel`. Fix: place it directly after the MGO price, inside the shared container.
- **FC-4 · P1 · Four lines of provenance with raw ISO timestamps come before the number.** "Published: 2026-10-05T01:00:00Z", "GDELT window (UTC, end exclusive)…" (`ForecastWidget.jsx:88-92`); the forecast figure is at y≈340. Fix: one caption ("Forecast from 5 Oct, based on the 4 Oct quote") and the rest inside the existing "Forecast details" disclosure.
- **FC-5 · P2 · Three caveat sentences in a bordered box sit between the number and the chart, with a fourth below** (`ForecastCard.jsx:67-94`). Fix: one line under the range, the rest in the disclosure.
- **FC-6 · P2 · The "Weak" badge is unexplained** and sits beside the horizon toggle as if it were a control. Fix: "Evidence: weak" beside the figure, with a short explanation.
- **FC-7 · P2 · 11px notes at about 3.6:1.** `.forecast-skill` and `.forecast-drivers-note` are #5f7083 on #0c1524 (`forecast.css:158-162`, `:223-227`). Fix: tertiary text at 12px.
- **FC-8 · P2 · The time axis is uneven.** Daily ticks to Oct 4, then Oct 12 at the same spacing, which steepens the forecast cone; y ticks are 1340, 1280, 1245, 1210. Fix: a true time scale and even ticks.
- **FC-9 · P2 · Currency format differs from the rest of the app.** "$1,297 USD/MT" here, "USD 63,544" on Recommendation. Fix: one formatter.
- **FC-10 · P3 · Targets and wrapping at 390px.** Four targets under 44px, one under 24px; "Refresh forecast" wraps to two lines.
- **FC-11 · P3 · The loading text has no `role="status"`** (`ForecastWidget.jsx:60-65`).

---

## 5. Cross-page inconsistencies

| # | Thing | Variants found |
|---|---|---|
| X1 | Typeface | Segoe UI (app), Geist (auth), Inter (organisation) |
| X2 | Palette | Black and beige (app), navy and teal (organisation, forecast), plus red and green (forecast) |
| X3 | Page left edge at 1440 | 40px (Plans, Manager decisions, Market), 120px (Recommendation, Decision history), 1560px container (forecast) |
| X4 | Page h1 | 32/650 (Plans), 32/600 (Recommendation), 28 to 40/600 with accent full stop (Market), 28/700 centred (status pages), 116/500 uppercase (Home), 52/600 tagline (auth), 36 to 56/600 (organisation) |
| X5 | Section h2 | 16/600, 20/650, 20/600, 18/600 with caps kicker, 17/600, and browser-default 21/700 |
| X6 | Primary button | 50px, 44px, 48px, 52px; radius 5, 8, 10; weight 400 on `<button>` and 600 on `<a>` |
| X7 | Refresh | "Refresh", "Refresh prices", "Refresh market data", "Refresh forecast", "Refresh decisions", "Refresh inbox": six buttons, five styles, four positions, beside 30-second and 1-minute auto-refresh |
| X8 | Segmented control | `.pp-filter` (square, accent fill), `.pp-sort` (text and chip), `.rec-toggle` (joined), `.sm-range` (inset track), `.forecast-seg` (teal tint) |
| X9 | Chips and badges | `.pp-badge` pill, `.pp-plan-status` rectangle, `.pp-unread`, `.rec-chip`, `.rec-badge`, `.bb-date`, `.bb-decisions-alert`, `.sm-card-symbol`, `.sm-period`, `.forecast-badge`, `.bb-org-role-badge` |
| X10 | Money | "USD 63,544", "USD 1,351.50 /MT", "$1,351.50" with "USD/MT", "$1,297 USD/MT", "$1248.65/mt", "USD 61,100.00" |
| X11 | Dates | "24 Oct 2025", "Mon 30 Nov 2026", "28 Oct, 09:30", "2026-11-05", "2026-10-05T01:00:00Z", "OCT 4, 2026", "Sept 2026", browser-locale `toLocaleString()` |
| X12 | Price direction colour | Up pink and down green (Market), up green and down red (forecast), uncoloured (Home) |
| X13 | Error | Card with nested banner and filled Retry (Plans); pink-bordered card with filled Retry (Decision history); plain text with outlined Retry (Recommendation); quiet text, no retry (Home); red circle and teal Retry (forecast) |
| X14 | Empty | Dashed void with no action (Plans); centred card with a primary (Recommendation, Decision history); plain sentence (decision lists) |
| X15 | Loading | 56px spinner, static `.bb-spinner`, skeleton with five steps, 28px teal spinner, text only |
| X16 | Back | "‹ Purchase plans" above the title (Recommendation, Decision history); blue link at top right (Manager decisions); filled "Back to Home" (restricted) |
| X17 | Page name | "Purchase recommendation", "Purchase estimate" (tab title), "Submitted recommendation", "Plan recommendation", "Saved recommendation"; "Market dashboard", "Market overview." |
| X18 | The word "decision" | The buyer's Accept, Reject or Ignore; the manager's approve or reject; the rail title that repeats the recommended action |
| X19 | Focus ring | Offset 4px (base), 3px (Recommendation, Home), 2px (lifecycle form), glow (auth), teal (organisation) |
| X20 | Panel padding | 30/31, 24, 32, 28, 20/22px, clamp(20 to 32) |
| X21 | Figure weight | 300 (Plans), 600 (Recommendation, Market), 500 (Market pulse), 700 (forecast) |

---

## 6. Holistic notes

**Information architecture.** The spine is sound: plan, recommendation, approval, purchase record. Three things obscure it. Navigation and role are hidden (NAV-1, NAV-2). There are three overlapping "decision" pages (X18, NAV-3). The plan list does not show the recommendation (PLAN-3). The workflow is never drawn as a sequence anywhere; a five-step status line on the plan card or the submitted view (Draft, Submitted, Approved, Purchased) would explain the product in one glance.

**States.** Coverage is thorough and that is a real strength: nearly every state has a screen. Presentation is inconsistent (X13 to X15), and the unavailable states are too long (REC-17).

**Copy.** Clear when it talks to the buyer ("Hold off and buy on Wed 25 Nov.", "Approval does not place an order."). Weak when it exposes the model ("Executed Ridge · experimental bounds"), the system (ISO timestamps, run ids, "Urgency NORMAL") or the build ("available after integration").

**Emotional fit.** A procurement tool should feel calm and exact. The palette supports that. Home and organisation selection feel like marketing, and the forecast widget feels like a trading terminal. In a graded demo the changes of identity will read as three teams' work stitched together.

---

## 7. Nielsen's heuristics

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Good loading, saved and error feedback, but the signed-in role and the meaning of the date chip are not visible (NAV-2, NAV-4) |
| 2 | Match with the real world | 2 | "Executed Ridge · experimental bounds", "GDELT window (UTC, end exclusive)", "Urgency NORMAL" in main content |
| 3 | User control and freedom | 2 | Exploring a column changes the submission without saying so (REC-4); Accept and Ignore save on one click with no undo |
| 4 | Consistency and standards | 1 | Three palettes, three typefaces, five segmented controls, eight button implementations (section 5) |
| 5 | Error prevention | 3 | Confirmation on submit, decide and delete is good; duplicate Refresh and Retry controls invite wrong clicks |
| 6 | Recognition rather than recall | 2 | Navigation is hidden; the user must remember which horizon will be submitted; Manager decisions has no menu entry |
| 7 | Flexibility and efficiency | 2 | No dense list view, no verdict on the list, two clicks per navigation |
| 8 | Aesthetic and minimalist design | 2 | Recommendation has 376 words and 14 boxes above the fold and repeats its answer; Home has almost nothing |
| 9 | Recognise, diagnose, recover from errors | 3 | Messages are plain and say the plan is safe; the recommendation error has no error styling and two retries |
| 10 | Help and documentation | 2 | "How this recommendation was calculated" is good; no onboarding in empty states, no explanation of roles or statuses |
| | **Total** | **22 / 40** | |

---

## 8. Cognitive load failures

| Page | Fails |
|---|---|
| Home | Visual hierarchy (the greeting outranks all information). Passes the rest by being empty. |
| Purchase plans | Single focus (a primary per card). Minimal choices (seven controls before the first plan). Grouping (the filter floats between heading and sort). Visual hierarchy (statuses identical). |
| Recommendation, draft | Single focus (verdict three times, two decision systems). Chunking (five buttons in the rail; four columns plus marker plus toggle). Grouping (Submit and Accept, Reject, Ignore in one card). Visual hierarchy. One thing at a time (answer, submit, accept, explore and refresh at once). Minimal choices (about 11 controls at the decision point). Working memory (five figures; which horizon is submitted). Progressive disclosure passes only for the two collapsed sections. |
| Recommendation, submitted | Visual hierarchy (h1 equals h2). One thing at a time for managers (decide before evidence). Chunking on the purchase record (ten figures). |
| Market dashboard | Single focus (four equal prices, chart, table, pulse, forecast). Chunking (eight or nine items per price card; five facts in the status bar). Visual hierarchy (news tone equals MGO price). |
| Forecast widget | Progressive disclosure (provenance and caveats before the chart). Visual hierarchy. Working memory (what "Weak" refers to). |

---

## 9. Persona red flags

**Alex, the impatient expert buyer.**
- Home is a dead end: one button, no counts, no deadlines.
- Every navigation is a hamburger, a modal, then a click.
- The list hides the answer. To learn which plans say "Buy now", Alex opens each one.
- Cards waste the screen: two plans fill a third of a 1440px page; twelve would need four rows of 280px cards. There is no table view.
- On the recommendation the saving is a 13px note, and the rail asks two questions (Submit, and Accept or Reject) with no explanation.
- "View decision / record purchase" needs three steps (open, click "Record purchase", fill the form).
- Six kinds of Refresh button raise the question of whether anything on screen is current.

**Sam, keyboard and screen reader.**
- Works well: skip link, focus trap and focus return in the menu, `role="status"` and `role="alert"`, `aria-pressed` on toggles, labelled regions, focus sent to the h1 on the recommendation page.
- Two navigation items announce "current page" on Decision history (NAV-5).
- Every plan card link has the same name, with a spoken arrow (PLAN-22).
- The sign-in h1 is a tagline read as "A clearer course.A smarter purchase." (AU-3).
- On the compare strip, "selected" is a 2px beige border and focus is a 2px beige outline. Sam cannot tell by sight which column has focus and which is selected (REC-11).
- Heading structure misleads: "Your decision on this recommendation" is an h3 under the h2 "Wait"; the submitted view has an h1 and h2 that look identical; unstyled headings change size without meaning.
- The date chip is read as a bare date (NAV-4). The disabled "Market dashboard" explains itself only through `title`.
- Forecast widget notes are about 3.6:1 at 11px (FC-7), and its loading state is not announced (FC-11).

**The assessor, watching a five-minute demo.**
- Sign-in shows three "not available" notices (AU-2), then the organisation screen changes colour and typeface (ORG-1).
- Home looks identical for all four roles. Nothing on any screen names the current role (HOME-2, NAV-2).
- The menu is closed, so the structure of the app is never seen unless the presenter opens it (NAV-1).
- The workflow is never shown as a sequence, and the status chips look alike (PLAN-2).
- On the recommendation: "Your decision: Wait" next to Accept, Reject, Ignore and Submit for approval prompts "which one is the decision?" (REC-2), and five dollar figures prompt "which is the cost?" (REC-3).
- The manager's page tells the manager that managers have been notified, does not name the buyer, and asks for approval above the evidence (REC-6).
- The analyst's page has no "view only" marker (REC-7). The admin reaches a restricted page in a different type scale (NAV-10).
- The forecast, the model team's main output, sits under the Market page footer in another palette with reversed colours (FC-1 to FC-3).
- Strings such as "ridge-7d-sha256-preview00000000" and "user_preview_manager" read as debug output (REC-8).

---

## 10. Working well: do not break

1. **Answer-first recommendation with honest labels.** A one-word verdict, one plain sentence ("Hold off and buy on Wed 25 Nov."), a "Next step" line on every status view, and consistent honesty ("Synthetic demo data", "Approval does not place an order", "Confirm a current supplier quote"). Keep the structure and the wording; reduce what surrounds it.
2. **State coverage and accessibility plumbing.** Loading, empty, error, unavailable, read-only and every approval status have designed screens. The skip link, focus trap, status announcements, `aria-pressed`, reduced-motion handling and the no-overflow result at 390px on every page are solid.
3. **The compare-buying-dates idea and the restrained palette.** A shared price scale with a deadline marker is the one visual that belongs only to this product. The dark canvas with warm beige and colour reserved for errors, warnings and price direction is the right base; the problem is how many times the beige fill is spent, not the palette.

---

## 11. Questions for the owner

1. If Home had no photo and no greeting, only "3 plans: 1 approved and awaiting purchase, 1 rejected, next deadline in 8 days", would the demo be stronger or weaker? What is the photo doing for a buyer on day 30?
2. Why does a buyer both Accept, Reject or Ignore a recommendation and Submit it for approval? If the difference cannot be explained to the assessor in one sentence, should both be on this page?
3. Should the plan list be the real home: a table with deadline, status and the current verdict in columns, so the product's answer is visible without opening anything?
4. With the accent 1.10:1 from the text colour, only a filled block can be "the highlighted thing". Will you allow one true signal tone reserved for "this needs your action", or must hierarchy come from fill, size and space alone?
5. `DESIGN.md` rules out persistent navigation. For a graded demo of a four-role workflow, what is gained by hiding the four destinations and the role behind a menu?
