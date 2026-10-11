"""
CatBoost regression for Singapore MGO bunker price (sg_mgo_themaritime).

CS203 MGO project -- model-comparison track (this file = the CatBoost model).

What it does, and the guardrails it respects (from the data context.md):
  * Target  = observed MGO quote, USD/metric tonne (only 253 irregular obs).
  * Features = market signals known *before* each MGO date (no look-ahead):
      - levels of gasoil, Brent, Dubai crude, broad USD index (daily series)
      - short/medium % changes of those series
      - last observed HSFO / VLSFO bunker quotes
      - the last observed MGO value + days since it (so the model can improve
        on simple persistence rather than just re-learn the price level)
  * Baseline = persistence (predict the last observed MGO). With near-daily,
    sticky 2026 data this is a hard baseline on purpose -- beating it is the
    real test, not a high R^2 on price levels.
  * Split = chronological (old -> train, recent -> test). No random shuffling.
  * Metrics reported in USD/MT so they're interpretable.

News/GDELT data is deliberately unused: context.md states it has zero date
overlap with observed MGO, so it cannot train or evaluate an MGO model.

Usage:
    python train_catboost_mgo.py \
        --market /path/to/market_observations.csv \
        --outdir /path/to/output
"""
import argparse, json, os
import numpy as np
import pandas as pd
from catboost import CatBoostRegressor, Pool
from sklearn.metrics import mean_absolute_error, mean_squared_error

TARGET = "sg_mgo_themaritime"
DAILY_FEATURES = ["sg_gasoil_investing", "brent_fred", "dubai_crude_investing", "usd_index_fred"]
BUNKER_FEATURES = ["sg_hsfo_themaritime", "sg_vlsfo_themaritime"]
LAG_DAYS = 1          # features must be known at least 1 day before the MGO quote
CHANGE_WINDOWS = [5, 20]   # calendar-day % change windows
TEST_FRACTION = 0.20       # most recent 20% of MGO observations = test set


def load_series(market_csv):
    mo = pd.read_csv(market_csv, parse_dates=["date"])
    out = {}
    for s in DAILY_FEATURES + BUNKER_FEATURES + [TARGET]:
        d = mo.loc[mo["series"] == s, ["date", "value"]].dropna(subset=["value"])
        out[s] = d.sort_values("date").set_index("date")["value"]
    return out


def daily_frame(series):
    """Put the 4 liquid daily series on a continuous calendar and forward-fill,
    so an 'as-of' lookup returns the last value actually published by then."""
    idx = pd.date_range(
        min(series[s].index.min() for s in DAILY_FEATURES),
        max(series[s].index.max() for s in DAILY_FEATURES),
        freq="D",
    )
    df = pd.DataFrame(index=idx)
    for s in DAILY_FEATURES:
        df[s] = series[s].reindex(idx).ffill()
    return df


