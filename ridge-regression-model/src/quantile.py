"""Chronological split-conformal q10/q90 intervals, independent of Ridge points.

Only proper-training rows fit the estimators. A purged chronological suffix
calibrates them; dependent market observations do not imply guaranteed coverage.
"""
import math
import numpy as np
import pandas as pd
from sklearn.linear_model import QuantileRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from . import config
from .feature_engineering import FEATURES

VERSION = 1
COVERAGE = 0.8


def _finite(values, name):
    a = np.asarray(values, dtype=float)
    if not np.isfinite(a).all():
        raise ValueError(f"{name} must contain only finite values.")
    return a


def _ordered_predictions(bundle, X):
    x = X[bundle["features"]]
    _finite(x, "features")
    a = bundle["lower_model"].predict(x)
    b = bundle["upper_model"].predict(x)
    return np.minimum(a, b), np.maximum(a, b)


def _order_statistic(scores):
    scores = _finite(scores, "calibration scores")
    k = math.ceil((len(scores) + 1) * COVERAGE)
    if k > len(scores) or not len(scores):
        raise ValueError("Insufficient calibration scores for finite correction.")
    return float(np.sort(scores)[k - 1])


def fit_quantile(table, features=FEATURES, min_train=30, calibration_size=20):
    """Fit a chronological proper/calibration split; callers supply mature rows."""
    if min_train < 1 or calibration_size < 4:
        raise ValueError("Require positive min_train and at least four calibration rows.")
    if len(table) < min_train + calibration_size:
        raise ValueError("Insufficient mature rows for quantile training and calibration.")
    if not table["origin"].is_monotonic_increasing or table["origin"].duplicated().any():
        raise ValueError("Origins must be unique and chronologically ordered.")
    if not (table["target_date"] > table["origin"]).all():
        raise ValueError("Target dates must follow forecast origins.")
    _finite(table[list(features) + ["y", "mgo_t", "mgo_target"]], "training data")
    if (table[["mgo_t", "mgo_target"]] <= 0).any(axis=None):
        raise ValueError("MGO prices must be positive.")
    calibration = table.iloc[-calibration_size:]
    proper = table.iloc[:-calibration_size]
    proper = proper[proper["target_date"] < calibration["origin"].iloc[0]]
    if len(proper) < min_train:
        raise ValueError("Insufficient proper-training rows after target-date purge.")
    models = [make_pipeline(StandardScaler(), QuantileRegressor(
        quantile=q, alpha=0.01, solver="highs")) for q in (0.1, 0.9)]
    for model in models:
        model.fit(proper[list(features)], proper["y"])
    bundle = {"version": VERSION, "features": list(features),
              "lower_model": models[0], "upper_model": models[1]}
    lo, hi = _ordered_predictions(bundle, calibration)
    y = calibration["y"].to_numpy()
    scores = np.maximum.reduce([lo - y, y - hi, np.zeros(len(y))])
    date = lambda x: str(pd.Timestamp(x).date())
    bundle.update(dev_end=config.DEV_END, q_correction=_order_statistic(scores),
                  baseline_margin=_order_statistic(np.abs(y)),
                  proper_training_rows=len(proper), calibration_rows=len(calibration),
                  proper_training_cutoff=date(proper["target_date"].max()),
                  calibration_start=date(calibration["origin"].min()),
                  calibration_end=date(calibration["target_date"].max()),
                  trained_through_target_date=date(table["target_date"].max()))
    return bundle


