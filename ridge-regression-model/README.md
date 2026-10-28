# Daily GDELT-informed publication

The normal app uses the **batch pipeline**, not an always-on Python API. Run `python -m src.daily_pipeline --work-dir work` for daily inference and add `--retrain` for explicit weekly training; `--apply` atomically publishes to Supabase. GitHub Actions orchestrates this at 08:17 Singapore, with schedules disabled until setup/manual verification. See [operations and historical backfill](../docs/daily-forecast-operations.md) and the approved [root plan](../plan.md).

`src/daily_model.py` trains chronological out-of-sample Ridge centres at actual decision dates and q10/q90 models on log-price errors conditioned on market features and historical GDELT features, with the latest complete 24-hour window used for live inference. Genuine complete older news archives are required; recent DOC retention alone cannot satisfy the evaluation gates. Insufficient/stale inputs yield explicit unavailable results, never example or market-only substitutes. Dashboard and recommendation screens read the same published run through Java; buy/wait advice remains a separate unavailable policy.


## Legacy quote-origin experiments

The commands, artifacts and FastAPI endpoint below are retained for reproducible research. They are **not** the new GDELT daily publication path, and their existing reports must not be presented as news-informed evaluation.

### Ridge points and calibrated q10/q90 MGO price ranges

Forecast Singapore MGO prices (USD/metric tonne) at 7, 14 and 30 calendar days from the latest observed quote. Ridge supplies the central estimate and feature drivers. Independent standardized, L1-regularized `QuantileRegressor` models (q=.1/.9, alpha=.01, HiGHS solver) supply the price range. No new modelling dependency is needed.

## Train and run

```sh
pip install -r requirements-lock.txt # exact environment used by committed artifacts
# requirements.txt remains the supported minimum dependency list
python -m src.train --no-nowcast   # all forecast horizons, reports and matching artifacts
python -m pytest -q
uvicorn service.main:app --port 8000
# POST /predict {"horizon_days": 7}, POST /nowcast, POST /explain {"horizon_days": 7, "top_k": 5}
python -m src.evaluate_new        # score new mature quotes with frozen artifacts
```

Place `market_observations.csv` in `data/`, or set `MGO_DATA_DIR` to its directory. Data are not fetched automatically. Only observed MGO quotes form labels; they are never interpolated. Targets are the nearest later quote within +/-3 days of origin+h. Publication lags remain assumptions (Brent three days, USD five days), because source availability timestamps are missing.


## Chronological calibration and evaluation

At each backtest origin, only labels with `target_date < origin` are available. Reserve the last 20 mature rows for calibration, and purge proper-training labels reaching the first calibration origin. Require at least 30 proper-training rows **after** purging. Both quantile scalers/models fit only this proper prefix. Insufficient backtest origins are skipped; insufficient final training fails explicitly.

Order raw endpoints to repair crossings. Calibration scores are `max(q10-y, y-q90, 0)` in log-return units. Expand both sides by the `ceil((n+1)*.8)` order statistic (17th of 20 calibration scores). Calibrated endpoints are not exact q10/q90 predictions. Ridge predictions remain independent and may fall outside the range; they are neither clamped nor used to widen it.

The baseline carries the last MGO price forward, with a symmetric interval calibrated from absolute log returns on the **same 20 quotes**. Reports compare raw, calibrated and baseline intervals on identical eligible rows: coverage, both tail miss rates, mean price width, 80% interval score, and sorted-endpoint log-return pinball losses. Development requires both origin and target before `DEV_END`; holdout origins start at `DEV_END`. Origins straddling that boundary remain in all-row diagnostics only.

`reports/quantile_backtest_{h}d.csv` and `quantile_metrics_{h}d.json` are the new interval evidence. `metrics_summary.json` also includes it under `quantile_intervals`. Existing Ridge point metrics and legacy symmetric-range diagnostics remain separate. The range rule and regularization are fixed, not selected against holdout coverage. Historical data have already been examined during earlier project work, so this is a chronological retrospective evaluation, not a new untouched prospective trial.

## Artifacts and API

Each horizon needs `ridge_{h}d.joblib`, its JSON metadata and `quantile_{h}d.joblib`. Train them together; a shared run ID, horizon, version and latest used target date guard against mismatched artifacts. Missing/obsolete interval artifacts return HTTP 503 and require retraining. Historical requests whose anchor predates the latest used training/calibration target return 422; use walk-forward reports for historical evaluation. Requests on or after an anchor-based target date return 422 because that forecast has expired. Frozen forward evaluation uses origins strictly after that latest target date, never retrains, and keeps the original development cutoff.

`/predict` preserves `forecast`, `low`, `high` and `top_drivers`, and adds:

- `raw_q10_price` / `raw_q90_price`: sorted, crossing-repaired uncalibrated endpoints.
- `target_date`: anchor quote date plus horizon, even when the requested date is later.
- `interval`: method, nominal coverage (.8), chronological holdout empirical coverage and paired count, baseline coverage, both mean widths, evaluation scope and limitations. Empty cohorts have null metrics, not fabricated scores.

The latest artifact is intended for inference after its data cutoff, not historical replay. Frozen evaluation assumes quote arrival corresponds to the recorded observation date; real publication timestamps are unavailable. Same-day serving uses the observed quote already present in the input data.

## Limits and integration status

Nominal 80% is a target, **not a guaranteed probability**. Market series and overlapping horizons are dependent, ordinary exchangeability assumptions do not hold, calibration uses only 20 quotes, and total MGO history has just 253 irregular observations. Coverage alone does not establish quality; compare width, interval score and baseline too. Quantile ranges are experimental and may underperform persistence. GDELT is not a forecast input.

The legacy FastAPI endpoint still reads local CSV. The purchase-plan endpoint executes the saved Ridge artifacts through the private `src.purchase_inference` adapter, using a validated Supabase price history supplied in memory by the Java backend. It includes same-day observed MGO quotes, excludes future observations, preserves the existing feature publication lags, and has no CSV fallback. Futures marked `source-defined` are accepted only for the exact USD/barrel product URLs verified in `data/series_dictionary.json`; no values or database units are converted. Purchase horizons outside the saved deadline are disabled; if none fits, the page shows the dated reference cost and explains the unsupported window. The dashboard continues to use the separate published batch path described above; mocks are limited to explicit preview/tests. `/nowcast` retains its existing observed/carried-forward/estimated behavior and legacy intervals; q10/q90 changes apply to forward horizons only.

Research and review decisions are recorded in [the implementation plan](../docs/calibrated-price-ranges-plan.md), based on [sklearn QuantileRegressor](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.QuantileRegressor.html) and [Romano et al., Conformalized Quantile Regression](https://arxiv.org/abs/1905.03222).
