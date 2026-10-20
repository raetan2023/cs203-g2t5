"""
Random Forest regression for Singapore MGO bunker price (sg_mgo_themaritime).

CS203 MGO project -- model-comparison track (this file = the Random Forest model).

Deliberately mirrors the CatBoost model (models/catboost-mgo) so the two are directly
comparable: same leak-safe features, same change-based target, same chronological
80/20 split, same persistence baseline, same metrics.

  * Target  = observed MGO quote, USD/metric tonne (only 253 irregular obs).
  * Features = market signals known *before* each MGO date (no look-ahead):
      - levels of gasoil, Brent, Dubai crude, broad USD index (daily series)
      - short/medium % changes of those series
      - last observed HSFO / VLSFO bunker quotes
      - the last observed MGO value + days since it
  * The forest predicts the CHANGE from the last MGO quote, not the level
    (trees cannot extrapolate beyond the training price range).
  * Baseline = persistence (predict the last observed MGO).
  * Split = chronological (old -> train, recent -> test). No random shuffling.
  * Hyperparameters are chosen by expanding-window time-series CV inside train only;
    the test set is never used for selection.

What Random Forest adds over CatBoost: each tree gives its own prediction, so the
spread across trees gives a prediction interval almost for free. We report an 80%
interval per test date and check its empirical coverage -- this is the uncertainty
metadata the ML-integration work (next sprint) will need.

News/GDELT data is deliberately unused: context.md states it has zero date
overlap with observed MGO, so it cannot train or evaluate an MGO model.

Usage:
    python train_random_forest_mgo.py \
        --market /path/to/market_observations.csv \
        --outdir /path/to/output
"""
import argparse, itertools, json, os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import TimeSeriesSplit

TARGET = "sg_mgo_themaritime"
DAILY_FEATURES = ["sg_gasoil_investing", "brent_fred", "dubai_crude_investing", "usd_index_fred"]
BUNKER_FEATURES = ["sg_hsfo_themaritime", "sg_vlsfo_themaritime"]
LAG_DAYS = 1          # features must be known at least 1 day before the MGO quote
CHANGE_WINDOWS = [5, 20]   # calendar-day % change windows
TEST_FRACTION = 0.20       # most recent 20% of MGO observations = test set
CV_FOLDS = 4               # expanding-window folds inside train for hyperparameter selection
INTERVAL = (10, 90)        # percentiles across trees -> 80% prediction interval
SEED = 42

# Small grid: only ~200 training rows, so keep trees shallow-ish and leaves large.
PARAM_GRID = {
    "max_depth": [3, 5, None],
    "min_samples_leaf": [3, 5, 10, 20],
    "max_features": [0.33, 0.6, 1.0],
}


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
    for s in DAILY_FEATURES:
        for w in CHANGE_WINDOWS:
            daily[f"{s}_chg{w}"] = daily[s].pct_change(w, fill_method=None) * 100.0

    mgo = series[TARGET].sort_index()
    rows = []
    for i, (t, y) in enumerate(mgo.items()):
        asof = t - pd.Timedelta(days=LAG_DAYS)        # strictly before the quote
        row = {"date": t, "mgo": y}
        snap = daily.loc[asof] if asof in daily.index else daily.loc[:asof].iloc[-1]
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
            row["lag_mgo"] = mgo.iloc[i - 1]
            row["days_since_mgo"] = (t - mgo.index[i - 1]).days
        rows.append(row)

    feat = pd.DataFrame(rows).set_index("date")
    return feat.iloc[1:]           # drop first row (no persistence baseline)


def make_forest(n_estimators=500, **params):
    return RandomForestRegressor(
        n_estimators=n_estimators,
        criterion="absolute_error",   # robust, and matches how we judge it
        random_state=SEED,
        n_jobs=-1,
        **params,
    )


