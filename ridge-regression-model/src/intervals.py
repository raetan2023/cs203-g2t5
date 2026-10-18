"""Range from past out-of-sample residuals, scaled by market volatility (gasoil_vol20).
Using only residuals already known at each origin.
"""
import numpy as np
import pandas as pd
from .config import QUANTILES, MIN_RESID


def add_range(res: pd.DataFrame, qs=QUANTILES, min_resid: int = MIN_RESID, vol_col: str = "gasoil_vol20", gamma: float = 1.0):
    res = res.copy()
    shrunk_ret = res["pred_ret"] * gamma
    res["pred_ret_raw"] = res["pred_ret"]
    res["pred_ret"] = shrunk_ret
    res["gamma"] = gamma
    err = (res["y"] - shrunk_ret).to_numpy()
    n = len(res)
    
    # Extract market volatility per origin (default to 0.02 if absent/nan, clip at 1e-4)
    if vol_col in res.columns:
        vol = res[vol_col].to_numpy().astype(float)
        vol = np.nan_to_num(vol, nan=0.02)
    else:
        vol = np.full(n, 0.02)
    vol = np.maximum(vol, 1e-4)
    
    lo, hi = np.full(n, np.nan), np.full(n, np.nan)
    origin = res["origin"].to_numpy()
    tdate = res["target_date"].to_numpy()
    target_cov = float(qs[1] - qs[0]) if len(qs) == 2 else 0.80
    
    for i in range(n):
        known = tdate[:i] < origin[i]
        if known.sum() >= min_resid:
            # Standardize past known errors by the volatility at their origin
            z_known = err[:i][known] / vol[:i][known]
            q_scale = float(np.quantile(np.abs(z_known), target_cov))
            # Scale interval by current market volatility at origin i
            lo[i] = -q_scale * vol[i]
            hi[i] = q_scale * vol[i]
            
    res["low"] = res["mgo_t"] * np.exp(shrunk_ret + lo)
    res["high"] = res["mgo_t"] * np.exp(shrunk_ret + hi)
    res["pred_price"] = res["mgo_t"] * np.exp(shrunk_ret)
    ok = res["low"].notna()
    cov = float(((res["mgo_target"] >= res["low"]) & (res["mgo_target"] <= res["high"]))[ok].mean()) if ok.any() else float("nan")
    return res, cov, int(ok.sum())

