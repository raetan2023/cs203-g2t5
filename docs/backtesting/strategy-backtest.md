# Historical strategy versus buy-now

Policy: deadline-weighted-v1; holdout start: 2026-07-31

Same origin, quantity (100 MT), observed Singapore MGO price basis and deadline for both strategies. WAIT buys once on the policy's suggested date at its exact observed price. BUY_NOW and MONITOR buy at origin; MONITOR fallback is a simulation assumption, not product guidance. No hindsight minimum, interpolation, repeated monitoring, fees, freight, taxes, financing, slippage or volume discounts. Positive savings favour strategy; negative savings mean underperformance. Overlapping daily scenarios are not independent trades or a portfolio.

Forecast inputs are existing walk-forward point reports joined to historical quantile bounds on origin and target. Interval training labels must precede origin. This replay does not retrain or independently certify the source pipeline; historical bounds are experimental. Origins before the supplied holdout start are excluded to avoid evaluating shrinkage on its development sample. Origins require all three horizons so missing forecasts do not inflate buy-now ties. Outcomes use observations only after the decision. No claim of future advantage.

| Deadline days | Origin period | Last execution | Scenarios | WAIT | MONITOR | Wins / losses / ties | Average saved USD/MT | Worst USD/MT | Total saved USD |
|---|---|---|---:|---:|---:|---|---:|---:|---:|
| 7 | 2026-07-31 to 2026-09-09 | 2026-09-09 | 41 | 0 | 41 | 0 / 0 / 41 | 0.0000 | 0.0000 | 0.00 |
| 14 | 2026-07-31 to 2026-09-09 | 2026-09-09 | 41 | 0 | 33 | 0 / 0 / 41 | 0.0000 | 0.0000 | 0.00 |
| 20 | 2026-07-31 to 2026-09-09 | 2026-09-09 | 41 | 0 | 41 | 0 / 0 / 41 | 0.0000 | 0.0000 | 0.00 |
| 30 | 2026-07-31 to 2026-09-09 | 2026-09-09 | 41 | 0 | 41 | 0 / 0 / 41 | 0.0000 | 0.0000 | 0.00 |

Interpretation: compare the signed mean and loss count above. Zero savings indicate no demonstrated advantage over buy-now; MONITOR fallback ties are not evidence that waiting works.

Excluded interval rows without a matching point forecast or with training labels not strictly before origin: 0. Per-scenario outcomes: strategy-outcomes.csv. Results describe the bundled historical sample only.