def select_params(X_tr, y_tr):
    """Pick hyperparameters by expanding-window CV over train (chronological folds).

    A single short validation tail is too noisy with ~200 rows: it can reward deep
    trees that happen to fit one quiet stretch. Averaging over several folds that
    each span a different period gives a more stable choice."""
    folds = list(TimeSeriesSplit(n_splits=CV_FOLDS).split(X_tr))
    best, best_mae = None, np.inf
    keys = list(PARAM_GRID)
    for combo in itertools.product(*(PARAM_GRID[k] for k in keys)):
        params = dict(zip(keys, combo))
        maes = []
        for fit_idx, val_idx in folds:
            m = make_forest(n_estimators=200, **params).fit(X_tr.iloc[fit_idx], y_tr.iloc[fit_idx])
            maes.append(mean_absolute_error(y_tr.iloc[val_idx], m.predict(X_tr.iloc[val_idx])))
        mae = float(np.mean(maes))
        if mae < best_mae:
            best, best_mae = params, mae
    return best, best_mae


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", required=True)
    ap.add_argument("--outdir", required=True)
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    series = load_series(args.market)
    feat = build_features(series)

    feature_cols = [c for c in feat.columns if c != "mgo"]
    X = feat[feature_cols]
    y = feat["mgo"] - feat["lag_mgo"]          # delta vs last quote

    # ---- chronological split (no shuffling) ----
    n = len(feat)
    n_test = max(1, int(round(n * TEST_FRACTION)))
    split = n - n_test
    X_tr, X_te = X.iloc[:split], X.iloc[split:]
    y_tr, y_te = y.iloc[:split], y.iloc[split:]

    best_params, val_mae = select_params(X_tr, y_tr)
    model = make_forest(**best_params).fit(X_tr, y_tr)

    # reconstruct price-level predictions = last quote + predicted change
    persist = X_te["lag_mgo"].values
    pred_delta = model.predict(X_te)
    pred = persist + pred_delta
    actual_level = y_te.values + persist

    # per-tree predictions -> prediction interval on the level
    tree_deltas = np.stack([t.predict(X_te.values) for t in model.estimators_])
    lo = persist + np.percentile(tree_deltas, INTERVAL[0], axis=0)
    hi = persist + np.percentile(tree_deltas, INTERVAL[1], axis=0)
    coverage = float(((actual_level >= lo) & (actual_level <= hi)).mean())

    def report(name, yhat):
        mae = mean_absolute_error(actual_level, yhat)
        rmse = float(np.sqrt(mean_squared_error(actual_level, yhat)))
        return {"model": name, "MAE_usd_per_mt": round(mae, 2), "RMSE_usd_per_mt": round(rmse, 2)}

    r_rf = report("Random Forest (predicts change)", pred)
    r_base = report("Persistence (last MGO)", persist)

    actual_dir = np.sign(y_te.values)
    pred_dir = np.sign(pred_delta)
    mask = actual_dir != 0
    dir_acc = float((pred_dir[mask] == actual_dir[mask]).mean()) if mask.any() else float("nan")

    metrics = {
        "n_total": int(n), "n_train": int(split), "n_test": int(n_test),
        "test_period": [str(y_te.index.min().date()), str(y_te.index.max().date())],
        "target_units": "USD/metric tonne",
        "results": [r_rf, r_base],
        "rf_vs_baseline_MAE_improvement_pct": round(
            100 * (r_base["MAE_usd_per_mt"] - r_rf["MAE_usd_per_mt"]) / r_base["MAE_usd_per_mt"], 1),
        "directional_accuracy_vs_last_quote": round(dir_acc, 3),
        "prediction_interval": {
            "method": "percentiles of per-tree predictions",
            "nominal_coverage": (INTERVAL[1] - INTERVAL[0]) / 100,
            "empirical_coverage_on_test": round(coverage, 3),
            "mean_width_usd_per_mt": round(float((hi - lo).mean()), 2),
        },
        "selected_params": {k: v for k, v in best_params.items()},
        "cv_MAE_change_usd_per_mt": round(val_mae, 2),
    }

    imp = pd.DataFrame({"feature": feature_cols,
                        "importance": model.feature_importances_}
                       ).sort_values("importance", ascending=False)

    preds = pd.DataFrame({
        "actual_mgo": actual_level,
        "predicted_mgo": pred,
        "lower_80": lo,
        "upper_80": hi,
        "persistence": persist,
    }, index=y_te.index).round(2)

    # ---- save outputs ----
    feat.to_csv(os.path.join(args.outdir, "feature_table.csv"))
    imp.to_csv(os.path.join(args.outdir, "feature_importance.csv"), index=False)
    preds.to_csv(os.path.join(args.outdir, "test_predictions.csv"))
    joblib.dump({"model": model, "feature_cols": feature_cols},
                os.path.join(args.outdir, "random_forest_mgo.joblib"), compress=3)
    with open(os.path.join(args.outdir, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    # ---- plot: actual vs RF (with interval) vs persistence on the test period ----
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(10, 4.5))
        ax.fill_between(y_te.index, lo, hi, color="#0FB5AE", alpha=0.18, label="RF 80% interval")
        ax.plot(y_te.index, actual_level, "o-", ms=3, lw=1, label="Actual MGO", color="#0B2A4A")
        ax.plot(y_te.index, pred, "o-", ms=3, lw=1, label="Random Forest", color="#0FB5AE")
        ax.plot(y_te.index, persist, "--", lw=1, label="Persistence", color="#F87171")
        ax.set_ylabel("MGO (USD/MT)")
        ax.set_title("MGO: actual vs Random Forest vs persistence (test period)")
        ax.legend(); fig.autofmt_xdate(); fig.tight_layout()
        fig.savefig(os.path.join(args.outdir, "mgo_predictions.png"), dpi=130)
    except Exception as e:
        print("plot skipped:", e)

    print(json.dumps(metrics, indent=2))
    print("\nTop features:\n", imp.head(10).to_string(index=False))


if __name__ == "__main__":
    main()
