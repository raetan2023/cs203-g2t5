"""python -m src.train [--horizons 7 14 30] [--no-nowcast]   -> reports/ and artifacts/

Honest-evaluation rules:
 * gamma (shrinkage) is chosen only on development rows (before DEV_END);
 * results are reported separately for dev and holdout rows;
 * the evidence flag compares the model with persistence, drift and SMA5, and is capped at 'weak' until it
   has been confirmed on quotes that arrived after the model was frozen (see src/evaluate_new.py).
"""
import argparse, json
import joblib
import numpy as np
import pandas as pd
from . import config
from .config import HORIZONS, ARTIFACTS, REPORTS, LAG_DAYS, TOLERANCE_DAYS, VOL_FLOOR, MIN_INTERVAL_ROWS
from .data_loader import load_wide
from .feature_engineering import prepare, FEATURES, NOW_FEATURES
from .labels import build_table
from .nowcast import build_nowcast_table, gap_breakdown, gated
from .backtest import walk_forward
from .shrinkage import choose_gamma, apply_gamma
from .intervals import add_range, mean_log_width, coverage_on, final_scales
from .metrics import score_splits
from .model import make_model
from .predict import evidence_label


def _range_stats(wf):
    cut = pd.Timestamp(config.DEV_END)
    res, cov, n_ok = add_range(wf, scaled=True)
    res_f, cov_f, _ = add_range(wf, scaled=False)
    hold = res["origin"] >= cut
    # serve whichever range method is closer to the 80% target on the backtest
    mode = "scaled" if abs(cov - 0.80) <= abs(cov_f - 0.80) else "flat"
    return res, {
        "range_mode": mode, "n_with_interval": n_ok, "interval_reliable": n_ok >= MIN_INTERVAL_ROWS,
        "coverage_80": cov, "coverage_80_flat": cov_f,
        "mean_log_width_scaled": mean_log_width(res), "mean_log_width_flat": mean_log_width(res_f),
        "holdout_coverage_80": coverage_on(res, hold), "holdout_coverage_80_flat": coverage_on(res_f, hold),
        "holdout_n_with_interval": int((res["low"].notna() & hold).sum()),
    }


def _save(name, res, table, features, gamma, served, full):
    REPORTS.mkdir(exist_ok=True); ARTIFACTS.mkdir(exist_ok=True)
    res.to_csv(REPORTS / f"backtest_{name}.csv", index=False)
    final = make_model().fit(table[features], table["y"])
    q_scale, q_flat = final_scales(res)
    joblib.dump(final, ARTIFACTS / f"ridge_{name}.joblib")
    meta = {"features": features, "alpha": float(final[-1].alpha_), "gamma": float(gamma),
            "trained_to_origin": str(table["origin"].max().date()), "n_rows": int(len(table)),
            "train_mean_ret": float(table["y"].mean()), "q_scale": q_scale, "q_flat": q_flat,
            "range_mode": full["range_mode"],
            "vol_floor": VOL_FLOOR, "lags": LAG_DAYS, "dev_end": config.DEV_END,
            "backtest": served, "full_metrics": full}
    return meta


def run(horizons=HORIZONS, data_path=None, save=True, nowcast=True):
    wide = load_wide(data_path)
    p = prepare(wide)
    summary = {}
    for h in horizons:
        table = build_table(p, h)
        wf = walk_forward(table)
        gamma = choose_gamma(wf)
        res, rng = _range_stats(apply_gamma(wf, gamma))
        splits = score_splits(res)
        served = {**splits.get("holdout", splits["all"]), "post_hoc": True,
                  "scope": f"holdout: origins >= {config.DEV_END}" if "holdout" in splits else "all rows"}
        summary[f"{h}d"] = {"gamma": gamma, "rows_total": int(len(table)), **rng, "splits": splits,
                            "evidence": evidence_label(served)}
        if save:
            meta = _save(f"{h}d", res, table, FEATURES, gamma, served, summary[f"{h}d"])
            meta.update(horizon_days=h, tolerance_days=TOLERANCE_DAYS)
            (ARTIFACTS / f"ridge_{h}d.json").write_text(json.dumps(meta, indent=2, default=str))
    if nowcast:
        table = build_nowcast_table(p)
        wf = walk_forward(table, NOW_FEATURES)
        res, rng = _range_stats(wf)
        ridge_g, transfer_g = gated(res, "pred_price"), gated(res, "gasoil_transfer_price")
        splits = {"ungated": score_splits(res), "ridge_gated": score_splits(ridge_g), "transfer_gated": score_splits(transfer_g)}
        served = {**splits["ridge_gated"]["all"], "post_hoc": True,
                  "scope": f"all rows; MIN_GAP_DAYS={config.MIN_GAP_DAYS} was chosen after seeing results by gap"}
        summary["nowcast"] = {"rows_total": int(len(table)), **rng, "by_gap": gap_breakdown(res),
                              "splits": splits, "evidence": evidence_label(served)}
        if save:
            meta = _save("nowcast", res, table, NOW_FEATURES, 1.0, served, summary["nowcast"])
            meta["min_gap_days"] = config.MIN_GAP_DAYS
            (ARTIFACTS / "ridge_nowcast.json").write_text(json.dumps(meta, indent=2, default=str))
    if save:
        (REPORTS / "metrics_summary.json").write_text(json.dumps(summary, indent=2, default=str))
    return summary


def _line(tag, s):
    b = s["baselines"]
    cell = lambda k: f"{b[k]['MAE_skill']:+.3f}" if k in b else "  n/a"
    ci = [round(x, 1) for x in s["paired_MAE_gain_CI95"]]
    return (f"  {tag:8s} n={s['n']:3d} MAE={s['model_MAE']:.1f} | skill vs persist {cell('persist')} drift {cell('drift')} "
            f"sma5 {cell('sma5')} transfer {cell('gasoil_transfer')} | CI(persist gain) {ci} | direction {s['direction_acc']:.2f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizons", type=int, nargs="+", default=list(HORIZONS))
    ap.add_argument("--no-nowcast", action="store_true")
    out = run(**{"horizons": ap.parse_args().horizons, "nowcast": not ap.parse_args().no_nowcast})
    for k, v in out.items():
        print(f"\n{k}: evidence={v['evidence']}" + (f" gamma={v['gamma']:.2f}" if "gamma" in v else "") + f" rows={v['rows_total']}")
        sp = v["splits"]["ridge_gated"] if k == "nowcast" else v["splits"]
        for tag in ("dev", "holdout", "all"):
            if tag in sp:
                print(_line(tag, sp[tag]))
        print(f"  range [{v['range_mode']}]: coverage {v['coverage_80']:.2f} (flat {v['coverage_80_flat']:.2f}), holdout {v['holdout_coverage_80']:.2f} "
              f"(flat {v['holdout_coverage_80_flat']:.2f}), width {v['mean_log_width_scaled']:.3f} vs flat {v['mean_log_width_flat']:.3f}, "
              f"rows with range {v['n_with_interval']}" + ("" if v["interval_reliable"] else "  <-- too few rows to trust"))
        if "by_gap" in v:
            for g, d in v["by_gap"].items():
                print(f"  gap {g:4s} n={d['n']:3d} persist={d['persist_MAE']:.1f} transfer={d['transfer_MAE']:.1f} ridge={d['ridge_MAE']:.1f}")