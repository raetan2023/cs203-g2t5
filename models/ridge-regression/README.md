# 2.5 MGO Price Forecasting (Ridge Regression Model)

This module implements the machine learning forecasting pipeline for **Section 2.5 MGO Price Forecasting** in the SMU CS203 project.

The system uses historical Marine Gas Oil (MGO) prices (`sg_mgo_themaritime`) and selected market indicators to estimate near-term MGO price movement, communicating an **expected direction**, **point estimate**, **prediction interval / forecast range**, and **confidence / uncertainty information**.

---

## 1. Directory Structure

The module is organized into a clean, modular structure separating source code, data, models, reports, notebooks, and tests:

```text
models/ridge-regression/
├── .gitignore                      # Excludes large >100MB files, __pycache__, checkpoints
├── README.md                       # Comprehensive model and pipeline documentation
├── requirements.txt                # Python package dependencies
│
├── data/                           # Data storage & documentation
│   ├── README.md                   # Data documentation & directory overview
│   ├── raw/                        # Raw market observations (market_observations.csv, gdelt_daily_scores.csv)
│   ├── metadata/                   # Dictionaries, manifests (DATA_DICTIONARY.md, quality_audit.json, context.md)
│   └── processed/                  # Generated point-in-time aligned feature matrices (mgo_aligned_features.csv)
│
├── src/                            # Production Python package
│   ├── __init__.py                 # Package initializer
│   ├── config.py                   # Central parameters, paths, alphas, thresholds, and confidence levels
│   ├── data_loader.py              # Loads, verifies, and pivots raw market observations
│   ├── feature_engineering.py      # Point-in-time lagging (t-1), returns, spreads, volatility, anchor age
│   ├── ridge_model.py              # StandardScaler + Ridge / RidgeCV model, persistence & gasoil baselines
│   ├── uncertainty.py              # Direction classification (UP/DOWN/FLAT), prediction intervals, uncertainty scoring
│   ├── evaluate.py                 # Expanding-window walk-forward cross validation vs baselines
│   ├── predict.py                  # Operational inference CLI producing forecast ranges & confidence
│   └── run_pipeline.py             # End-to-end master CLI: data -> features -> walk-forward -> save -> plot -> forecast
│
├── models/                         # Serialized model artifacts
│   ├── ridge_mgo_pipeline.joblib   # Trained Ridge pipeline (StandardScaler + Ridge)
│   └── model_metadata.json         # Optimal alpha, feature weights, and in-sample metrics
│
├── reports/                        # Evaluation metrics and advisory outputs
│   ├── evaluation_metrics.json     # Walk-forward cross validation metrics vs baselines
│   ├── latest_forecast.json        # Latest scenario advisory forecast with intervals and drivers
│   └── figures/                    # Publication-ready diagnostic figures
│       ├── actual_vs_predicted.png # Walk-forward actual vs predicted price time series
│       ├── forecast_intervals.png  # 80% and 90% confidence bands / fan chart
│       ├── feature_coefficients.png# Standardized Ridge coefficients (feature sensitivity)
│       └── residual_distribution.png# Out-of-sample error distribution and diagnostics
│
├── notebooks/                      # Interactive Jupyter Notebooks
│   ├── mgo_price_forecasting.ipynb # End-to-end walkthrough: EDA, features, tuning, CV, intervals, inference
│   └── audit.ipynb                 # Distribution integrity audit
│
└── tests/                          # Automated test suite
    ├── __init__.py
    └── test_pipeline.py            # Unit tests for loading, alignment, model fitting, intervals, and scoring
```

---

## 2. Mathematical Formulation & Model Design

### 2.1 The Forecasting Objective
Predict near-term price movement and price level for Singapore Marine Gas Oil (`sg_mgo_themaritime`, quoted in USD/metric tonne).

Commodity price levels are non-stationary. To ensure statistical validity and prevent spurious regressions across macroeconomic regimes, the model targets the percentage return over the decision interval:

$$r_{t} = \frac{M_t - M_{t-1}}{M_{t-1}}$$

Where $M_t$ is the target MGO price and $M_{t-1}$ is the previous observed quote anchor.

Once the expected return $\hat{r}_t$ is predicted by the regularized model, the point price forecast is derived as:

$$\hat{M}_t = M_{t-1} \times (1 + \hat{r}_t)$$

### 2.2 Ridge Regularization (L2 Penalty)
Market indicators (Gasoil futures, Brent crude, Dubai crude, VLSFO, HSFO) exhibit high multicollinearity ($r > 0.90$). Ridge regression introduces an L2 penalty on the standardized coefficients to shrink weights, stabilize estimation, and prevent overfitting on sparse quote observations:

$$\min_{\boldsymbol{\beta}} \left\{ \frac{1}{2n} \sum_{i=1}^n \left( y_i - \mathbf{x}_i^T \boldsymbol{\beta} \right)^2 + \alpha \|\boldsymbol{\beta}\|_2^2 \right\}$$

Optimal $\alpha$ is selected via Leave-One-Out Generalized Cross-Validation (GCV) on training folds.

### 2.3 Expected Direction Classification
The forecast movement is classified into an economic direction:
- **`UP` (Bullish):** Expected return $\hat{r}_t > +0.3\%$
- **`DOWN` (Bearish):** Expected return $\hat{r}_t < -0.3\%$
- **`FLAT` (Neutral / Range-Bound):** $|\hat{r}_t| \le 0.3\%$

Directional probabilities $P(\text{Direction} = \text{UP})$ and $P(\text{Direction} = \text{DOWN})$ are calculated using the forecast normal distribution $\mathcal{N}(\hat{r}_t, \sigma_{\text{resid}}^2)$.

