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


FEATURE_DESCRIPTIONS = {
    "gasoil_ret5": "5-day Singapore gasoil log return",
    "gasoil_ret20": "20-day Singapore gasoil log return",
    "brent_ret5": "5-day Brent crude log return",
    "brent_ret20": "20-day Brent crude log return",
    "dubai_ret5": "5-day Dubai crude log return",
    "dubai_ret20": "20-day Dubai crude log return",
    "usd_ret5": "5-day US Dollar index return",
    "usd_ret20": "20-day US Dollar index return",
    "gasoil_vol20": "20-day rolling gasoil volatility",
    "brent_vol20": "20-day rolling Brent volatility",
    "dubai_vol20": "20-day rolling Dubai volatility",
    "usd_vol20": "20-day rolling USD volatility",
    "gasoil_brent": "Gasoil-Brent crack spread",
    "brent_dubai": "Brent-Dubai crude quality spread",
    "basis_dev": "MGO vs Gasoil basis deviation from 90-day mean",
    "mgo_prev_ret": "Prior MGO quote return",
    "quote_age": "Log calendar age of previous quote",
    "gasoil_since_quote": "Gasoil return since prior MGO quote",
    "brent_since_quote": "Brent return since prior MGO quote",
    "gasoil_since": "Gasoil return since last quote",
    "brent_since": "Brent return since last quote",
    "dubai_since": "Dubai return since last quote",
    "usd_since": "USD return since last quote",
    "gap": "Log days since last observed quote",
    "basis_dev_prev": "Basis deviation at last quote date",
}


def _build_feature_shap_details(
    feature_names: list[str],
    raw_values: np.ndarray,
    scaled_values: np.ndarray,
    coefs: np.ndarray,
    shap_values: np.ndarray,
    anchor_price: float,
) -> list[dict]:
    details = []
    for name, raw_v, z_v, coef, phi in zip(feature_names, raw_values, scaled_values, coefs, shap_values):
        phi_f = float(phi)
        raw_f = float(raw_v)
        z_f = float(z_v)
        coef_f = float(coef)
        price_impact = anchor_price * (float(np.exp(phi_f)) - 1.0)
        direction = "upward" if phi_f > 1e-6 else ("downward" if phi_f < -1e-6 else "neutral")
        desc = FEATURE_DESCRIPTIONS.get(name, name.replace("_", " "))
        details.append({
            "feature": name,
            "description": desc,
            "feature_value": round(raw_f, 6),
            "standardized_value": round(z_f, 6),
            "coefficient": round(coef_f, 6),
            "shap_value": float(phi_f),
            "contribution": float(phi_f),
            "abs_shap_value": abs(phi_f),
            "direction": direction,
            "price_impact_usd": round(price_impact, 2),
        })
    return details


def _generate_explanation(
    target_label: str,
    predicted_return: float,
    anchor_price: float,
    forecast_price: float,
    top_pos: list[dict],
    top_neg: list[dict],
) -> str:
    direction_word = "increase" if predicted_return > 1e-5 else ("decrease" if predicted_return < -1e-5 else "remain steady")
    diff_usd = forecast_price - anchor_price
    pct_move = (float(np.exp(predicted_return)) - 1.0) * 100.0

    pos_drivers_str = (
        ", ".join(f"{d['feature']} (+{d['shap_value']:.4f})" for d in top_pos[:2])
        if top_pos else "none"
    )
    neg_drivers_str = (
        ", ".join(f"{d['feature']} ({d['shap_value']:.4f})" for d in top_neg[:2])
        if top_neg else "none"
    )

    return (
        f"The {target_label} Ridge model projects price to {direction_word} by {diff_usd:+.2f} USD/MT "
        f"({pct_move:+.2f}%), moving from {anchor_price:.2f} to {forecast_price:.2f} USD/MT. "
        f"Main upward associations: {pos_drivers_str}. "
        f"Main downward associations: {neg_drivers_str}. "
        f"Attributions reflect statistical Ridge associations with historical returns, "
        f"not confirmed causal drivers (FR-09)."
    )


