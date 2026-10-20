"""CatBoost gasoil forecast + experimental MGO mapping -- CS203 model-comparison track.

This mirrors the team's linear-regression evaluation pipeline exactly and swaps the
linear model for CatBoost, so the result tables are directly comparable:

  * Model predicts the next observed gasoil trading-day RETURN from four historical
    returns (gasoil, Brent, Dubai, broad USD), with predictors lagged to the previous
    gasoil trading date (backward as-of join, 7-day max age).
  * Chronological 70/15/15 split (train/validation/test); boundary-crossing labels purged.
  * Gasoil price = origin x (1 + predicted return). Baseline = origin price (zero return).
  * MGO (experimental): only where a real MGO quote exists at BOTH the gasoil forecast
    origin and target date, the predicted gasoil % move is applied to the MGO origin
    price. Baseline = MGO origin. No interpolation or quote carry-forward.

With this pipeline the unchanged-price baselines reproduce the team's exactly
(Gasoil 1.9345 / 4.3143, MGO 25.4329 / 42.7309), so the CatBoost column lines up
with the linear and ridge tables.

Usage:
    python train_catboost_mgo.py --market /path/to/market_observations.csv --outdir ./output
"""
import argparse, json, os
import numpy as np
import pandas as pd
from catboost import CatBoostRegressor, Pool

SERIES = {"gasoil": "sg_gasoil_investing", "brent": "brent_fred",
          "dubai": "dubai_crude_investing", "usd": "usd_index_fred",
          "mgo": "sg_mgo_themaritime"}
FEATURES = ["gasoil_return", "brent_return", "dubai_return", "usd_return"]


def read_market(market_csv):
    raw = pd.read_csv(market_csv, parse_dates=["date"])
    values = raw.pivot(index="date", columns="series", values="value").sort_index()
    return {k: values[n].dropna() for k, n in SERIES.items()}


def make_features(series, max_age_days=7):
    gasoil = series["gasoil"]
    frame = pd.DataFrame({"origin": gasoil.index, "gasoil_origin": gasoil.values})
    frame["target_date"] = frame.origin.shift(-1)
    frame["gasoil_actual"] = frame.gasoil_origin.shift(-1)
    frame["target_return"] = frame.gasoil_actual / frame.gasoil_origin - 1
    frame["feature_cutoff"] = frame.origin.shift(1)           # predictors stop one trading day back
    for key in ["gasoil", "brent", "dubai", "usd"]:
        s = series[key]
        obs = pd.DataFrame({f"{key}_source_date": s.index,
                            f"{key}_return": s.pct_change(fill_method=None).values})
        frame = pd.merge_asof(frame.loc[frame.feature_cutoff.notna()].sort_values("feature_cutoff"),
                              obs, left_on="feature_cutoff", right_on=f"{key}_source_date",
                              direction="backward")
        frame[f"{key}_age_days"] = (frame.origin - frame[f"{key}_source_date"]).dt.days
    required = FEATURES + ["target_return", "target_date"]
    missing = frame[required].isna().any(axis=1)
    stale = frame[[f"{k}_age_days" for k in SERIES if k != "mgo"]].gt(max_age_days).any(axis=1)
    frame["exclude"] = np.select([missing, stale], ["missing", "stale"], default="")
    return frame.loc[frame.exclude.eq("")].copy().reset_index(drop=True)


def split_time(frame):
    first, second = int(len(frame) * 0.70), int(len(frame) * 0.85)
    train_end = frame.iloc[first - 1].target_date
    val_end = frame.iloc[second - 1].target_date
    train = frame.loc[frame.target_date.le(train_end)].copy()
    val = frame.loc[frame.origin.gt(train_end) & frame.target_date.le(val_end)].copy()
    test = frame.loc[frame.origin.gt(val_end)].copy()
    assert train.target_date.max() < val.origin.min()
    assert val.target_date.max() < test.origin.min()
    return {"train": train, "validation": val, "test": test}, train_end, val_end


def scores(actual, estimate):
    actual, estimate = np.asarray(actual, float), np.asarray(estimate, float)
    if len(actual) == 0:
        return {"n": 0, "mae": None, "rmse": None}
    err = estimate - actual
    return {"n": int(len(actual)), "mae": float(np.abs(err).mean()),
            "rmse": float(np.sqrt((err ** 2).mean()))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", required=True)
    ap.add_argument("--outdir", default="./output")
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    series = read_market(args.market)
    frame = make_features(series)
    folds, train_end, val_end = split_time(frame)

    model = CatBoostRegressor(loss_function="RMSE", iterations=1500, learning_rate=0.03,
                              depth=4, l2_leaf_reg=6.0, random_seed=42, verbose=False)
    model.fit(Pool(folds["train"][FEATURES], folds["train"].target_return),
              eval_set=Pool(folds["validation"][FEATURES], folds["validation"].target_return),
              early_stopping_rounds=80, use_best_model=True)

    for name, f in folds.items():
        f = f.copy()
        f["pred_return"] = model.predict(f[FEATURES])
        f["gasoil_pred"] = f.gasoil_origin * (1 + f.pred_return)
        f["split"] = name
        folds[name] = f

    test = folds["test"]
    g_reg = scores(test.gasoil_actual, test.gasoil_pred)
    g_base = scores(test.gasoil_actual, test.gasoil_origin)

    # experimental end-to-end MGO: apply predicted gasoil return to MGO where both ends are real quotes
    preds = pd.concat(folds.values(), ignore_index=True)
    preds["mgo_origin"] = preds.origin.map(series["mgo"])
    preds["mgo_actual"] = preds.target_date.map(series["mgo"])
    ete = preds.dropna(subset=["mgo_origin", "mgo_actual"]).copy()
    ete["mgo_pred"] = ete.mgo_origin * (1 + ete.pred_return)
    et = ete.loc[ete.split.eq("test")]
    m_reg = scores(et.mgo_actual, et.mgo_pred)
    m_base = scores(et.mgo_actual, et.mgo_origin)

    table = [("Gasoil MAE (USD/barrel)", g_reg["mae"], g_base["mae"]),
             ("Gasoil RMSE (USD/barrel)", g_reg["rmse"], g_base["rmse"]),
             ("MGO MAE (USD/tonne)", m_reg["mae"], m_base["mae"]),
             ("MGO RMSE (USD/tonne)", m_reg["rmse"], m_base["rmse"])]
    print(f"{'Test metric':28s} {'CatBoost':>12s} {'Unchanged-price baseline':>26s}")
    for name, c, b in table:
        print(f"{name:28s} {c:>12.4f} {b:>26.4f}")
    print(f"\ntest fold: gasoil={g_reg['n']} forecasts, MGO={m_reg['n']} quote-paired forecasts")

    out = {"protocol": "gasoil return model, chronological 70/15/15, test fold; "
                       "MGO via predicted-gasoil-% applied to paired real MGO quotes",
           "train_end": str(train_end.date()), "validation_end": str(val_end.date()),
           "gasoil": {"catboost": g_reg, "unchanged_price": g_base},
           "mgo": {"catboost": m_reg, "unchanged_price": m_base}}
    with open(os.path.join(args.outdir, "metrics.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    pd.DataFrame(table, columns=["metric", "catboost", "unchanged_price_baseline"]
                 ).to_csv(os.path.join(args.outdir, "comparison_table.csv"), index=False)
    ete.to_csv(os.path.join(args.outdir, "mgo_predictions.csv"), index=False)
    preds.to_csv(os.path.join(args.outdir, "gasoil_predictions.csv"), index=False)


if __name__ == "__main__":
    main()
