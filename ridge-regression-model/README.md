# Ridge points and calibrated q10/q90 MGO price ranges

Forecast Singapore MGO prices (USD/metric tonne) at 7, 14 and 30 calendar days from the latest observed quote. Ridge supplies the central estimate and feature drivers. Independent standardized, L1-regularized `QuantileRegressor` models (q=.1/.9, alpha=.01, HiGHS solver) supply the price range. No new modelling dependency is needed.

## Train and run

```sh
pip install -r requirements-lock.txt # exact environment used by committed artifacts
# requirements.txt remains the supported minimum dependency list
python -m src.train --no-nowcast   # all forecast horizons, reports and matching artifacts
python -m pytest -q
uvicorn service.main:app --port 8000
# POST /predict {"horizon_days": 7}
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

The React widget is explicitly a synthetic preview. It can display the interval metadata, but still uses mocks: there is no Spring forecast proxy/live model connection. Serving reads local CSV; the Supabase loader remains a stub. `/nowcast` retains its existing observed/carried-forward/estimated behavior and legacy intervals; q10/q90 changes apply to forward horizons only.

Research and review decisions are recorded in [the implementation plan](../docs/calibrated-price-ranges-plan.md), based on [sklearn QuantileRegressor](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.QuantileRegressor.html) and [Romano et al., Conformalized Quantile Regression](https://arxiv.org/abs/1905.03222).
