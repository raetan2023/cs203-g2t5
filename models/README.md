# Forecasting models

All four model experiments live here with their own training code, dependencies, data or outputs, and documentation.

| Directory | Prediction approach |
|---|---|
| [linear-regression](linear-regression/README.md) | Forecast gasoil return, then transfer the percentage movement to MGO |
| [ridge-regression](ridge-regression/README.md) | Predict MGO return directly with regularized linear regression |
| [catboost-mgo](catboost-mgo/README.md) | Predict MGO dollar change using boosted trees |
| [random-forest-mgo](random-forest-mgo/README.md) | Predict MGO dollar change using an ensemble of trees |

See [the model comparison](../modelcomparison.md) for training setups, saved results and evaluation limits. Each directory's README documents its run commands. Shared market observations are available in `ridge-regression/data/raw/market_observations.csv`.
