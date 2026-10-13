# MGO forecasting model comparison

This document compares the team's four trained model types using the saved training scripts and evaluation artifacts available on 13 October 2026. It reports existing experiments; no models were retrained for this comparison.

**There is no established overall winner.** CatBoost and Random Forest share a test setup, but linear regression and Ridge use different targets, forecast origins and evaluation samples. Their raw errors cannot fairly rank all four models.

## How each model predicts MGO

Let `M_previous` be the previous observed MGO quote, in USD/metric tonne.

| Model | Learning method | Predicted quantity | Final MGO estimate |
|---|---|---|---|
| Linear regression | Ordinary least squares on historical market returns | Next observed gasoil trading-date return | `M_previous × (1 + predicted_gasoil_return)` |
| Ridge regression | Linear regression with an L2 coefficient penalty and standardized inputs | MGO return relative to the previous observed quote | `M_previous × (1 + predicted_mgo_return)` |
| CatBoost | Decision trees built sequentially to improve the fitted predictions | MGO dollar change relative to the previous observed quote | `M_previous + predicted_mgo_change` |
| Random Forest | Multiple trees trained on sampled data, with predictions averaged | MGO dollar change relative to the previous observed quote | `M_previous + predicted_mgo_change` |

Linear regression explicitly forecasts gasoil first and transfers that forecast's percentage movement to MGO. The final transfer assumes equal percentage movement; the separately fitted gasoil-to-MGO mapping diagnostic is not used in that forecast chain.

Ridge, CatBoost and Random Forest predict MGO movement directly. Gasoil is an explanatory input rather than a separately forecast intermediate target. Converting a predicted MGO return or dollar change into an MGO price is not a gasoil-to-MGO mapping.

For illustration, with a previous MGO quote of $700/tonne, a 2% predicted gasoil return gives the linear regression pipeline an MGO estimate of $714. Ridge reaches $714 if it predicts a 2% MGO return; CatBoost and Random Forest reach $714 if they predict an MGO increase of $14/tonne. These are examples, not saved forecasts.

## Inputs and training

| Model | Inputs | Training and evaluation |
|---|---|---|
| Linear regression | Historical gasoil, Brent, Dubai and broad USD index returns | Chronological approximately 70/15/15 split; boundary-crossing labels purged. OLS fitted on 1,754 gasoil training rows and frozen for validation/test. Predictors stop at the preceding gasoil trading date, with a seven-calendar-day maximum feature age. |
| Ridge regression | Lagged market levels, returns, volatility, gasoil–Brent and Brent–Dubai spreads, bunker quotes/spreads, quote age and gasoil return over the MGO quote interval | StandardScaler plus Ridge; penalty selected using RidgeCV. Expanding-window walk-forward evaluation starts after 50 historical observations and evaluates 201 subsequent quotes. |
| CatBoost | Gasoil, Brent, Dubai and USD levels and 5/20-calendar-day changes; previous HSFO/VLSFO quotes; previous MGO quote and quote age | 252 usable MGO observations: earliest 202 allocated to training/validation, latest 50 to test. Within the 202, 172 fit the model and 30 provide validation. MAE loss, depth 4, learning rate 0.03, L2 leaf regularization 6; up to 1,500 iterations with early stopping after 80 rounds without improvement. Saved best iteration index: 13. |
| Random Forest | Same inputs and target setup as CatBoost | Same 202/50 chronological split. A 36-combination grid uses four expanding-window validation folds within the training portion, with 200 trees per candidate. Final model fits all 202 observations with 500 trees; selected depth 3, minimum 20 samples per leaf and feature fraction 0.33. Uses the absolute-error criterion. |

CatBoost and Random Forest drop the first of 253 MGO quotes because it has no previous quote. Daily market series are forward-filled onto a calendar, and inputs are selected at least one calendar day before each target quote. Observed MGO labels are not interpolated. News/GDELT and monthly bunker sales are excluded from these experiments.

The one-day market lag reduces timing risk, but source publication times and historical revisions remain unverified. It does not by itself establish that every input was available at the intended decision time.

## Saved MGO results

All errors below are in **USD/metric tonne**. Lower MAE and RMSE are better. MAE measures average absolute error; RMSE puts greater weight on large errors.

