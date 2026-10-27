# Buyer recommendation policy

The authenticated saved-plan recommendation endpoint now returns one of `BUY_NOW`, `SPLIT`, `WAIT`, or `MONITOR`, with deterministic reasons and numerical evidence. This is an advisory heuristic, not a validated procurement strategy. It never submits orders or executes purchases.

## Inputs and API

`GET /api/v1/purchase-plans/recommendation` uses the existing Clerk bearer token and plan ownership checks. Send `plan_id`, `quantity_mt`, `purchase_deadline`, `scenario_as_of_date`, optional `horizon_days` (7, 14, 30; default 7), optional `run_id` to pin the shared forecast, and optional `urgency` (`LOW`, `NORMAL`, `HIGH`; default `NORMAL`). The quantity and deadline must match the authenticated user's saved plan. Urgency is an analysis preference, deliberately not persisted; reopening the page resets it to NORMAL. The UI labels this explicitly. No database migration is required.

The existing `reference`, `forecast`, and `cost_impact` fields remain. `recommendation.value` contains `recommendation_id`, `action`, `explanation`, and `evidence`: policy version, urgency, point direction, interval width fraction, buy-now and full-quantity alternative costs, signed difference, reference age, selected supported target, horizon description, reasons, limitations, and optional illustrative allocations. Unknown numeric/date values are null. A ready MONITOR can accompany unavailable price provenance: availability describes source evidence, not the ability to issue cautious monitoring advice. Provider outages remain HTTP 503, invalid requests 422, missing/other-owner plans 404, missing authentication 401, and edited plan/run conflicts 409.

## Rules in precedence order

Thresholds live together in `RecommendationPolicy.DEFAULT`, a named `Config` passed to the independently testable policy. Changing defaults requires a version review. Fractions use the reference USD/MT price as denominator.

1. Past deadline: MONITOR with an immediate overdue-plan review and supplier contact. It gives no future purchase schedule.
2. Same-day or next-day deadline: BUY_NOW, meaning seek a quote now for operational reasons. It explicitly does not imply a reliable forecast.
3. Insufficient evidence: MONITOR, review by the next calendar day and before the deadline. High urgency adds immediate supplier contact.
4. HIGH urgency with usable evidence: BUY_NOW to prioritise supply, regardless of direction or interval width.
5. Absolute point change below 1%: MONITOR. Equality at 1% is material. This avoids reacting to negligible estimates; it is not an empirically fitted threshold.
6. Material change with interval width at least 10% of reference: SPLIT. Wide ranges make timing concentration less attractive under this heuristic. Equality at 10% is wide.
7. Otherwise: materially rising point estimate means BUY_NOW; materially falling means WAIT until the selected forecast target, with a next-day evidence review.

LOW and NORMAL both permit waiting or splitting; only HIGH adds a supply-priority override. The imminent window is 1 calendar day, the maximum reference age is 7 calendar days inclusive, and the illustrative split is exactly 50% now and the remaining quantity at the forecast target. These choices are simple product heuristics, not optimised parameters. Supplier minimum lots and availability are unknown and must be checked. Allocations remain positive, sum exactly to the requested quantity using decimal arithmetic, and occur by the deadline. Full-quantity alternative cost is clearly labelled; it is not the estimated cost of the split.

## Evidence and limitations

Direction is `(point - reference) / reference`. Interval width is `(upper - lower) / reference`; the interval is not interpreted as a probability of either direction. Independent point forecasts can lie outside quantile bounds. Empty, inverted, incomplete, nonpositive, nonfinite, missing, future-dated references and nonfuture forecast targets cannot support price-driven timing. Prices must describe the identical commodity in USD/MT. Quantity must be positive and finite. Historical scenario dates use the existing backend clock, not the device clock. The provider retains responsibility for selecting the latest valid supported source observation and checking publication freshness/news timestamps.

Buy-now cost is `reference × quantity_mt`. Alternative cost is `forecast_point × quantity_mt` only for comparable evidence with a target inside the purchase window. Signed difference is **alternative minus buy-now**: positive means waiting costs more, negative means less. These are estimates against a dated observation, not live supplier offers. Freight, fees, taxes, financing, transaction costs, currency conversion and executable prices are unavailable and excluded. No quantity or conversion is invented.

The selected target and source horizon description are exposed. A target after the deadline produces MONITOR unless the deadline is imminent; no within-window alternative cost is fabricated. A deadline beyond the selected horizon remains valid, but any WAIT or SPLIT ends at that target. There is no extrapolated deadline-price forecast. Experimental interval warnings remain visible; the feature claims no guaranteed savings, calibrated coverage, or proven purchasing advantage.

## UI and verification

Open a saved plan's recommendation page and choose urgency. The page shows the outcome, reasons, dated reference, point and interval, comparable costs, signed difference, freshness, target, policy version and limitations. It continues to request cautious guidance when no supported horizon fits. Shared-forecast loading/error states clear prior guidance; unavailable forecast data can still produce MONITOR through the backend. Existing request scopes now include urgency, plan inputs, scenario, horizon and run ID, preventing older responses from overwriting new results.

Run from the repository root:

```sh
./backend/mvnw -f backend/pom.xml test
npm ci --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
```

Policy tests cover all four outcomes, precedence, exact material/width/age/deadline boundaries, missing/malformed evidence, units, cost signs, configurable thresholds and exact split quantities. HTTP tests exercise real local Spring routing with stubbed token/database dependencies, ownership, urgency validation and cost evidence. Frontend tests cover the transport contract, evidence display and late urgency responses. Live Clerk/Supabase/inference testing requires separately available credentials and services; mocked integration is not evidence of a successful deployed flow.

## Verification on 26 October 2026

- Backend default suite: 85 passed; one opt-in live test initially skipped.
- Subsequently ran that live test with `RUN_RIDGE_LIVE=true` using the existing local database configuration and Python model environment: 1 passed, no failures. It read existing saved plans and market/news observations and verified actual Ridge inference plus normal forecast, cost-impact and recommendation controllers. Identity resolution was stubbed; no database writes or purchases were performed.
- Frontend full suite: 168 passed across 17 files.
- TypeScript check and Vite production build: passed. Vite reports a bundle over 500 kB; no dedicated lint command is defined in this repository.
- `git diff --check`: passed.
- Browser verification reached the real Clerk sign-in screen. Full signed-in browser interaction was not completed because this browser had no authenticated session. The temporary development server and tab were closed.

Changes remain local on `feature/buyer-recommendation-rationale`. Nothing was pushed, merged or deployed, and Jira was not changed.
