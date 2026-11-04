# Strategy backtest (MPP-118 / MPP-119)

Run from the repository root with Java and Maven available:

```sh
./backend/mvnw -q -f backend/pom.xml compile exec:java \
  -Dexec.mainClass=com.cs203.mgodataapi.StrategyBacktest \
  '-Dexec.args=ridge-regression-model/reports docs/backtesting 2026-07-31'
```

The final argument must be on or after the point model's shrinkage development cutoff (`DEV_END` in `ridge-regression-model/src/config.py`). The checked-in report uses the bundled CSV files and their 2026-07-31 cutoff. If inputs or tuning change, choose the appropriate new cutoff and regenerate both output files.

Read [the generated report](strategy-backtest.md) for the evaluation period, signed average USD/MT saved, action counts, loss counts and assumptions. [Scenario results](strategy-outcomes.csv) record actual costs for auditing. Each deadline is a separate experiment; do not combine totals across deadlines. Total savings is a sum of hypothetical scenarios, not a realised portfolio return.

This invokes `RecommendationPolicy` directly, avoiding a duplicate implementation. Forecasts enter the decision; observed execution prices enter only the scoring step. A WAIT purchases at the suggested target's actual price, never at the blended prediction. MONITOR has no executable product strategy, so this benchmark explicitly falls back to immediate buying. No forecast is substituted for a missing realised price. Incomplete horizon sets are excluded. The tool fails on conflicting observations or duplicate forecast keys.

The source walk-forward point pipeline purges training labels at each origin, but chooses shrinkage on its development period. The interval report supplies its last training target date, checked against each origin. Input availability lags and market observations retain the model pipeline's assumptions; this is a retrospective simulation using bundled reports, not archived live recommendations or independently verified supplier quotes. No statistical significance or future profit claim is made.

Verify:

```sh
./backend/mvnw -f backend/pom.xml test
```

Regression tests cover a losing WAIT, MONITOR fallback despite a cheaper future outcome, missing execution observations, and quantity scaling. Existing policy tests cover deadline selection, blending and uncertainty.