| Model | Evaluation sample | Model MAE | Model RMSE | Persistence MAE | Persistence RMSE |
|---|---|---:|---:|---:|---:|
| Linear regression pipeline | 82 eligible end-to-end MGO test observations in the post-1 April 2025 partition | 25.46 | 42.54 | 25.43 | 42.73 |
| Ridge regression | 201 walk-forward observations, 19 January 2022–5 October 2026 | 31.56 | 51.49 | 32.90 | 65.34 |
| CatBoost | 50 test observations, 18 August–6 October 2026 | 15.23 | 25.91 | 14.00 | 26.45 |
| Random Forest | Same 50 test observations as CatBoost | 16.68 | 25.72 | 14.00 | 26.45 |

Persistence predicts the previous observed MGO price with no adjustment. Each row's persistence results belong to that model's own evaluation sample.

The gasoil-only linear regression test scores are **MAE 1.9428 and RMSE 4.3364 USD/barrel** over 376 observations. These are a different commodity and unit and must not be compared with the MGO scores above.

Ridge also reports a separate gasoil-transfer baseline with **MAE 23.34 and RMSE 46.03 USD/tonne**, better than Ridge on that evaluation. This baseline transfers observed gasoil movement through the day before the target MGO quote; it is not a trained forecast of future gasoil.

## What the results support

- **CatBoost has lower average error than Random Forest** on their shared test sample: MAE 15.23 versus 16.68.
- **Random Forest has slightly lower RMSE than CatBoost**: 25.72 versus 25.91. The difference is too small to establish a robust advantage from 50 observations alone.
- **Persistence has the lowest MAE in the CatBoost/Random Forest comparison**, at 14.00. Both trained models have slightly better RMSE than persistence.
- **Linear regression's MGO pipeline essentially matches persistence**: slightly worse MAE and slightly better RMSE. Its gasoil forecast is slightly worse than gasoil persistence on both metrics.
- **Ridge improves over its own persistence baseline**, with reported MAE reduction of 4.07% and RMSE reduction of 21.2%, but loses to its own gasoil-transfer baseline.

Directional accuracy on nonzero MGO moves is 56% for CatBoost and 52% for Random Forest. These figures alone do not establish useful purchasing decisions.

Random Forest also reports an interval based on the 10th–90th percentiles of individual tree predictions. Its nominal 80% interval covers 72% of test observations, so tree disagreement understates uncertainty in that sample. Ridge's nominal 90% interval covers 85.57% of its evaluation observations. These interval results also come from different samples.

## Comparison limits and next evaluation

The linear regression forecasts one gasoil trading step ahead from an observed origin. The direct MGO models use market features through the day before each observed MGO target date and a potentially older MGO quote as their anchor. Irregular quote gaps mean these are not automatically the same forecast horizon.

The Random Forest README records a change from single-tail validation to multiple time-series folds after initial test results were inspected. Final parameters were selected within training data, but the test sample influenced development and should not be treated as a completely untouched final evaluation.

To determine an overall winner, agree on the decision time and forecast horizon, then evaluate all four on the same MGO target dates with the same data-availability rules and persistence benchmark. Keep model selection within historical training/validation data and reserve fresh observations for final evaluation. Compare MAE, RMSE, direction and interval coverage; do not use price-level R² alone as evidence of forecasting value.

## Sources

- [Linear regression specification](linear%20regression/README.md), [saved results](linear%20regression/outputs/results.json) and [training script](linear%20regression/gasoil_regression.py).
- [CatBoost specification](models/catboost-mgo/README.md), [saved results](models/catboost-mgo/output/metrics.json) and [training script](models/catboost-mgo/train_catboost_mgo.py).
- [Random Forest specification](models/random-forest-mgo/README.md), [saved results](models/random-forest-mgo/output/metrics.json) and [training script](models/random-forest-mgo/train_random_forest_mgo.py).
- Ridge artifacts are on the `ridge-regression` branch: [specification](https://github.com/raetan2023/cs203-g2t5/blob/ridge-regression/ridge-regression/README.md), [saved results](https://github.com/raetan2023/cs203-g2t5/blob/ridge-regression/ridge-regression/reports/evaluation_metrics.json), [model code](https://github.com/raetan2023/cs203-g2t5/blob/ridge-regression/ridge-regression/src/ridge_model.py) and [feature engineering](https://github.com/raetan2023/cs203-g2t5/blob/ridge-regression/ridge-regression/src/feature_engineering.py).
