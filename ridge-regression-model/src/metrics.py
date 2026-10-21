import numpy as np
import pandas as pd
from . import config
from .config import SEED


def _block_bootstrap_ci(d: np.ndarray, block: int = 7, reps: int = 2000, seed: int = SEED):
    """95% CI for mean(d) with a moving-block bootstrap (rows overlap in time)."""
    rng = np.random.default_rng(seed)
    n = len(d)
    if n < block * 2:
        return (float("nan"), float("nan"))
    starts = np.arange(n - block + 1)
    k = int(np.ceil(n / block))
    means = np.empty(reps)
    for r in range(reps):
        idx = np.concatenate([np.arange(s, s + block) for s in rng.choice(starts, k)])[:n]
        means[r] = d[idx].mean()
    return tuple(float(x) for x in np.quantile(means, [0.025, 0.975]))


_mae = lambda e: float(np.mean(np.abs(e)))
_rmse = lambda e: float(np.sqrt(np.mean(np.square(e))))


def baseline_prices(res: pd.DataFrame) -> dict:
    out = {"persist": res["mgo_t"].to_numpy()}                      # no change
    if "drift_ret" in res:
        out["drift"] = (res["mgo_t"] * np.exp(res["drift_ret"])).to_numpy()   # average past return
    for name, col in (("sma5", "sma5_price"), ("sma10", "sma10_price"), ("ema10", "ema10_price"),
                      ("gasoil_transfer", "gasoil_transfer_price")):
        if col in res:
            out[name] = res[col].to_numpy()
    return out


def score(res: pd.DataFrame) -> dict:
    """res needs mgo_t, mgo_target, y, pred_ret, pred_price. A model 'beats' a baseline when MAE_skill > 0."""
    truth = res["mgo_target"].to_numpy()
    e_model = truth - res["pred_price"].to_numpy()
    baselines = {}
    for name, b in baseline_prices(res).items():
        e_b = truth - b
        d = np.abs(e_b) - np.abs(e_model)                           # > 0: model better on that row
        lo, hi = _block_bootstrap_ci(d)
        baselines[name] = {"MAE": _mae(e_b), "RMSE": _rmse(e_b),
                           "MAE_skill": float(1 - _mae(e_model) / _mae(e_b)) if _mae(e_b) > 0 else float("nan"),
                           "paired_gain_CI95": [lo, hi]}
    e_pers = truth - res["mgo_t"].to_numpy()
    d_p = np.abs(e_pers) - np.abs(e_model)
    ret_dir = res["pred_ret_raw"] if "pred_ret_raw" in res else res["pred_ret"]
    nz = ((res["y"] != 0) & (ret_dir != 0)).to_numpy()
    out = {
        "n": int(len(res)),
        "model_MAE": _mae(e_model), "model_RMSE": _rmse(e_model),
        "persist_MAE": _mae(e_pers), "persist_RMSE": _rmse(e_pers),
        "MAE_skill_vs_persist": baselines["persist"]["MAE_skill"],
        "RMSE_skill_vs_persist": float(1 - _rmse(e_model) / _rmse(e_pers)) if _rmse(e_pers) > 0 else float("nan"),
        "paired_MAE_gain_mean": float(d_p.mean()),
        "paired_MAE_gain_CI95": baselines["persist"]["paired_gain_CI95"],
        "direction_acc": float((np.sign(ret_dir[nz]) == np.sign(res["y"][nz])).mean()) if nz.any() else float("nan"),
        "n_direction": int(nz.sum()),
        "baselines": baselines,
    }
    if "oracle_gasoil_ret" in res:
        e_or = truth - (res["mgo_t"] * np.exp(res["oracle_gasoil_ret"])).to_numpy()
        out["oracle_gasoil_MAE"] = _mae(e_or)   # ceiling: uses realised gasoil, NOT a forecast
    return out


def score_splits(res: pd.DataFrame, dev_end=None, min_rows: int = 14) -> dict:
    """Score all rows, the development rows and the holdout rows separately."""
    cut = pd.Timestamp(dev_end or config.DEV_END)
    out = {"all": score(res)}
    for name, mask in (("dev", res["origin"] < cut), ("holdout", res["origin"] >= cut)):
        if int(mask.sum()) >= min_rows:
            out[name] = score(res[mask])
    return out