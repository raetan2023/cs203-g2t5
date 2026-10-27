# Recommendations page revamp v1 (2026-10-28)

Built from the Monitor, Buy now and Wait mockups in `docs/ui-revamp/assets/inspo/recommendations-page/`.
Split is not built: `RecommendationPolicy` (deadline-weighted-v1, since `eef312a`) only returns BUY_NOW, WAIT or MONITOR.
Screenshots here come from the preview states "Recommendation - Monitor / Buy now / Wait" at 1440px and 390px.

## Layout

Answer (action, next step, backend reason, cost tiles), then a sticky decision rail (plan, deadline, cost, approval,
Refresh prices), then evidence (compare buying dates, explored-date detail, limitations notice), then fine print
("How this recommendation was calculated", "Assumptions and data sources"). On narrow screens the rail follows the answer.

## Behaviour kept from main

- The recommendation, cost impact, publication pinning, stale-response guards and approval gating are unchanged.
- Selecting an eligible column still chooses the cost detail sent for approval (PR #34). Today and after-deadline
  columns are explore-only. After-deadline totals are price × quantity, labelled "shown for comparison only",
  because the backend returns no cost impact past the deadline.
- Wait shows the policy's own estimate (`evidence.alternative_cost_usd`, the blended signal), not the raw 30-day range,
  so the answer and the rail agree with the backend's explanation.

## How each window's price is calculated (checked 2026-10-28)

- Purchase page: `/api/v1/purchase-plans/forecast`, one Ridge model and one Python run per horizon.
  Central = anchor × exp(gamma × ridge prediction). All committed artifacts (`ridge_{7,14,30}d.json`) have
  `gamma: 0.0`, so the central price equals today's quote for every horizon.
- Bounds: per-horizon q10/q90 quantile models plus a split-conformal correction (20 calibration rows), widened by
  a GDELT news multiplier of 1–2×. Nothing forces longer horizons to be wider, so 14-day can be wider than 30-day.
- Targets count from the quote date, not today. The dashboard's `/api/v1/forecast` counts from today.
- With gamma = 0 the policy sees "forecast = today" with a range straddling today, so production plans will almost
  always get MONITOR (or BUY_NOW when no horizon fits) until the model shows skill.
- The old preview looked inconsistent because its numbers were hand-typed across three unrelated fixtures
  (2025 plan, 2026 forecasts, a separate "685/MT" recommendation). The new preview states use one data set.

## Open for the recommendation-engine owner

- Split: keep out, or add to the policy and approval flow?
- Should the approval cost detail default to the horizon whose target is the WAIT date (currently the first fitting one)?
- The 7-day horizon disappears once the quote is 7+ days old (`predict.py`), while 14/30 remain.
- Rise/fall direction colours (Phase 5 palette) are not applied yet; direction is in words ("less"/"more").