def predict_quantile(bundle, X, anchors):
    """Produce sorted raw, calibrated and persistence bounds in USD/metric tonne."""
    if bundle.get("version") != VERSION:
        raise ValueError("Unsupported quantile artifact version; retrain the model.")
    lo, hi = _ordered_predictions(bundle, X)
    anchors = _finite(anchors, "anchors").reshape(-1)
    if len(anchors) != len(X) or (anchors <= 0).any():
        raise ValueError("One positive anchor is required per prediction.")
    correction = float(bundle["q_correction"])
    baseline = float(bundle["baseline_margin"])
    if not np.isfinite([correction, baseline]).all() or min(correction, baseline) < 0:
        raise ValueError("Calibration corrections must be finite and nonnegative.")
    bounds = {"raw_low": lo, "raw_high": hi, "low": lo - correction,
              "high": hi + correction, "baseline_low": np.full(len(X), -baseline),
              "baseline_high": np.full(len(X), baseline)}
    out = {}
    for name, value in bounds.items():
        with np.errstate(over="ignore", under="ignore", invalid="ignore"):
            prices = anchors * np.exp(value)
        if not np.isfinite(prices).all() or (prices <= 0).any():
            raise ValueError("Interval price transformation produced nonpositive or nonfinite bounds.")
        out[name] = prices
    out["raw_q10_return"] = lo
    out["raw_q90_return"] = hi
    return pd.DataFrame(out, index=X.index)


def walk_forward_quantile(table, features=FEATURES, min_train=30, calibration_size=20):
    """Evaluate each origin with only strictly earlier matured target outcomes."""
    rows = []
    for i in range(min_train + calibration_size, len(table)):
        test = table.iloc[[i]]
        train = table.iloc[:i]
        train = train[train["target_date"] < test["origin"].iloc[0]]
        try:
            bundle = fit_quantile(train, features, min_train, calibration_size)
        except ValueError as exc:
            if str(exc).startswith("Insufficient"):
                continue
            raise
        prediction = predict_quantile(bundle, test, test["mgo_t"])
        row = test.copy()
        for name in prediction:
            row[name] = prediction[name].to_numpy()
        row["proper_training_rows"] = bundle["proper_training_rows"]
        row["calibration_rows"] = bundle["calibration_rows"]
        row["trained_through_target_date"] = bundle["trained_through_target_date"]
        rows.append(row)
    cols = list(table.columns) + ["raw_low", "raw_high", "low", "high", "baseline_low", "baseline_high",
                                  "raw_q10_return", "raw_q90_return", "proper_training_rows", "calibration_rows",
                                  "trained_through_target_date"]
    return pd.concat(rows, ignore_index=True) if rows else pd.DataFrame(columns=cols)


def _metrics(rows, low, high):
    names = ("coverage", "lower_tail_rate", "upper_tail_rate", "mean_width", "interval_score")
    if rows.empty:
        return dict.fromkeys(names)
    y = rows["mgo_target"].to_numpy()
    lo, hi = rows[low].to_numpy(), rows[high].to_numpy()
    score = hi - lo + 10 * np.maximum(lo - y, 0) + 10 * np.maximum(y - hi, 0)
    return dict(zip(names, map(float, [np.mean((y >= lo) & (y <= hi)), np.mean(y < lo),
                                      np.mean(y > hi), np.mean(hi - lo), np.mean(score)])))


def summarize_quantile(res, dev_end=None):
    """Paired evaluation of exactly the bounds served, without test-set selection."""
    cut = pd.Timestamp(dev_end or config.DEV_END)
    out = {"nominal_coverage": COVERAGE, "method": "split_conformal_quantile", "dev_end": str(cut.date()),
           "pinball_scope": "sorted crossing-repaired raw return endpoints",
           "limitations": ["Dependent overlapping market outcomes do not guarantee nominal coverage.",
                           "Sparse observed MGO quotes; counts are not independent sample counts."]}
    origin = pd.to_datetime(res["origin"])
    target = pd.to_datetime(res["target_date"])
    masks = {"all": np.ones(len(res), dtype=bool), "dev": (origin < cut) & (target < cut),
             "holdout": origin >= cut}
    for name, mask in masks.items():
        rows = res.loc[mask]
        raw = _metrics(rows, "raw_low", "raw_high")
        for q, col, label in [(0.1, "raw_q10_return", "pinball_q10"), (0.9, "raw_q90_return", "pinball_q90")]:
            error = rows["y"].to_numpy() - rows[col].to_numpy()
            raw[label] = float(np.maximum(q * error, (q - 1) * error).mean()) if len(rows) else None
        out[name] = {"n": len(rows), "raw": raw, "calibrated": _metrics(rows, "low", "high"),
                     "baseline": _metrics(rows, "baseline_low", "baseline_high")}
    return out
