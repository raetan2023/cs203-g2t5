"""Nowcast: estimate MGO at date t from the last quote and the market moves since then.
Target = log(MGO_t / MGO_previous_quote). Benchmarks: the last quote (persistence) and gasoil direct transfer
(last quote x the lagged gasoil move since that quote)."""
import numpy as np
import pandas as pd
from . import config
from .config import VOL_FLOOR
from .feature_engineering import Prepared, nowcast_features, NOW_FEATURES


def build_nowcast_table(p: Prepared) -> pd.DataFrame:
    q = p.mgo.index
    origins, prevs = q[1:], q[:-1]
    X = nowcast_features(p, origins, prevs)
    t = pd.DataFrame({"origin": origins, "target_date": origins,
                      "mgo_t": p.mgo.values[:-1],          # anchor = previous quote
                      "mgo_target": p.mgo.values[1:]})     # what we try to estimate
    t["y"] = np.log(t["mgo_target"] / t["mgo_t"])
    t["gap_days"] = (origins - prevs).days.astype(int)
    g = p.daily["gasoil"]   # diagnostic only: same-day gasoil move, not available under the 1-day lag
    t["oracle_gasoil_ret"] = np.log(g.reindex(origins).values) - np.log(g.reindex(prevs).values)
    out = pd.concat([t, X], axis=1)
    out["gasoil_transfer_price"] = out["mgo_t"] * np.exp(out["gasoil_since"])
    out["sigma"] = np.maximum(out["gasoil_vol20"], VOL_FLOOR) * np.sqrt(out["gap_days"])
    return out.dropna(subset=NOW_FEATURES + ["y", "sigma", "oracle_gasoil_ret"]).reset_index(drop=True)


def gap_breakdown(res: pd.DataFrame) -> dict:
    """MAE of last quote, gasoil direct transfer and Ridge, by age of the last quote."""
    buckets = {"1d": res.gap_days <= 1, "2-6d": (res.gap_days >= 2) & (res.gap_days <= 6), "7d+": res.gap_days >= 7}
    out = {}
    for k, m in buckets.items():
        g = res[m]
        if len(g):
            mae = lambda price: float(np.mean(np.abs(g.mgo_target - price)))
            mp, mt, mr = mae(g.mgo_t), mae(g.gasoil_transfer_price), mae(g.pred_price)
            out[k] = {"n": int(len(g)), "persist_MAE": mp, "transfer_MAE": mt, "ridge_MAE": mr,
                      "transfer_skill": 1 - mt / mp, "ridge_skill": 1 - mr / mp}
    return out


def gated(res: pd.DataFrame, price_col: str, min_gap: int = None) -> pd.DataFrame:
    """Use `price_col` only when the last quote is >= min_gap days old; otherwise carry the last quote forward."""
    min_gap = config.MIN_GAP_DAYS if min_gap is None else min_gap
    r = res.copy()
    r["pred_price"] = np.where(r["gap_days"] >= min_gap, r[price_col], r["mgo_t"])
    r["pred_ret"] = np.log(r["pred_price"] / r["mgo_t"])
    return r