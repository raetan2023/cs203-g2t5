# CatBoost model — Singapore MGO bunker price

Part of the CS203 MGO project's model-comparison track. This folder is the **CatBoost
regression** model. It predicts the Singapore MGO bunker indication (`sg_mgo_themaritime`,
USD/metric tonne) from market signals, and is benchmarked against a persistence baseline.

Not wired into the backend or frontend — it's a standalone modelling experiment, like the
other regression models.

## What it does

- **Target:** observed MGO quote (USD/MT). Only **253 irregular observations** (2020→2026).
- **Features (all known *before* each MGO date — no look-ahead):**
  - Levels of gasoil, Brent, Dubai crude, broad USD index (liquid daily series)
  - 5- and 20-day % changes of those series (momentum)
  - Last observed HSFO / VLSFO bunker quotes
  - Last observed MGO value + days since it
- **The model predicts the *change* from the last MGO quote, not the price level.** Tree
  models can't extrapolate beyond the training price range, and MGO is sticky/near-daily, so
  modelling the level loses to persistence by construction. Predicting the delta makes the
  model "persistence + a learned adjustment" — a fair test of whether market signals help.
- **Baseline:** persistence (predict the last observed MGO). Deliberately a hard baseline.
- **Validation:** strictly chronological split (oldest 80% train, most recent 20% test),
  time-based early-stopping tail inside train. No random shuffling.

News / GDELT data is **not used**: the data context states it has zero date overlap with
observed MGO, so it cannot train or evaluate an MGO model.

## Results (most recent 50 observations, 2026-08-18 → 2026-10-06)

| Model | MAE (USD/MT) | RMSE (USD/MT) |
|---|---|---|
| **CatBoost (predicts change)** | 15.2 | **25.9** |
| Persistence (last MGO) | **14.0** | 26.5 |

- CatBoost **essentially ties** persistence: marginally worse on average error (MAE),
  marginally better on large-move error (RMSE), i.e. it catches some bigger swings a little
  better. Directional accuracy ≈ **56%** (just above a coin flip).
- **Most informative signal: gasoil's 20-day change** (≈32% of importance), followed by the
  gap since the last quote and the USD index's 20-day change. This gently supports the
  project's core hypothesis that gasoil carries information about MGO moves.

**Honest read:** with only ~200 sparse training points and a near-daily, sticky target,
*no* model should be expected to beat persistence by much — and this confirms that. The RMSE
edge is small (~2%) and within noise given 50 test points. The value here is the method
(leak-safe, benchmarked, chronologically validated) and the feature-importance signal, not a
claim of strong predictive power. Do not describe this as a validated MGO forecaster.

## How to run

```bash
pip install -r requirements.txt
python train_catboost_mgo.py \
  --market /path/to/market_observations.csv \
  --outdir ./output
```

Outputs written to `--outdir`: `catboost_mgo.cbm` (model), `feature_table.csv`,
`feature_importance.csv`, `metrics.json`, `mgo_predictions.png`.

## Files here

- `train_catboost_mgo.py` — the full pipeline (load → leak-safe features → train → evaluate → save)
- `metrics.json`, `feature_importance.csv`, `mgo_predictions.png` — the results above
- `requirements.txt`

## Limitations / honesty notes

- Same-day market closes have unverified publication timing, so features are lagged ≥1 day;
  lagging alone doesn't prove strict point-in-time availability.
- Monthly MPA sales were **not** used as features (release-timing/lag unresolved).
- 50 test points is small; treat the MAE/RMSE gap as indicative, not definitive.
- Trees can't extrapolate price levels — hence the change-based target. A level-based CatBoost
  scored MAE ≈ 122 and is the wrong framing for this series.
