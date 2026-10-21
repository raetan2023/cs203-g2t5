"""Training table per horizon: one row per MGO quote date with a later quote
near origin + h. MGO labels are never interpolated."""
import numpy as np
import pandas as pd
from .config import TOLERANCE_DAYS, VOL_FLOOR
from .feature_engineering import Prepared, origin_features, FEATURES


def build_table(p: Prepared, h: int, tol: int = TOLERANCE_DAYS) -> pd.DataFrame:
    idx = p.mgo.index
    targets = idx + pd.Timedelta(days=h)
    t2 = idx[idx.get_indexer(targets, method="nearest")]
    ok = (t2 > idx) & (np.abs((t2 - targets).days) <= tol)
    origins, target_dates = idx[ok], t2[ok]
    X = origin_features(p, origins)
    out = pd.DataFrame(index=range(len(origins)))
    out["origin"] = origins
    out["target_date"] = target_dates
    out["mgo_t"] = p.mgo.reindex(origins).values
    out["mgo_target"] = p.mgo.reindex(target_dates).values
    out["y"] = np.log(out["mgo_target"] / out["mgo_t"])
    # diagnostic ONLY (uses realised gasoil, not available at forecast time)
    g = p.daily["gasoil"]
    out["oracle_gasoil_ret"] = (np.log(g.reindex(target_dates).values) - np.log(g.reindex(origins).values))
    out = pd.concat([out, X.reset_index(drop=True)], axis=1)
    # secondary baselines, built only from quotes up to and including the origin
    out["sma5_price"] = p.mgo.rolling(5, min_periods=1).mean().reindex(origins).values
    out["sma10_price"] = p.mgo.rolling(10, min_periods=1).mean().reindex(origins).values
    out["ema10_price"] = p.mgo.ewm(span=10).mean().reindex(origins).values
    out["sigma"] = np.maximum(out["gasoil_vol20"], VOL_FLOOR) * np.sqrt(h)   # volatility scale for the range
    return out.dropna(subset=FEATURES + ["y"]).reset_index(drop=True)