# Singapore gasoil linear regression and experimental MGO mapping

This is an initial experiment, not a validated purchasing forecast.

## Specification

OLS predicts the next observed gasoil trading-date return from four historical returns: gasoil, Brent, Dubai and broad USD index. Returns are decimal fractions. Predictors stop at the previous gasoil trading date; backward as-of joins have a seven-calendar-day maximum age. Missing feature rows are excluded. Source dates and return interval starts are retained.

Chronological 70/15/15 boundaries are determined on complete rows. Boundary-crossing labels are purged. Coefficients are fitted only on training data, with no validation/test refitting or model selection. OLS uses NumPy least squares, algebraically equivalent to an intercept-bearing linear regression. Training standardization is folded back into the published coefficients.

Training outcomes end 2023-10-02; validation outcomes end 2025-04-01.

## Gasoil price evaluation (USD/barrel)

| Split | Rows | Regression MAE | Persistence MAE | Regression RMSE | Persistence RMSE |
|---|---:|---:|---:|---:|---:|
| train | 1754 | 0.8674 | 0.8655 | 1.7336 | 1.7314 |
| validation | 375 | 0.7722 | 0.7610 | 1.2492 | 1.2399 |
| test | 376 | 1.9428 | 1.9345 | 4.3364 | 4.3143 |

Persistence predicts the origin price, equivalent to zero return. Price-level R² can look high for persistent prices; baseline error comparison is the main check.

## End-to-end MGO evaluation (USD/metric tonne)

Only actual MGO quotes at both the gasoil forecast origin and target qualify. One trading step can span weekends/holidays. No target interpolation or quote carry-forward is used.

| Split | Rows | Percentage-transfer MAE | Persistence MAE |
|---|---:|---:|---:|
| train | 7 | 15.3762 | 15.5000 |
| validation | 1 | 5.6788 | 6.0000 |
| test | 82 | 25.4610 | 25.4329 |

The gasoil regression **does not beat persistence on test MAE** in this run.

## Mapping diagnostic

Separately, adjacent MGO quote intervals with exact gasoil endpoints and at most 30 calendar days are checked using REALIZED gasoil returns. This is a relationship diagnostic, not a gasoil forecasting result. The optional second OLS estimates MGO_return = alpha + beta * gasoil_return from training-period pairs only. Both mapping variants are reported without selecting a winner on the test set. Mixed-duration intervals do not validate a daily mapping, so the fitted mapping is NOT applied to the one-step forecast chain.

## Limits and next steps

- Forecast horizon is an initial modelling choice, not a confirmed team requirement.
- Source publication times, revision vintages and futures roll treatment remain unresolved. The extra lag reduces timing risk but does not establish a strict point-in-time backtest.
- MGO quotes are sparse and may repeat; exact date matches do not prove contemporaneous publication. Inspect quote provenance before treating the small MGO test subset as representative.
- News and monthly sales are excluded from this first specification. The supplied news has no MGO date overlap; monthly sales need release-date rules.
- MGO output assumes a reliable aligned price anchor. Mapping uncertainty and calibrated prediction intervals have not been established.
- Review expanding-window performance and a team-agreed horizon before promoting this experiment. If changes are chosen after viewing test results, reserve new data for the next final evaluation.

Full coefficients, counts, mapping metrics and return-level R² are in results.json; CSVs preserve features, dates, exclusions and individual predictions.
