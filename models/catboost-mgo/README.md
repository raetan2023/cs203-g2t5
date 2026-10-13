# CatBoost model — gasoil forecast + experimental MGO mapping

CS203 MGO project, model-comparison track. This is the **CatBoost** candidate. It uses
the **same evaluation pipeline as the team's linear/ridge regression** and swaps the
linear model for CatBoost, so the result tables are directly comparable.

## Method (matches the team's protocol)

- Predict the next observed gasoil trading-day **return** from four historical returns
  (gasoil, Brent, Dubai, broad USD), predictors lagged to the previous gasoil trading
  date (backward as-of join, 7-day max age).
- Chronological **70/15/15** split (train/validation/test); boundary-crossing labels purged.
- **Gasoil price** = origin × (1 + predicted return); baseline = origin price.
- **MGO (experimental)** = only where a real MGO quote exists at *both* the gasoil
  forecast origin and the next trading date, the predicted gasoil % move is applied to
  the MGO origin price; baseline = MGO origin. No interpolation or carry-forward.

Because the pipeline is identical to the team's, the unchanged-price baselines reproduce
theirs exactly (Gasoil 1.9345 / 4.3143, MGO 25.4329 / 42.7309).

## Results (test fold)

| Test metric | CatBoost | Unchanged-price baseline |
|---|---|---|
| Gasoil MAE (USD/barrel) | **1.9262** | 1.9345 |
| Gasoil RMSE (USD/barrel) | **4.2978** | 4.3143 |
| MGO MAE (USD/tonne) | **25.3567** | 25.4329 |
| MGO RMSE (USD/tonne) | **42.1496** | 42.7309 |

CatBoost is marginally at-or-below the baseline on every metric, and edges out both
linear (MGO MAE 25.4610) and ridge regression. **Honest read:** all models essentially
tie the unchanged-price baseline — the market signals give only a marginal edge on this
sparse data. CatBoost is the narrow best, not a decisive winner.

## Run

```bash
pip install -r requirements.txt
python train_catboost_mgo.py --market /path/to/market_observations.csv --outdir ./output
```

Outputs: `metrics.json`, `comparison_table.csv`, `gasoil_predictions.csv`, `mgo_predictions.csv`.

## Limitations

- Forecast horizon (next gasoil trading day) is an initial choice, not a confirmed requirement.
- MGO quotes are sparse; the test subset is small, and exact date matches don't prove
  contemporaneous publication.
- News and monthly sales are excluded (news has no MGO date overlap; sales need release-date rules).
- Not a validated purchasing forecaster — an initial experiment.
