"""predict(h, as_of) and nowcast(as_of): load saved Ridge pipelines and estimate MGO.

Forecast anchor = latest MGO quote on or before as_of (same definition as training origins).
Forward range = independently fitted q10/q90 plus chronological calibration.
Nowcast retains its legacy symmetric range."""
import json
import joblib
import numpy as np
import pandas as pd
from . import config
from .config import ARTIFACTS, VOL_FLOOR
from .data_loader import load_wide
from .feature_engineering import prepare, origin_features, nowcast_features
from .quantile import predict_quantile

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


def _top_drivers(model, X: pd.DataFrame, gamma: float, limit: int = 5) -> list[dict]:
    """Return signed feature contributions to the shrunk predicted log return."""
    scaler = model.named_steps["standardscaler"]
    ridge = model.named_steps["ridgecv"]
    scaled_values = scaler.transform(X)[0]
    contributions = ridge.coef_ * scaled_values * gamma
    ranked = sorted(
        zip(X.columns, contributions),
        key=lambda item: abs(item[1]),
        reverse=True,
    )
    return [
        {"feature": feature, "contribution": float(contribution)}
        for feature, contribution in ranked[:limit]
    ]


class IntervalArtifactUnavailable(RuntimeError):
    """Training is required before a compatible interval can be served."""


def _load_quantile(h, meta):
    if meta.get("interval_version") != 1:
        raise IntervalArtifactUnavailable("Quantile artifacts required; run python -m src.train.")
    bundle = joblib.load(ARTIFACTS / f"quantile_{h}d.joblib")
    if bundle.get("version") != 1 or bundle.get("horizon_days") != h:
        raise IntervalArtifactUnavailable("Incompatible quantile artifact; retrain this horizon.")
    if not meta.get("training_run_id") or bundle.get("training_run_id") != meta["training_run_id"]:
        raise IntervalArtifactUnavailable("Ridge and quantile artifacts belong to different training runs.")
    if bundle.get("trained_through_target_date") != meta.get("trained_through_target_date"):
        raise IntervalArtifactUnavailable("Ridge and quantile training cutoffs differ; retrain together.")
    return bundle


def interval_metadata(bundle):
    report = bundle["evaluation"]
    # Do not present development performance as unseen holdout performance.
    cohort = report["holdout"]
    calibrated, baseline = cohort["calibrated"], cohort["baseline"]
    return {
        "method": "split_conformal_quantile", "nominal_coverage": 0.8,
        "empirical_coverage": calibrated["coverage"], "evaluation_rows": cohort["n"],
        "evaluation_scope": f"chronological holdout origins >= {report['dev_end']}; paired interval rows",
        "baseline_coverage": baseline["coverage"], "baseline_mean_width": baseline["mean_width"],
        "mean_width": calibrated["mean_width"],
        "limitations": "Experimental empirical calibration, not a coverage guarantee. "
            "Dependent, overlapping targets; 20 calibration quotes; target quotes within +/-3 days. "
            "Ridge central estimate is independent and may lie outside this range.",
    }


def predict(h: int, as_of=None, wide: pd.DataFrame = None) -> dict:
    meta, model = _load(f"{h}d")
    bundle = _load_quantile(h, meta)
    p = prepare(wide if wide is not None else load_wide())
    as_of = pd.Timestamp(as_of) if as_of is not None else p.mgo.index.max()
    avail = p.mgo.index[p.mgo.index <= as_of]
    if len(avail) < 2:
        raise ValueError("No MGO quote on or before as_of_date.")
    origin = avail[-1]
    if origin < pd.Timestamp(meta["trained_through_target_date"]):
        raise ValueError("Requested anchor predates the model's latest training/calibration label; use chronological backtests for historical evaluation.")
    if as_of >= origin + pd.Timedelta(days=h):
        raise ValueError("Forecast target date has passed; a newer observed MGO quote is required.")
    X = origin_features(p, [origin])[meta["features"]]
    if X.isna().any(axis=None):
        raise ValueError("Features unavailable for this date (insufficient history).")
    gamma = float(meta.get("gamma", 1.0))
    ret = float(model.predict(X)[0]) * gamma
    top_drivers = _top_drivers(model, X, gamma)
    anchor = float(p.mgo[origin])
    bounds = predict_quantile(bundle, X, [anchor]).iloc[0]
    bt = meta["backtest"]
    return {
        "horizon_days": h, "as_of_date": str(as_of.date()), "anchor_quote_date": str(origin.date()),
        "anchor_price": anchor, "quote_age_days": int((as_of - origin).days),
        "forecast": anchor * float(np.exp(ret)),
        "low": float(bounds["low"]), "high": float(bounds["high"]),
        "raw_q10_price": float(bounds["raw_low"]), "raw_q90_price": float(bounds["raw_high"]),
        "target_date": str((origin + pd.Timedelta(days=h)).date()),
        "interval": interval_metadata(bundle),
        "unit": "USD/metric tonne", "evidence": evidence_label(bt),
        "mae_skill_vs_persistence": bt["MAE_skill_vs_persist"], "backtest_rows": bt["n"],
        "model_version": f"ridge-{h}d-alpha{meta['alpha']:.3g}-gamma{meta.get('gamma', 1.0):.2f}-to-{meta['trained_to_origin']}-qv1-{meta['training_run_id'][:12]}",
        "top_drivers": top_drivers,
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