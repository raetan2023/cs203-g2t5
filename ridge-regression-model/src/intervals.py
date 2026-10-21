"""Symmetric range around the forecast: pred_ret +/- q * sigma_now, where q is the 80% quantile of past
|error| / sigma. Only residuals already known at each origin are used. scaled=False gives a flat range
(q * 1) for comparison. Guarantees low <= forecast <= high."""
import numpy as np
import pandas as pd
from .config import INTERVAL_COVERAGE, MIN_RESID


def add_range(res: pd.DataFrame, coverage: float = INTERVAL_COVERAGE, min_resid: int = MIN_RESID, scaled: bool = True):
    res = res.copy()
    n = len(res)
    err = (res["y"] - res["pred_ret"]).to_numpy()
    sig = res["sigma"].to_numpy() if (scaled and "sigma" in res.columns) else np.ones(n)
    z = np.abs(err) / sig
    q = np.full(n, np.nan)
    origin = res["origin"].to_numpy(); tdate = res["target_date"].to_numpy()
    for i in range(n):
        known = tdate[:i] < origin[i]          # residual is only known once its target date has passed
        if known.sum() >= min_resid:
            q[i] = np.quantile(z[:i][known], coverage)
    margin = q * sig
    res["low"] = res["mgo_t"] * np.exp(res["pred_ret"] - margin)
    res["high"] = res["mgo_t"] * np.exp(res["pred_ret"] + margin)
    res["pred_price"] = res["mgo_t"] * np.exp(res["pred_ret"])
    ok = res["low"].notna()
    cov = float(((res["mgo_target"] >= res["low"]) & (res["mgo_target"] <= res["high"]))[ok].mean()) if ok.any() else float("nan")
    return res, cov, int(ok.sum())


def mean_log_width(res: pd.DataFrame, mask=None) -> float:
    ok = res["low"].notna() if mask is None else (res["low"].notna() & mask)
    return float(np.log(res["high"][ok] / res["low"][ok]).mean()) if ok.any() else float("nan")


def coverage_on(res: pd.DataFrame, mask) -> float:
    ok = res["low"].notna() & mask
    if not ok.any():
        return float("nan")
    return float(((res["mgo_target"] >= res["low"]) & (res["mgo_target"] <= res["high"]))[ok].mean())


def final_scales(res: pd.DataFrame, coverage: float = INTERVAL_COVERAGE):
    """q for serving: scaled (multiply by sigma_now) and flat (log-return units)."""
    err = np.abs((res["y"] - res["pred_ret"]).to_numpy())
    return float(np.quantile(err / res["sigma"].to_numpy(), coverage)), float(np.quantile(err, coverage))