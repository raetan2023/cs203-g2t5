# Buyer price range implementation: verified results

Based on `origin/main` f395627, implemented on `feature/calibrated-price-ranges`. Three independent subagents reviewed the plan and changes; modelling and statistical reviewers found no remaining blockers after revisions.

## What changed

The active forecasting service now trains independent regularized q10/q90 models with a purged chronological calibration suffix. It returns ordered, positive calibrated price bounds, raw sorted quantile endpoints, target dates, nominal coverage, and measured chronological holdout coverage with a paired persistence comparison. Ridge central forecasts and feature drivers remain separate. Missing/mismatched interval artifacts, retrospective requests, and expired targets fail explicitly. Frozen evaluation never retrains and starts only after the latest used target date.

The dashboard widget remains a clearly labelled synthetic preview. It displays coverage metadata when provided, does not invent measured mock coverage, and anchors forecast dates to the physical quote. This work does not deploy services or implement the separate Spring forecast proxy.

## Real-data chronological holdout

| Horizon | Paired forecasts | Quantile coverage | Persistence coverage | Quantile mean width, USD/MT | Persistence mean width, USD/MT | Quantile interval score | Persistence interval score |
|---|---:|---:|---:|---:|---:|---:|---:|
| 7 days | 64 | 79.7% | 82.8% | 387.46 | 250.69 | 457.09 | 307.01 |
| 14 days | 57 | 78.9% | 82.5% | 648.66 | 398.96 | 770.02 | 567.02 |
| 30 days | 41 | 85.4% | 100.0% | 724.36 | 571.44 | 784.23 | 571.44 |

After maturity and proper/calibration purges, 107 of 164 total horizon rows were evaluable at 7d, 79 of 144 at 14d, and 51 of 131 at 30d. Early insufficient-history origins are skipped. Development/holdout counts are respectively 36/64, 8/57, and 0/41; boundary-straddling labels appear only in all-row diagnostics.

Nominal coverage is 80%; lower interval score is better. All comparisons use the same paired origins within each horizon. The persistence baseline is narrower and scores better at every horizon. The implementation fulfills the q10/q90 training and honest chronological comparison story, but the quantile method does **not** demonstrate an advantage over persistence. It remains experimental. Do not select a new method against these results and then relabel this same holdout as untouched.

Quotes are sparse, labels overlap, source publication dates are assumed, and targets can be within +/-3 days of nominal horizon. These are empirical retrospective coverage rates, not guaranteed buyer probabilities. Both tail miss rates and raw endpoint losses are available in the machine-readable reports.

## Reproduce

From `ridge-regression-model/`, after dependency installation and providing the data:

```sh
../.venv/bin/python -m src.train --no-nowcast
../.venv/bin/python -m pytest -q
../.venv/bin/python -m src.evaluate_new
```

The CSV was copied unchanged from the existing reference checkout's `models/ridge-regression/data/raw/market_observations.csv` into the ignored `ridge-regression-model/data/` directory. SHA-256: `abbb18839f136aa94c413dc2bbe63a3f04b2b11233b9853fd5762093c97a7bbc`. The source has 253 observed MGO quotes through 6 October 2026; this does not represent a fresh market-data collection.

Training runtime: Python 3.14.7, NumPy 2.5.4, pandas 3.1.0, scikit-learn 1.9.1, SciPy 1.18.1, joblib 1.6.0. The serialized artifacts should be loaded with the same sklearn environment; source requirements remain minimum versions; requirements-lock.txt records the exact validated environment. Frozen prior baseline artifacts were preserved.

Machine-readable evidence: `ridge-regression-model/reports/quantile_metrics_{7,14,30}d.json` and paired row CSVs. Active quantile artifacts and Ridge metadata carry matching training-run IDs.

## Validation

- Frontend: 125 tests passed; TypeScript/Vite production build passed.
- Real artifacts: all three horizon responses validate against PredictResponse; FastAPI `/predict` returns 200 with interval metadata, historical request returns 422. Frozen forward evaluation correctly reports no new eligible observations in this unchanged data snapshot.
- Independent artifact review: label maturity, proper/calibration purges, positive ordered finite bounds, shared training IDs/cutoffs, and CSV-to-JSON holdout coverage all passed.
- Python: all 37 tests passed (337.31 seconds); 8 focused quantile/API checks also passed after the final contract refinements. The existing Starlette/httpx test-client deprecation warning does not affect the result.
- Final real-artifact smoke check confirms expired targets return 422 and current artifact-cutoff inference returns 200.
- Git whitespace/error check passed.
