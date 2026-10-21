"""predict(h, as_of) and nowcast(as_of): load saved Ridge pipelines and estimate MGO.

Forecast anchor = latest MGO quote on or before as_of (same definition as training origins).
Range = forecast +/- q_scale * sigma_now (volatility-scaled)."""
import json
import joblib
import numpy as np
import pandas as pd
from . import config
from .config import ARTIFACTS, VOL_FLOOR
from .data_loader import load_wide
from .feature_engineering import prepare, origin_features, nowcast_features

REQUIRED_BASELINES = ("persist", "drift", "sma5")


def evidence_label(bt: dict) -> str:
    """'no_edge': does not beat every required baseline on average.
    'weak': beats them on average (CI may include zero, or the result was tuned/selected on the data scored).
    'supported': beats them all with CIs above zero AND has been confirmed on data not used for any choice."""
    bl = bt.get("baselines") or {}
    req = {k: v for k, v in bl.items() if k in REQUIRED_BASELINES}
    if not req:
        return "no_edge"
    if any(not (v["MAE_skill"] > 0) for v in req.values()):
        return "no_edge"
    strong = all(v["paired_gain_CI95"][0] > 0 for v in req.values())
    return "supported" if (strong and not bt.get("post_hoc", True)) else "weak"


def _load(name):
    return json.loads((ARTIFACTS / f"ridge_{name}.json").read_text()), joblib.load(ARTIFACTS / f"ridge_{name}.joblib")


def _margin(meta, vol, scale):
    """Half-width of the range in log-return units, using the range method that calibrated best in the backtest."""
    if meta.get("range_mode", "scaled") == "flat":
        return float(meta["q_flat"])
    return float(meta["q_scale"]) * max(float(vol), VOL_FLOOR) * scale


def predict(h: int, as_of=None, wide: pd.DataFrame = None) -> dict:
    meta, model = _load(f"{h}d")
    p = prepare(wide if wide is not None else load_wide())
    as_of = pd.Timestamp(as_of) if as_of is not None else p.mgo.index.max()
    avail = p.mgo.index[p.mgo.index <= as_of]
    if len(avail) < 2:
        raise ValueError("No MGO quote on or before as_of_date.")
    origin = avail[-1]
    X = origin_features(p, [origin])[meta["features"]]
    if X.isna().any(axis=None):
        raise ValueError("Features unavailable for this date (insufficient history).")
    ret = float(model.predict(X)[0]) * float(meta.get("gamma", 1.0))
    margin = _margin(meta, X["gasoil_vol20"].iloc[0], np.sqrt(h))
    anchor = float(p.mgo[origin])
    bt = meta["backtest"]
    return {
        "horizon_days": h, "as_of_date": str(as_of.date()), "anchor_quote_date": str(origin.date()),
        "anchor_price": anchor, "quote_age_days": int((as_of - origin).days),
        "forecast": anchor * float(np.exp(ret)),
        "low": anchor * float(np.exp(ret - margin)), "high": anchor * float(np.exp(ret + margin)),
        "unit": "USD/metric tonne", "evidence": evidence_label(bt),
        "mae_skill_vs_persistence": bt["MAE_skill_vs_persist"], "backtest_rows": bt["n"],
        "model_version": f"ridge-{h}d-alpha{meta['alpha']:.3g}-gamma{meta.get('gamma', 1.0):.2f}-to-{meta['trained_to_origin']}",
    }


def nowcast(as_of=None, wide: pd.DataFrame = None) -> dict:
    """Estimate MGO at as_of from the last quote and market moves since. Fresh quotes (< MIN_GAP_DAYS old) are carried forward."""
    meta, model = _load("nowcast")
    wide = wide if wide is not None else load_wide()
    as_of = pd.Timestamp(as_of) if as_of is not None else wide.index.max()
    p = prepare(wide, end=as_of)
    avail = p.mgo.index[p.mgo.index <= as_of]
    if len(avail) < 2:
        raise ValueError("No MGO quote on or before as_of_date.")
    last = avail[-1]
    bt = meta["backtest"]
    anchor = float(p.mgo[last])
    base = {"as_of_date": str(as_of.date()), "last_quote_date": str(last.date()), "last_quote_price": anchor,
            "unit": "USD/metric tonne", "evidence": evidence_label(bt),
            "mae_skill_vs_persistence": bt["MAE_skill_vs_persist"], "backtest_rows": bt["n"],
            "model_version": f"ridge-nowcast-alpha{meta['alpha']:.3g}-to-{meta['trained_to_origin']}"}
    gap = int((as_of - last).days)
    if gap == 0:
        return {**base, "status": "observed", "gap_days": 0, "estimate": anchor, "low": anchor, "high": anchor}
    if gap < meta.get("min_gap_days", config.MIN_GAP_DAYS):
        return {**base, "status": "carried_forward", "gap_days": gap, "estimate": anchor, "low": None, "high": None}
    X = nowcast_features(p, [as_of], [last])[meta["features"]]
    if X.isna().any(axis=None):
        raise ValueError("Features unavailable for this date (market data too old or insufficient history).")
    ret = float(model.predict(X)[0])
    margin = _margin(meta, X["gasoil_vol20"].iloc[0], np.sqrt(gap))
    return {**base, "status": "estimated", "gap_days": gap, "estimate": anchor * float(np.exp(ret)),
            "low": anchor * float(np.exp(ret - margin)), "high": anchor * float(np.exp(ret + margin))}