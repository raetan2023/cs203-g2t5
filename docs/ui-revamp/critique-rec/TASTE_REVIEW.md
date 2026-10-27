# Recommendations page: Taste review (before), 2026-10-27

Review only, no code changed. Taste skill v2.1.5, app-screen rules (`--app`), palette and type kept.
Screens: preview app (mock data), states captured as static snapshots in this folder (`<state>-1440.png`).
Measured on the dev server; the production build was not inspected.

## Measurements (ready state)
- Inspector: **3 FAIL** — 4 tiny uppercase labels ("Purchase planning", "Compare model horizons", "Estimate date",
  "Recommendation"); 1 gradient (`.timing-comparison`, recommendations.css:132); 6 text blocks under 11px (10px labels).
- Lint: 1 FAIL (same gradient), 5 eyebrow labels (PurchaseImpact.tsx:37, RecommendationsPage.tsx:56/74,
  TimingComparison.tsx:60/64), 1 resting shadow (recommendations.css:151).
- 11 type sizes in use (10–30px); 60 colour literals in recommendations.css, all old navy/teal (#0c1a29, #25394c…).
- 1.7 screens, 312 words, page title 30px; largest figures are three equal "USD 1,2xx /MT" at 24px.

## Critique (references/critique.md + app-screens.md §2.7)

```
ROUND 1 (before)
Seen in one second: a stack of navy panels; three dashed price cards.
Screen's question: "When should I buy this plan, and what will it cost?"
Answered by: three blocks that disagree — "Buy within 6 days" (top, 28px), "Your deadline is before the available
  forecasts" (middle), "Consider purchasing on 29 October" / "No recommendation available" (bottom, last).
Layout words: header / plan strip / control row / card grid (3) / segmented control + card / split card.
Scores: design 5.5 · usability 5 · creativity 5 · content 6 → overall 5.4
Caps applied: inspector FAILs (≤ 6.0); eyebrow labels + resting shadow (≤ 6.5).
```

Findings against the app-screen questions:
1. **The answer is not the biggest thing, and it is told three times.** The recommendation sits at the bottom,
   after two other headline-sized answers. In the "unavailable" state the top still says "Buy within 6 days"
   while the bottom says "No recommendation available".
2. **Facts shown twice disagree or repeat.** Current date appears in the header chip, the plan strip and the
   recommendation card. Horizon target dates are 2026 against a 2025 deadline (mock data), and all three
   horizons say "After your deadline" while one is "Selected".
3. **Edges and voids.** The cost-impact half of the bottom card has its sentence flush against the card edge and
   ~180px of empty panel under it; the segmented 7/14/30 control floats at the right with all options disabled.
4. **Colour is on chrome, not data.** Navy panels, teal dashed selection, a teal gradient; no hue on the figure
   that answers the question. The restyle never reached this page.
5. **Type has no lead.** 11 sizes; the screen's answer competes with three equal 24px prices and four 10px
   uppercase labels.
6. **Phone:** the plan strip folds to a clean 2×2; the comparison and cards stack well, but the recommendation
   is several screens down.

## The three changes that would move the screen most
1. **Answer first, once.** One top block states the decision for this plan (the recommendation's action, or
   "No recommendation yet" with its reason), the estimated cost for the plan's quantity, and the deadline.
   It is the largest type on the screen. The timing comparison and estimate panel become the evidence below
   it, and no other block restates a different answer.
2. **Three evidence blocks, each saying its fact once** (owner decision 2026-10-27: keep three evidence blocks,
   keep all information). Under the answer: (a) **timing comparison** (7 / 14 / 30 days), (b) **estimate for the
   selected horizon** (estimate date, deadline fit, limitations), (c) **cost impact** for the plan's quantity.
   Each block keeps its full content; only the duplicates listed below are candidates for removal.
3. **Finish the restyle with data-only colour.** Map the 60 literals to `--bb-*` tokens, drop the gradient,
   shadow and eyebrow labels (sentence-case labels at 12px+), cut to 4–5 type sizes, and put the one accent on
   the answer figure. Remove the repeated "current date".

## Duplicates and redundancy (owner to decide; nothing is removed without a yes)

Rule: all information stays unless it duplicates or is redundant with something else on the screen.

| # | Repeated fact | Where it appears now | Suggested single home |
| --- | --- | --- | --- |
| D1 | Current date | Header chip; plan strip "Current date"; recommendation card "Current date: 24 Oct 2025" (RecommendationsPage.tsx:60, :111) | Header chip (+ plan strip). The card line is asserted by RecommendationsPage.test.tsx:266, so removing it updates that test. |
| D2 | Horizon selector | Timing-comparison cards (click selects) and the "Estimate date" 7/14/30 buttons; both call `forecastState.setHorizon` (RecommendationsPage.tsx:66, :75) | One control: the comparison cards. The estimate block shows the selected horizon as text. |
| D3 | "Your deadline is outside the forecasts" | Comparison reason "all miss your deadline"; "After your deadline" on each card; "No supported horizon fits your deadline"; panel heading "Your deadline is before the available forecasts" | Said once in the answer/estimate block; each card keeps a short marker. |
| D4 | "Get a current supplier quote" | Comparison reason; estimate panel; limitations notice (TimingComparison.tsx:12-25, RecommendationsPage.tsx:70, :83) | Once, next to the answer's action. |
| D5 | Forecast target date | Comparison card "Target 12 Oct 2026"; estimate panel sentence "The 7-day estimate targets 12 Oct 2026"; "Exact target dates appear above" note | Card shows it; the estimate block refers to it rather than restating it. |
| D6 | "Your plan remains saved" | Several unavailable/error messages in the same view, plus "Applies to this analysis only. Your saved plan stays the same." under urgency | Keep the urgency note (different meaning); say "plan remains saved" once per state. |
| R1 | Redundant labels | Eyebrows "Purchase planning" (page context), "Recommendation" above the recommendation heading, "Compare model horizons" | Drop: the headings already say it. (Also Taste FAILs.) |

Not changed by this review: behaviour, states and tests. Mock data inconsistencies (2026 targets) belong to the
preview fixtures, not the design.