def explain(
    h: int = 7,
    as_of=None,
    wide: pd.DataFrame = None,
    top_k: int = 5,
    model_type: str = "forecast",
) -> dict:
    """Per-prediction SHAP decomposition and top drivers for the Ridge regression model.
    
    Computes exact closed-form Shapley values for the standardized linear pipeline:
      phi_j = gamma * beta_j * (x_j - mu_j) / sigma_j
      base_value = gamma * intercept
    Satisfies efficiency: base_value + sum(phi_j) == predicted_return.
    """
    wide = wide if wide is not None else load_wide()
    if model_type == "forecast":
        meta, model = _load(f"{h}d")
        p = prepare(wide)
        as_of_ts = pd.Timestamp(as_of) if as_of is not None else p.mgo.index.max()
        avail = p.mgo.index[p.mgo.index <= as_of_ts]
        if len(avail) < 2:
            raise ValueError("No MGO quote on or before as_of_date.")
        origin = avail[-1]
        X = origin_features(p, [origin])[meta["features"]]
        if X.isna().any(axis=None):
            raise ValueError("Features unavailable for this date (insufficient history).")

        gamma = float(meta.get("gamma", 1.0))
        scaler = model.named_steps["standardscaler"]
        ridge = model.named_steps["ridgecv"]

        scaled_values = scaler.transform(X)[0]
        raw_values = X.iloc[0].values
        coefs = ridge.coef_
        intercept = float(ridge.intercept_)
        base_value = float(intercept * gamma)
        shap_values = coefs * scaled_values * gamma

        predicted_return = float(model.predict(X)[0]) * gamma
        anchor = float(p.mgo[origin])
        forecast_price = anchor * float(np.exp(predicted_return))
        quote_age_days = int((as_of_ts - origin).days)
        model_version = f"ridge-{h}d-alpha{meta['alpha']:.3g}-gamma{gamma:.2f}-to-{meta['trained_to_origin']}"
        anchor_date = str(origin.date())
        horizon_val = h
        target_label = f"{h}-day"
        feature_names = list(X.columns)
    elif model_type == "nowcast":
        meta, model = _load("nowcast")
        as_of_ts = pd.Timestamp(as_of) if as_of is not None else wide.index.max()
        p = prepare(wide, end=as_of_ts)
        avail = p.mgo.index[p.mgo.index <= as_of_ts]
        if len(avail) < 2:
            raise ValueError("No MGO quote on or before as_of_date.")
        last = avail[-1]
        anchor = float(p.mgo[last])
        gap = int((as_of_ts - last).days)
        anchor_date = str(last.date())
        quote_age_days = gap
        horizon_val = None
        target_label = "nowcast"
        model_version = f"ridge-nowcast-alpha{meta['alpha']:.3g}-to-{meta['trained_to_origin']}"

        if gap < meta.get("min_gap_days", config.MIN_GAP_DAYS):
            predicted_return = 0.0
            forecast_price = anchor
            base_value = 0.0
            scaler = model.named_steps["standardscaler"]
            ridge = model.named_steps["ridgecv"]
            scaled_values = np.zeros(len(meta["features"]))
            raw_values = np.zeros(len(meta["features"]))
            coefs = ridge.coef_
            shap_values = np.zeros(len(meta["features"]))
            feature_names = meta["features"]
        else:
            X = nowcast_features(p, [as_of_ts], [last])[meta["features"]]
            if X.isna().any(axis=None):
                raise ValueError("Features unavailable for this date (market data too old or insufficient history).")
            scaler = model.named_steps["standardscaler"]
            ridge = model.named_steps["ridgecv"]
            scaled_values = scaler.transform(X)[0]
            raw_values = X.iloc[0].values
            coefs = ridge.coef_
            intercept = float(ridge.intercept_)
            base_value = intercept
            shap_values = coefs * scaled_values
            predicted_return = float(model.predict(X)[0])
            forecast_price = anchor * float(np.exp(predicted_return))
            feature_names = list(X.columns)
    else:
        raise ValueError(f"Unknown model_type '{model_type}'; must be 'forecast' or 'nowcast'.")

    all_details = _build_feature_shap_details(
        feature_names, raw_values, scaled_values, coefs, shap_values, anchor
    )
    ranked_all = sorted(all_details, key=lambda d: d["abs_shap_value"], reverse=True)
    top_drivers = ranked_all[:top_k]
    top_pos = [d for d in ranked_all if d["shap_value"] > 0][:top_k]
    top_neg = [d for d in ranked_all if d["shap_value"] < 0][:top_k]

    sum_shap = sum(d["shap_value"] for d in all_details)
    efficiency_check = bool(abs(base_value + sum_shap - predicted_return) < 1e-7)
    explanation = _generate_explanation(
        target_label, predicted_return, anchor, forecast_price, top_pos, top_neg
    )

    return {
        "model_type": model_type,
        "horizon_days": horizon_val,
        "as_of_date": str(as_of_ts.date()),
        "anchor_quote_date": anchor_date,
        "anchor_price": anchor,
        "quote_age_days": quote_age_days,
        "forecast_price": round(forecast_price, 2),
        "predicted_return": round(predicted_return, 6),
        "base_value": round(base_value, 6),
        "unit": "USD/metric tonne",
        "model_version": model_version,
        "top_drivers": top_drivers,
        "top_positive_drivers": top_pos,
        "top_negative_drivers": top_neg,
        "all_shap_values": all_details,
        "efficiency_check": efficiency_check,
        "explanation": explanation,
    }