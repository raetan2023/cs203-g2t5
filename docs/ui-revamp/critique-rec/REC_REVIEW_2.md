# Recommendations page: element inventory, Taste round 2, restructure brainstorm (2026-10-28)

Page as it is after PR #33 (one deadline-weighted recommendation) and #34 (approval). Screens:
`after-main-ready-1440.png` (as loaded) and `after-main-ready-1440-expanded.png` (all disclosures open). Preview mock data.

## 1. Element inventory (top to bottom)

| # | Block | Elements | Shown when |
|---|---|---|---|
| A | Header | Eyebrow "Purchase planning"; h1 "Purchase recommendation"; subtitle; Back to purchase plans | always |
| B | Plan strip | Quantity (MT) · Purchase deadline · Current date · Time remaining / Overdue | plan loaded |
| C | Timing comparison "MGO price forecasts" | Eyebrow; explainer; Refresh comparison; **Buy today: USD x/MT** + eligible/deadline passed + reference observed date; **3 horizon cards** (7/14/30 d: USD x/MT, uncertainty range, target date, Eligible / Too late / Past target, Selected, clickable); disclosure *View price ranges chart* (central + experimental range, legend); footnote | forecast service connected |
| D | Estimate limitations notice | Heading (deadline passed / after deadline / dated Ridge estimate / timing unavailable); quote age; model target; source label | experimental forecast, a horizon fits |
| E | Horizon bar | "Estimate date" + date or "No supported horizon fits"; **7/14/30 buttons** (same selection as C); model badge | connected |
| F | Deadline notice | Heading; model-supports sentence; **reference cost total** (USD x for N MT at USD y/MT); quote advice; Review purchase plan | no horizon fits |
| G | Forecast status card | Updating / unavailable / error + Retry price estimate | forecast not ready |
| H1 | Cost impact | Eyebrow "Cost scenario"; "Estimated cost on DATE"; range badge; **total cost range for N MT**; per-MT range; reference cost (total + date); possible cost change; model central cost; disclosure *Data sources and calculation* (source, SHA, model horizon, reference price, estimate date, news used, central estimate, full range, method, price note); unavailable / loading / error | plan loaded |
| H2 | Recommendation | "Recommendation"; **action** (Buy now / Wait / Monitor / Split); explanation; reasons; evidence grid (buy-now cost, cost from signal, potential savings, suggested date, reference freshness); split allocation; disclosure *Assumptions and limitations*; **Submit for approval** (buyer, draft); Current date; demo label; loading / error / unavailable | plan loaded |
| I | Submitted view | Replaces the page when status ≠ draft (manager decision form) | submitted / approved / rejected |

Facts shown more than once (candidates to merge, owner decides):
- Reference price per MT: C "Buy today", F, H1 per-MT/reference, H1 data sources, H2 assumptions (up to 5×).
- Reference total for the quantity: F, H1 "Reference cost", H2 "buy-now reference cost" (3×).
- Current date: header chip, B, H2 (3×). Horizon selection: C cards and E buttons (2 controls, one state).

## 2. Taste round 2 (app-screen rules)

```
ROUND 2 (after main)
Seen in one second: three large "USD 1,2xx /MT" cards.
Screen's question: "What should I do about this plan, and what will it cost me?"
Answered by: H2 action + H1 total — the last block on the page (y ≈ 1,280 of 1,550).
Largest figures: the three per-MT horizon prices (24px) and "Buy today /MT" — inputs, not the answer.
Scores: design 5.5 · usability 5 · creativity 5 · content 6.5 → overall 5.5
Caps: inspector FAILs (≤ 6.0) — 4 tiny uppercase labels, 1 gradient, 6 texts under 11px; eyebrows (≤ 6.5).
```
Top three problems:
1. **Inverted hierarchy.** Per-MT model prices lead; the decision and the cost for *your* quantity come last. Users read
   the three price cards as three answers.
2. **Units switch mid-page.** USD/MT (C, E, F) then USD totals (F, H1, H2) with no bridge, so the same reference price
   appears as 1,297 and 129,700 in different blocks.
3. **Unfinished restyle.** Navy/teal panels and gradient (59 colour literals), 11 type sizes, 10px uppercase labels.

## 3. Brainstorm: answer → money → evidence → fine print

Principle: the screen answers "what do I do, and what will it cost me?" first, in totals for the plan's quantity.
Per-MT prices are inputs and move into the evidence. The three evidence blocks stay (owner constraint).

**Layer 1 — Answer (top, largest type).** Action in words ("Wait until 29 Oct" / "Buy now" / "Monitor" / "Split 50/50"),
one-line reason, and the money: estimated total for N MT (range) next to "Buy today: USD 129,700", with the
difference ("may save USD 2k–5k" / "may cost USD 1k more"). Deadline + days left as context. Primary action:
Submit for approval (buyer) or the decision (manager). When there is no recommendation, this block says so and why.

**Layer 2 — Three evidence blocks**, each saying its fact once:
1. *Timing comparison* — today vs 7 / 14 / 30 d, **totals for your quantity by default**, a *Per MT | Total* switch,
   the deadline marked, ineligible horizons dimmed with "after deadline" once. One horizon control (drop E).
2. *Estimate for the recommended date* — per-MT central + range, model source, freshness, limitations notice (D).
3. *Cost impact* — reference total, possible change range, model central total.

**Layer 3 — Fine print.** Data sources and calculation, assumptions and limitations, policy version — collapsed.

Layout options:
- **A. Answer-first stack** (single column, smallest change): Answer → plan strip → evidence 1–3 → fine print.
- **B. Decision rail** — left column: answer + evidence; right sticky column: plan, cost summary, approval action.
  Keeps the decision and its action in view while reading evidence.
- **C. Timeline as the signature element** — one horizontal line from today to the deadline: today's price, the
  7 / 14 / 30 d targets at their real dates, the deadline as a vertical rule, the recommended date highlighted,
  ineligible targets beyond it greyed. Replaces the three cards visually while keeping their numbers in the labels.
  The only element on the page that is specific to buying fuel against a deadline.
