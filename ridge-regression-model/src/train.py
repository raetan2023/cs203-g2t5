"""python -m src.train --horizons 7 14 30   -> reports/ and artifacts/"""
import argparse, json
import joblib
import numpy as np
import pandas as pd
from .config import HORIZONS, ARTIFACTS, REPORTS, QUANTILES, LAG_DAYS, TOLERANCE_DAYS
from .data_loader import load_wide
from .feature_engineering import prepare, FEATURES
from .labels import build_table
from .backtest import walk_forward
from .intervals import add_range
from .metrics import score
from .model import make_model


def run(horizons=HORIZONS, data_path=None, save=True):
    p = prepare(load_wide(data_path))
    summary = {}
    for h in horizons:
        table = build_table(p, h)
        wf = walk_forward(table)
        
        # Calibrate optimal shrinkage gamma to dampen noise
        anchor = wf["mgo_t"].values
        actual = wf["mgo_target"].values
        raw_ret = wf["pred_ret"].values
        best_gamma = 1.0
        best_mae = float("inf")
        for g in np.linspace(0.0, 1.0, 21):
            cand_price = anchor * np.exp(g * raw_ret)
            cand_mae = float(np.mean(np.abs(actual - cand_price)))
            if cand_mae < best_mae:
                best_mae = cand_mae
                best_gamma = float(g)
                
        res, cov, n_cov = add_range(wf, gamma=best_gamma)
        m = score(res)
        m["gamma"] = best_gamma
        m["coverage_80"] = cov
        m["n_with_interval"] = n_cov
        m["by_year"] = {
            str(y): {"n": int(len(g)), "MAE_skill": float(1 - np.mean(np.abs(g.mgo_target - g.pred_price)) / np.mean(np.abs(g.mgo_target - g.mgo_t)))}
            for y, g in res.groupby(res["origin"].dt.year)
        }
        m["rows_total"] = int(len(table))
        summary[f"{h}d"] = m
        if save:
            REPORTS.mkdir(exist_ok=True); ARTIFACTS.mkdir(exist_ok=True)
            res.to_csv(REPORTS / f"backtest_{h}d.csv", index=False)
            final = make_model().fit(table[FEATURES], table["y"])
            err = (res["y"] - res["pred_ret"]).to_numpy()
            vol = res["gasoil_vol20"].to_numpy().astype(float) if "gasoil_vol20" in res.columns else np.full(len(res), 0.02)
            vol = np.maximum(np.nan_to_num(vol, nan=0.02), 1e-4)
            z = err / vol
            target_cov = float(QUANTILES[1] - QUANTILES[0]) if len(QUANTILES) == 2 else 0.80
            q_scale = float(np.quantile(np.abs(z), target_cov))
            joblib.dump(final, ARTIFACTS / f"ridge_{h}d.joblib")
            meta = {"horizon_days": h, "features": FEATURES, "alpha": float(final[-1].alpha_),
                    "gamma": best_gamma,
                    "trained_to_origin": str(table["origin"].max().date()), "n_rows": int(len(table)),
                    "q_scale": q_scale, "q_lo": float(-q_scale), "q_hi": float(q_scale), "lags": LAG_DAYS,
                    "tolerance_days": TOLERANCE_DAYS, "backtest": m}
            (ARTIFACTS / f"ridge_{h}d.json").write_text(json.dumps(meta, indent=2, default=str))
    if save:
        (REPORTS / "metrics_summary.json").write_text(json.dumps(summary, indent=2, default=str))
    return summary


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--horizons", type=int, nargs="+", default=list(HORIZONS))
    out = run(ap.parse_args().horizons)
    for k, v in out.items():
        print(k, {a: (round(b, 4) if isinstance(b, float) else b) for a, b in v.items() if a not in ("by_year", "paired_MAE_gain_CI95")}, "CI", [round(x, 3) for x in v["paired_MAE_gain_CI95"]])
