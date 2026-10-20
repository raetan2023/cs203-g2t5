# Singapore gasoil → MGO regression experiment

This implements the two-stage approach in `docs/PRD.md`: forecast Singapore gasoil futures movement, then map it to an experimental MGO estimate. It is a research artifact, separate from the application's historical dashboard.

## Open the notebook

`gasoil_to_mgo.ipynb` contains a completed run, explanations, coefficients and evaluation tables. Open it in Jupyter or VS Code. Change `DATA_DIR` in the configuration cell if your cleaned-data folder is elsewhere. Run all cells to reproduce the analysis. A notebook environment additionally requires Jupyter; the command-line script only needs NumPy and pandas.

## Run the script

From the repository root:

```sh
python3 -m pip install -r "models/linear-regression/requirements.txt"
python3 "models/linear-regression/gasoil_regression.py" --data-dir /path/to/market_data_cleaned
python3 -m unittest discover -s "models/linear-regression" -p 'test_*.py'
```

In the current Codex workspace, the bundled Python already has the required dependencies:

```sh
/Users/nelsontan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 "models/linear-regression/gasoil_regression.py" --data-dir /Users/nelsontan/Downloads/market_data_cleaned
```

## What is being fitted?

1. **Gasoil regression:** next-trading-date decimal return is the dependent variable. Four independent variables are historical gasoil, Brent, Dubai and broad USD index returns. To be conservative about unverified same-day availability, predictors stop at the preceding gasoil trading date. Predictions are converted back into USD/barrel prices.
2. **MGO baseline:** predicted MGO = observed MGO origin price × (1 + predicted gasoil return). A reliable observed MGO price must exist at the same origin.
3. **Optional fitted mapping diagnostic:** MGO return = alpha + beta × gasoil return, fitted on training-period observed quote intervals. This is also linear regression, but evidence from irregular intervals does not establish daily accuracy. Its fitted intercept is not applied to the one-step forecast chain; calibration would need enough training pairs at the forecast horizon.

The first horizon is the next observed gasoil trading date, a modelling assumption for this initial experiment. It is not a confirmed team requirement. Monthly sales and news are excluded from this initial model.

## How evaluation works

- Gas oil data is split chronologically around 70% training, 15% validation and 15% test. Rows crossing split boundaries are purged. The model stays frozen after training.
- Missing source values are excluded before return construction; returns therefore span successive available observations, whose start and end dates are preserved. Backward as-of feature alignment permits at most seven calendar days of age. No future observations or synthetic MGO labels are used.
- Persistence predicts the origin price. It is the benchmark for both gasoil and MGO.
- The mapping diagnostic uses **realized** gasoil changes over adjacent observed MGO intervals of up to 30 calendar days. It checks the relationship, not the forecast model.
- The end-to-end evaluation uses **predicted** gasoil returns and only dates where both origin and next-trading-date MGO prices are observed. These may be a selective subset of all MGO observations.
- R² and MAE/RMSE are reported separately for returns/prices. Price-level R² alone is not evidence of useful forecasting. Coefficients describe associations, not causes.

## Generated outputs

All outputs go into `models/linear-regression/outputs/` by default; `--output-dir` can change this. Source files remain untouched.

| File | Contents |
|---|---|
| `report.md` | Readable specification, headline metrics and limitations |
| `results.json` | Source hash, configuration, coefficients, split dates and all evaluation metrics |
| `coverage.csv` | Selected series' counts, missing values and date ranges |
| `feature_candidates.csv` | Feature dates/ages, target dates, values and row exclusions |
| `gasoil_predictions.csv` | Eligible training/validation/test rows and gasoil forecasts |
| `mgo_pair_candidates.csv` | All adjacent MGO quote intervals before mapping exclusions |
| `mgo_mapping_pairs.csv` | Eligible paired intervals, splits and mapping estimates |
| `mgo_predictions.csv` | Observed origin/target MGO and end-to-end predictions |

The very first gasoil row has no previous-date feature cutoff and is removed before feature joining; the last has no target and is marked excluded. `results.json` reconciles candidates, complete rows and boundary purges.

## Interpreting this run

The first gasoil regression does **not** beat persistence on test MAE. This is a legitimate experimental result. It does not establish that linear regression cannot work, or that another horizon/features will help. Validation results can guide a future predeclared experiment; once test results inform changes, reserve new data for a new final evaluation.

Publication times, historical revisions, futures roll construction, MGO anchor freshness and forecast interval calibration remain unresolved. These must be investigated before presenting results as validated forecasts or purchase recommendations.
