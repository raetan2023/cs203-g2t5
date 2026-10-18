# Ridge MGO forecast

Forecasts the Singapore MGO bunker price (USD/tonne) 7, 14 and 30 days ahead from the latest quote, with nowcasting for stale quotes and volatility-scaled prediction intervals.

- **Target:** `log(MGO at ~t+h / MGO at t)`, origins = MGO quote dates, label = nearest later quote within +/-3 days (never interpolated).
- **Inputs:** gasoil, Brent, Dubai, USD index (lagged by publication delay), spreads, volatility, MGO history, gasoil/Brent move since the last quote.
- **Model:** `StandardScaler` + `RidgeCV` (alpha picked on time-ordered folds), one model per horizon.
- **Evaluation:** expanding-window walk-forward, training rows purged if their label is not known at the test origin; benchmark is persistence (no change).
- **Volatility-scaled ranges:** prediction intervals are standardized by 20-day gasoil volatility ($z = err / \sigma$) and scaled by origin market volatility ($\pm q_{80} \cdot \sigma_t$). This guarantees $low \le forecast \le high$, expands during turbulent markets and narrows in calm markets, achieving honest ~80%+ empirical coverage across all horizons (7d: 83.9%, 14d: 86.7%, 30d: 100.0%, up from 0.0%).
- **Nowcasting:** answers "what is MGO worth today?" when physical quotes are stale (`quote_age_days > 0`). Estimates today's price from the last observed quote and subsequent benchmark movement (gasoil direct transfer). In addition to a dedicated `/nowcast` endpoint, `predict()` uses the nowcast as a fresh anchor for multi-day projections.
- **GDELT is not used:** only 100 of 3,653 days are collected (`not_collected`: 3,537), so it cannot be a daily feature.

## Run
```
pip install -r requirements.txt
python -m src.train                  # backtest + artifacts/ + reports/
python -m src.ablate 7               # drop one feature group at a time
python -m pytest -q                  # tests run on synthetic data
uvicorn service.main:app --port 8000 # POST /predict {"horizon_days": 7}, POST /nowcast
```
Data goes in `data/` (or set `MGO_DATA_DIR`). The API returns an `evidence` field (`supported` / `weak` / `no_edge`) taken from the model's own backtest; the UI should show it.

## Known limits
- Lags for FRED series (Brent 3 days, USD 5 days) are assumptions: the source has no availability timestamps.
- MGO quotes are dense only in 2026 (126 of 253), so all walk-forward test rows fall in one volatile period.
- Serving reads the CSV; `load_wide_supabase` is a stub.

