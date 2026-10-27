"""Forward test on quotes that arrived AFTER the model was frozen.
    python -m src.evaluate_new [--horizons 7 14 30]
Uses the saved artifacts (never retrains). Run it every week and keep the output."""
import argparse, json
import joblib
import numpy as np
import pandas as pd
from .config import ARTIFACTS, HORIZONS
from .data_loader import load_wide
from .feature_engineering import prepare
from .labels import build_table
from .metrics import score
from .predict import evidence_label, _load_quantile
from .quantile import predict_quantile, summarize_quantile


def evaluate(h: int, wide: pd.DataFrame = None):
    meta = json.loads((ARTIFACTS / f"ridge_{h}d.json").read_text())
    model = joblib.load(ARTIFACTS / f"ridge_{h}d.joblib")
    p = prepare(wide if wide is not None else load_wide())
    table = build_table(p, h)
    bundle = _load_quantile(h, meta)
    cutoff = pd.Timestamp(meta["trained_through_target_date"])
    new = table[table["origin"] > cutoff].copy()
    if new.empty:
        return None
    raw = model.predict(new[meta["features"]])
    new["pred_ret_raw"] = raw
    new["pred_ret"] = raw * float(meta["gamma"])
    new["pred_price"] = new["mgo_t"] * np.exp(new["pred_ret"])
    new["drift_ret"] = meta["train_mean_ret"]                  # drift frozen at training time
    bounds = predict_quantile(bundle, new[meta["features"]], new["mgo_t"])
    for col in bounds:
        new[col] = bounds[col].to_numpy()
    return {**score(new), "quantile_intervals": summarize_quantile(new, dev_end=bundle["evaluation"]["dev_end"]),
            "frozen_through_target_date": str(cutoff.date())}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--horizons", type=int, nargs="+", default=list(HORIZONS))
    wide = load_wide()
    for h in ap.parse_args().horizons:
        s = evaluate(h, wide)
        if s is None:
            print(f"{h}d: no quotes yet after the frozen model's latest used target date."); continue
        b = {k: round(v["MAE_skill"], 3) for k, v in s["baselines"].items()}
        s_for_flag = {**s, "post_hoc": False}
        print(f"{h}d: n={s['n']} MAE={s['model_MAE']:.1f} skill vs {b} CI(persist) {[round(x, 1) for x in s['paired_MAE_gain_CI95']]} "
              f"-> evidence if n is large enough: {evidence_label(s_for_flag) if s['n'] >= 30 else 'too few rows (need >= 30)'}")
        qi = s["quantile_intervals"]["all"]
        print(f"  frozen intervals n={qi['n']}: coverage={qi['calibrated']['coverage']:.3f} "
              f"baseline={qi['baseline']['coverage']:.3f}; width={qi['calibrated']['mean_width']:.2f} "
              f"baseline={qi['baseline']['mean_width']:.2f}")
