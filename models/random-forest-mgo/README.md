# Random Forest model — Singapore MGO bunker price

Part of the CS203 MGO project's model-comparison track (MPP-42). This folder is the
**Random Forest regression** model. It predicts the Singapore MGO bunker indication
(`sg_mgo_themaritime`, USD/metric tonne) from market signals, and is benchmarked against a
persistence baseline.

Not wired into the backend or frontend — it's a standalone modelling experiment, like the
other regression models. ML integration is planned for next sprint.

## Same setup as CatBoost, on purpose

This model copies the CatBoost model's setup (`models/catboost-mgo`) so the two can be
compared like-for-like:

- **Same features**, all known *before* each MGO date (no look-ahead): levels and 5/20-day
  % changes of gasoil, Brent, Dubai crude and the broad USD index; last observed HSFO /
  VLSFO quotes; last observed MGO value + days since it.
- **Same target framing:** the forest predicts the *change* from the last MGO quote, not
  the price level. Trees can't extrapolate beyond the training price range, so this makes
  the model "persistence + a learned adjustment".
- **Same split:** oldest 80% train, most recent 20% (50 observations) test. No shuffling.
- **Same baseline and metrics:** persistence (last observed MGO), MAE / RMSE in USD/MT,
  directional accuracy.

What's different:

- **Hyperparameters** (`max_depth`, `min_samples_leaf`, `max_features`) are picked by
  4-fold expanding-window time-series CV inside the training set. The test set is never
  used for selection.
- **Prediction intervals.** Every tree makes its own prediction, so the 10th–90th percentile
  across the 500 trees gives an 80% interval for each forecast. This is the uncertainty
  information the backend integration will need next sprint.

## Results (most recent 50 observations, 2026-08-18 → 2026-10-06)

| Model | MAE (USD/MT) | RMSE (USD/MT) |
|---|---|---|
| Random Forest (predicts change) | 16.7 | **25.7** |
| CatBoost (predicts change), for reference | 15.2 | 25.9 |
| Persistence (last MGO) | **14.0** | 26.5 |

- Like CatBoost, the forest **essentially ties** persistence. Its average error (MAE) is a
  bit worse, and its error on big moves (RMSE) is slightly better: the lowest of the three,
  but only by about 3%. Directional accuracy is **52%**, which is a coin flip.
- **80% interval:** the true price fell inside it **72%** of the time, against the 80%
  target. Average width is about $31/MT. Tree spread slightly *understates* the real
  uncertainty. Next sprint we should either widen it (calibrate on CV residuals) or label
  it as approximate.
- **Most informative signals:** days since the last quote (16%), then **gasoil's 20-day
  and 5-day changes** (15% and 13%), then Brent's 5-day change. This matches the CatBoost
  finding that gasoil momentum carries some information about MGO moves.
- Selected settings: `max_depth=3`, `min_samples_leaf=20`, `max_features=0.33`. That is a
  heavily regularised forest, which is what you'd expect with ~200 training rows.

**Honest read:** with ~200 sparse training points and a sticky, near-daily target, no model
should be expected to beat persistence by much, and this one doesn't. Do not describe it
as a validated MGO forecaster. What it adds is a second, independent tree model agreeing
with CatBoost on the gasoil signal, plus a working uncertainty estimate.

### Note on tuning

The first version picked hyperparameters on a single 30-point validation tail. That chose
unpruned trees (`max_depth=None`, `min_samples_leaf=3`) that memorised the volatile 2022
swings. They then predicted ±$50–85 moves that never happened: test MAE 26.8, intervals
about $200 wide. Switching to multi-fold time-series CV fixed this. That was the only change
made after looking at test results; none of the hyperparameters were tuned against the test
set.

## How to run

The data file isn't committed here. `market_observations.csv` lives on the
`ridge-regression` branch at `ridge-regression/data/raw/market_observations.csv`.

```bash
pip install -r requirements.txt
python train_random_forest_mgo.py \
  --market /path/to/market_observations.csv \
  --outdir ./output
```

Takes about 15 seconds. Outputs written to `--outdir`:

- `random_forest_mgo.joblib`: `{"model": RandomForestRegressor, "feature_cols": [...]}`.
  The model predicts the *change*; add `lag_mgo` to get the price.
- `metrics.json`: the results above, plus interval coverage and selected parameters
- `test_predictions.csv`: per-date actual, predicted, 80% interval, persistence
- `feature_importance.csv`, `feature_table.csv`, `mgo_predictions.png`

## Limitations / honesty notes

- Same-day market closes have unverified publication timing, so features are lagged ≥1 day.
  Lagging alone doesn't prove strict point-in-time availability.
- Monthly MPA sales were **not** used as features (release-timing/lag unresolved).
- 50 test points is small; treat the MAE/RMSE gaps as indicative, not definitive.
- The interval comes from tree disagreement, not a calibrated predictive distribution
  (72% observed vs 80% nominal).
- The saved model was trained with scikit-learn 1.7. Load it with a matching version.
