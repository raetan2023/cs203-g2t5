# Buyer recommendation policy

Each saved purchase plan has one final `BUY_NOW`, `WAIT`, or `MONITOR` recommendation. All 7, 14 and 30 day forecasts remain visible. Selecting a forecast changes its cost detail, not the final recommendation. No purchases are executed.

## Selection and weights

The Spring `PlanAnalysisService` loads all three horizons through the injected forecast provider. `RecommendationPolicy` is a pure Java policy using decimal arithmetic. The saved plan supplies the deadline and quantity; the Singapore operational date supplies today. Existing organisation access and saved-context checks remain in the controller/service path.

1. Calculate calendar days remaining. An overdue plan produces MONITOR with an instruction to update the plan.
2. Keep available, comparable forecast targets strictly after today and on or before the deadline. After-deadline predictions never influence the signal. Use actual target dates, which may be anchored to an earlier observed quote, rather than assuming horizon labels mean days from today.
3. Select the two eligible targets closest to the deadline. If a target matches the deadline exactly, use it at 100%. If only one is eligible, use it at 100%. Do not invent missing forecasts or extrapolate prices.
4. Otherwise weight each of the two targets by inverse distance to the deadline. For distances `near` and `far`, the nearer weight is `far / (near + far)`; the other is `near / (near + far)`. Apply the same weights to point prices and lower/upper uncertainty bounds.
5. Compare the weighted signal with today's dated reference price. A lower signal with its entire range below the reference produces WAIT at the nearest eligible target. A higher signal with its entire range above the reference produces BUY_NOW. Overlap, equality, or disagreement between the point and range produces MONITOR. References older than seven days also produce MONITOR when a signal is available.
6. If no forecast fits but a valid reference is available, BUY_NOW is the only priced option. Missing reference produces MONITOR without invented savings.

For a deadline in 20 days, day 7 and day 14 qualify; day 30 is excluded. Their distances are 13 and 6 days, giving day 7 a 31.58% weight and day 14 a 68.42% weight. At $710 and $695/MT, the blended signal is $699.74/MT. Against today's $720/MT, potential savings are $20.26/MT. If the weighted upper bound is below $720, recommend buying on day 14. If the range overlaps $720, recommend monitoring and show day 14 as a date to reassess.

This is a blended signal for one purchase date, not a forecast for that date and not a split purchase. Weighted bounds are descriptive experimental uncertainty, not a calibrated confidence interval or probability. These product rules are advisory and do not establish a validated purchasing advantage.

## API and evidence

`GET /api/v1/purchase-plans/recommendation` retains Clerk authentication, organisation-scoped access, `plan_id`, saved quantity/deadline preconditions and `scenario_as_of_date`. Optional `horizon_days` and `run_id` still select/pin the response's forecast and cost details; the recommendation always compares all horizons. Different available run IDs during one read produce HTTP 409 so snapshots cannot be blended. Horizon-specific model versions may differ within the same run.

`urgency` remains accepted and echoed for compatibility but does not override price/uncertainty rules. The UI no longer exposes an urgency control. `SPLIT` and allocations are retained in transport types for older responses; this policy emits no split allocation. Policy version is `deadline-weighted-v1`.

The response keeps its existing shape. Evidence includes direction (`UP`, `DOWN`, `FLAT`, or `UNAVAILABLE`), weighted range width/reference, reference age, reasons including target eligibility and weights, limitations, suggested date, buy-now cost, alternative cost and alternative-minus-now difference. For WAIT or a cheaper MONITOR signal, alternative cost is weighted price times quantity. When buying today is cheaper, alternative cost equals buy-now cost and savings are zero. Overdue or missing-reference recommendations have no alternative cost or suggested date.

The UI reverses the signed difference to display positive potential savings. It labels these totals as estimates from the recommendation signal, separately from the selected horizon's cost impact. Monetary rounding is for display only. Estimated costs exclude freight, fees, taxes and live supplier pricing. Confirm a current supplier quote before acting.

Provider errors remain HTTP 503, invalid inputs 422, missing/inaccessible plans 404, missing authentication 401 and saved-plan/run conflicts 409. The policy itself requires no database migration. The approval workflow stores the validated recommendation and selected cost detail in its existing submission snapshot; see [plan submission](plan-submission.md).

## Verification

Run from the repository root:

```sh
./backend/mvnw -f backend/pom.xml test
npm ci --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
npm run test:recommendation-layout --prefix frontend
```

Tests cover weighted values and uncertainty, missing forecasts, exact/short/overdue deadlines, today cheaper, one-date behavior, saved-plan access, cross-snapshot rejection and selection-independent guidance. Layout checks cover 320–1920px, disclosures, forecast selection, deadline guards and large totals. The default suite skips the opt-in live Ridge integration test; local fixtures and mocked identity/database tests do not verify deployed Clerk/Supabase behavior.