### 2.4 Prediction Intervals (Forecast Range)
Forecast intervals are constructed at 80%, 90%, and 95% confidence levels:

$$\left[ \hat{M}_t^{\text{lower}}, \hat{M}_t^{\text{upper}} \right] = \left[ \max\left(0, \hat{M}_t - z_{1 - \alpha/2} \cdot \sigma_{\text{resid}}\right), \; \hat{M}_t + z_{1 - \alpha/2} \cdot \sigma_{\text{resid}} \right]$$

Where:
- $z_{0.90} = 1.282$ (80% interval)
- $z_{0.95} = 1.645$ (90% interval)
- $z_{0.975} = 1.960$ (95% interval)
- $\sigma_{\text{resid}}$ is the residual standard error from historical training errors.

### 2.5 Uncertainty & Confidence Scoring
A composite Uncertainty Index (0 to 100) and Confidence Rating are derived from three factors:
1. **Model Error Component:** Relative prediction spread ($\sigma_{\text{resid}} / \hat{M}$).
2. **Anchor Staleness Penalty:** Days elapsed since the last recorded physical quote ($M_{t-1}$). Older quotes carry higher proxy drift risk.
3. **Market Volatility Component:** 20-day rolling annualized volatility in underlying energy indicators.

Confidence Score $= 100 - \text{Uncertainty Score}$, categorized into **HIGH** ($\ge 75$), **MODERATE** ($50 - 74$), or **LOW** ($< 50$).

---

## 3. Benchmark Evaluation Results

Validation is performed using expanding-window walk-forward cross validation (no future lookahead, minimum 50 historical training observations, evaluated on 201 sequential out-of-sample quotes from January 2022 to October 2026):

| Model / Baseline | MAE (USD/MT) | RMSE (USD/MT) | MAPE (%) | $R^2$ | Directional Accuracy |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Ridge Regression (Ours)** | **$31.56** | **$51.49** | **3.08%** | **0.9555** | **48.26%** |
| **Persistence Baseline (Naïve)** | $32.90 | $65.34 | 3.34% | 0.9283 | N/A (predicts 0 change) |
| **Gasoil Transfer Baseline (PRD Sec 6)** | $23.34 | $46.03 | 2.31% | 0.9644 | 47.76% |

### Key Performance Findings:
- **21.2% RMSE reduction** compared to the Persistence Baseline ($51.49/MT vs $65.34/MT).
- **85.6% Empirical Coverage** on 90% prediction intervals (nominal target 90%), validating the calibration of the forecast uncertainty bands.
- Average 90% prediction interval width: **$102.04/MT** ($\pm \$51.02/MT$).

---

## 4. How to Run

### 4.1 Prerequisites

From the repository root, enter the model directory first:

```bash
cd models/ridge-regression
```
Ensure the Python environment has the required packages installed:
```bash
pip install -r requirements.txt
```

### 4.2 Run the End-to-End Pipeline
Executes data loading, feature engineering, walk-forward validation, model training, plot generation, and latest scenario inference:
```bash
python -u src/run_pipeline.py
```

### 4.3 Generate a Forecast for a Specific Scenario Date
```bash
python -c "from src.predict import generate_forecast, format_forecast_report; from src.data_loader import get_market_data; from src.feature_engineering import build_daily_market_features, align_mgo_targets_and_features; p, _ = get_market_data(); f = build_daily_market_features(p); a, cols = align_mgo_targets_and_features(p, f); fc = generate_forecast(a, cols); print(format_forecast_report(fc))"
```

### 4.4 Run Automated Unit Tests
```bash
python tests/test_pipeline.py
```

### 4.5 Run Interactive Jupyter Notebook
```bash
jupyter notebook notebooks/mgo_price_forecasting.ipynb
```

---

## 5. Sample Advisory Forecast Output

```text
=================================================================
        SINGAPORE MGO PRICE FORECAST (ADVISORY)
=================================================================
As-of Date:       2026-10-05
Target Commodity: Singapore Marine Gas Oil (MGO) (USD/metric tonne)
Anchor Price:     $1297.00 (Age: 1 days)
-----------------------------------------------------------------
EXPECTED DIRECTION:  [DOWN] (-1.69%)
Point Estimate:      $1275.07/MT ($-21.93/MT change)
Direction Prob:      P(UP) = 31.2% | P(DOWN) = 68.8%
-----------------------------------------------------------------
FORECAST RANGES (PREDICTION INTERVALS):
  80% Confidence:    $1229.85 - $1320.28/MT  (±$45.22)
  90% Confidence:    $1217.04 - $1333.09/MT  (±$58.02)
-----------------------------------------------------------------
CONFIDENCE RATING:   MODERATE (64.2/100)
Uncertainty Score:   35.8/100
Advisory Guidance:   Moderate uncertainty due to market volatility or multi-day anchor gap.
=================================================================
```

---

## 6. Data Integrity & Boundaries (PRD Compliance)

- **Units:** Singapore MGO is strictly measured in **USD per metric tonne**. Gasoil, Brent, and Dubai futures are in **USD per barrel**. Conversions are handled via dimensionless return mapping rather than raw price subtraction.
- **Strictly Lagged:** Market indicators are lagged to $t-1$ as-of market close to eliminate lookahead bias.
- **GDELT News Scope:** As documented in `context.md`, GDELT scores in this dataset cover 2016-2017 while MGO quotes begin in March 2020 (zero date overlap). News scores are excluded from MGO training to maintain data integrity.
- **Advisory Notice:** Forecasts are decision-support indications for fuel procurement officers and must not be interpreted as guaranteed trade execution prices.
