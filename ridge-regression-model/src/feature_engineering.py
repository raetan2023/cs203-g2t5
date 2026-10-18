"""The ONE feature pipeline, used by training and by the API.

Origins are MGO quote dates. Every market input is delayed by LAG_DAYS, so a
feature at origin t only uses data published at least that many days earlier.
"""
from dataclasses import dataclass
import numpy as np
import pandas as pd
from .config import (INPUTS, LAG_DAYS, MAX_FFILL_DAYS, CLIP_RET5, CLIP_RET20, CLIP_DAILY)

GROUPS = {
    "returns": [f"{c}_{w}" for c in INPUTS for w in ("ret5", "ret20")],
    "volatility": [f"{c}_vol20" for c in INPUTS],
    "basis": ["basis_dev"],
    "mgo_history": ["mgo_prev_ret", "quote_age"],
    "since_quote": ["gasoil_since_quote", "brent_since_quote"],
}
FEATURES = [f for g in GROUPS.values() for f in g]


@dataclass
class Prepared:
    mgo: pd.Series          # observed quotes only, never interpolated
    daily: pd.DataFrame     # inputs on a daily calendar, forward-filled (unlagged)
    lagged: pd.DataFrame    # inputs after publication lag
    mgo_ff: pd.Series       # last known quote on each calendar day (causal)


def prepare(wide: pd.DataFrame) -> Prepared:
    mgo = wide["mgo"].dropna()
    end = max(wide.index.max(), mgo.index.max())
    cal = pd.date_range(wide.index.min(), end, freq="D")
    daily = wide[INPUTS].reindex(cal).ffill(limit=MAX_FFILL_DAYS)
    lagged = pd.DataFrame({c: daily[c].shift(LAG_DAYS[c]) for c in INPUTS})
    return Prepared(mgo=mgo, daily=daily, lagged=lagged, mgo_ff=mgo.reindex(cal).ffill())


def market_features(p: Prepared) -> pd.DataFrame:
    L = p.lagged
    f = pd.DataFrame(index=L.index)
    for c in INPUTS:
        lr = np.log(L[c])
        f[f"{c}_ret5"] = lr.diff(5).clip(-CLIP_RET5, CLIP_RET5)
        f[f"{c}_ret20"] = lr.diff(20).clip(-CLIP_RET20, CLIP_RET20)
        f[f"{c}_vol20"] = lr.diff().clip(-CLIP_DAILY, CLIP_DAILY).rolling(20, min_periods=10).std()
    basis = np.log(p.mgo_ff) - np.log(L["gasoil"])   # MGO USD/t vs gasoil USD/bbl (ratio, causal)
    f["basis_dev"] = basis - basis.rolling(90, min_periods=30).mean()
    return f


def origin_features(p: Prepared, origins) -> pd.DataFrame:
    """Features for the given MGO quote dates (each must be in p.mgo.index)."""
    origins = pd.DatetimeIndex(origins)
    F = market_features(p).reindex(origins)
    q = p.mgo.index
    prev_map = pd.Series(q[:-1], index=q[1:])
    prev = pd.DatetimeIndex(prev_map.reindex(origins).values)
    L = p.lagged
    log_mgo = np.log(p.mgo)
    F["mgo_prev_ret"] = (log_mgo.reindex(origins).values - log_mgo.reindex(prev).values).clip(-0.25, 0.25)
    F["quote_age"] = np.log1p((origins - prev).days.astype(float))
    for c in ("gasoil", "brent"):
        lc = np.log(L[c])
        F[f"{c}_since_quote"] = (lc.reindex(origins).values - lc.reindex(prev).values).clip(-0.25, 0.25)
    return F[FEATURES]