def build_features(series):
    daily = daily_frame(series)
    # pre-compute % changes on the forward-filled daily calendar
    for s in DAILY_FEATURES:
        for w in CHANGE_WINDOWS:
            daily[f"{s}_chg{w}"] = daily[s].pct_change(w) * 100.0

    mgo = series[TARGET].sort_index()
    rows = []
    for i, (t, y) in enumerate(mgo.items()):
        asof = t - pd.Timedelta(days=LAG_DAYS)        # strictly before the quote
        row = {"date": t, "mgo": y}
        if asof in daily.index:
            snap = daily.loc[asof]
        else:
            snap = daily.loc[:asof].iloc[-1]          # last available row <= asof
        for c in daily.columns:
            row[c] = snap[c]
        # last observed bunker quotes strictly before t
        for s in BUNKER_FEATURES:
            prev = series[s].loc[:t - pd.Timedelta(days=1)]
            row[s] = prev.iloc[-1] if len(prev) else np.nan
        # persistence inputs: last MGO strictly before t
        if i == 0:
            row["lag_mgo"] = np.nan
            row["days_since_mgo"] = np.nan
        else:
            prev_t, prev_y = mgo.index[i - 1], mgo.iloc[i - 1]
            row["lag_mgo"] = prev_y
            row["days_since_mgo"] = (t - prev_t).days
        rows.append(row)

    feat = pd.DataFrame(rows).set_index("date")
    feat = feat.iloc[1:]           # drop first row (no persistence baseline)
    return feat


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", required=True)
    ap.add_argument("--outdir", required=True)
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    series = load_series(args.market)
    feat = build_features(series)

    # Target = CHANGE from the last observed MGO quote, not the level.
    # Rationale: tree models cannot extrapolate beyond the training price range,
    # and MGO is sticky/near-daily, so modelling the level loses to persistence by
    # construction. Predicting the delta makes the model "persistence + a learned
    # adjustment": it can only beat persistence if market signals truly help.
    feature_cols = [c for c in feat.columns if c not in ("mgo",)]
    X = feat[feature_cols]
    y = feat["mgo"] - feat["lag_mgo"]          # delta vs last quote

    # ---- chronological split (no shuffling) ----
    n = len(feat)
    n_test = max(1, int(round(n * TEST_FRACTION)))
    split = n - n_test
    X_tr, X_te = X.iloc[:split], X.iloc[split:]
    y_tr, y_te = y.iloc[:split], y.iloc[split:]
    # time-based validation tail inside train, for early stopping
    n_val = max(1, int(round(len(X_tr) * 0.15)))
    X_fit, X_val = X_tr.iloc[:-n_val], X_tr.iloc[-n_val:]
    y_fit, y_val = y_tr.iloc[:-n_val], y_tr.iloc[-n_val:]

    model = CatBoostRegressor(
        loss_function="MAE",       # robust, and matches how we judge it
        iterations=1500,
        learning_rate=0.03,
        depth=4,                   # shallow: only ~160 training rows, avoid overfit
        l2_leaf_reg=6.0,
        random_seed=42,
        verbose=False,
    )
    model.fit(Pool(X_fit, y_fit), eval_set=Pool(X_val, y_val),
              early_stopping_rounds=80, use_best_model=True)

    # reconstruct price-level predictions = last quote + predicted change
    persist = X_te["lag_mgo"].values              # baseline = last observed MGO
    pred_delta = model.predict(X_te)
    pred = persist + pred_delta                   # CatBoost level forecast
    actual_level = y_te.values + persist          # true MGO level on test dates

    def report(name, yhat):
        mae = mean_absolute_error(actual_level, yhat)
        rmse = float(np.sqrt(mean_squared_error(actual_level, yhat)))
        return {"model": name, "MAE_usd_per_mt": round(mae, 2), "RMSE_usd_per_mt": round(rmse, 2)}

    r_cat = report("CatBoost (predicts change)", pred)
    r_base = report("Persistence (last MGO)", persist)

    # directional accuracy: did we get the direction of the move right?
    actual_dir = np.sign(y_te.values)             # sign of true change
    pred_dir = np.sign(pred_delta)
    mask = actual_dir != 0
    dir_acc = float((pred_dir[mask] == actual_dir[mask]).mean()) if mask.any() else float("nan")

    metrics = {
        "n_total": int(n), "n_train": int(split), "n_test": int(n_test),
        "test_period": [str(y_te.index.min().date()), str(y_te.index.max().date())],
        "target_units": "USD/metric tonne",
        "results": [r_cat, r_base],
        "catboost_vs_baseline_MAE_improvement_pct": round(
            100 * (r_base["MAE_usd_per_mt"] - r_cat["MAE_usd_per_mt"]) / r_base["MAE_usd_per_mt"], 1),
        "directional_accuracy_vs_last_quote": round(dir_acc, 3),
        "best_iteration": int(model.get_best_iteration()),
    }

    # feature importances
    imp = pd.DataFrame({"feature": feature_cols,
                        "importance": model.get_feature_importance()}
                       ).sort_values("importance", ascending=False)

    # ---- save outputs ----
    feat.to_csv(os.path.join(args.outdir, "feature_table.csv"))
    imp.to_csv(os.path.join(args.outdir, "feature_importance.csv"), index=False)
    model.save_model(os.path.join(args.outdir, "catboost_mgo.cbm"))
    with open(os.path.join(args.outdir, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    # ---- plot: actual vs CatBoost vs persistence on the test period ----
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(10, 4.5))
        ax.plot(y_te.index, actual_level, "o-", ms=3, lw=1, label="Actual MGO", color="#0B2A4A")
        ax.plot(y_te.index, pred, "o-", ms=3, lw=1, label="CatBoost", color="#0FB5AE")
        ax.plot(y_te.index, persist, "--", lw=1, label="Persistence", color="#F87171")
        ax.set_ylabel("MGO (USD/MT)"); ax.set_title("MGO: actual vs CatBoost vs persistence (test period)")
        ax.legend(); fig.autofmt_xdate(); fig.tight_layout()
        fig.savefig(os.path.join(args.outdir, "mgo_predictions.png"), dpi=130)
    except Exception as e:
        print("plot skipped:", e)

    print(json.dumps(metrics, indent=2))
    print("\nTop features:\n", imp.head(10).to_string(index=False))


if __name__ == "__main__":
    main()
