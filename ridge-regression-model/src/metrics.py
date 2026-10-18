import numpy as np
import pandas as pd
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
    return tuple(np.quantile(means, [0.025, 0.975]).astype(float))


def score(res: pd.DataFrame) -> dict:
    """res needs mgo_t, mgo_target, y, pred_ret, pred_price (persistence = no change)."""
    e_model = (res["mgo_target"] - res["pred_price"]).to_numpy()
    e_pers = (res["mgo_target"] - res["mgo_t"]).to_numpy()
    mae = lambda e: float(np.mean(np.abs(e)))
    rmse = lambda e: float(np.sqrt(np.mean(e ** 2)))
    nz = (res["y"] != 0).to_numpy()
    d = np.abs(e_pers) - np.abs(e_model)           # > 0 means the model beat persistence on that row
    lo, hi = _block_bootstrap_ci(d)
    ret_for_dir = res["pred_ret_raw"] if "pred_ret_raw" in res.columns else res["pred_ret"]
    nz_dir = (res["y"] != 0).to_numpy() & (ret_for_dir != 0).to_numpy()
    out = {
        "n": int(len(res)),
        "model_MAE": mae(e_model), "persist_MAE": mae(e_pers),
        "model_RMSE": rmse(e_model), "persist_RMSE": rmse(e_pers),
        "MAE_skill_vs_persist": 1 - mae(e_model) / mae(e_pers),
        "RMSE_skill_vs_persist": 1 - rmse(e_model) / rmse(e_pers),
        "paired_MAE_gain_mean": float(d.mean()),
        "paired_MAE_gain_CI95": [lo, hi],
        "direction_acc": float((np.sign(ret_for_dir[nz_dir]) == np.sign(res["y"][nz_dir])).mean()) if nz_dir.any() else float("nan"),
        "n_nonzero_moves": int(nz.sum()),
    }
    if "oracle_gasoil_ret" in res:
        e_or = (res["mgo_target"] - res["mgo_t"] * np.exp(res["oracle_gasoil_ret"])).to_numpy()
        out["oracle_gasoil_MAE"] = mae(e_or)   # ceiling: uses realised gasoil, NOT a forecast
    for b_col in ("sma5_price", "sma10_price", "ema10_price"):
        if b_col in res.columns:
            b_name = b_col.replace("_price", "")
            e_b = (res["mgo_target"] - res[b_col]).to_numpy()
            b_mae = mae(e_b)
            out[f"{b_name}_MAE"] = b_mae
            out[f"{b_name}_RMSE"] = rmse(e_b)
            out[f"MAE_skill_vs_{b_name}"] = float(1.0 - mae(e_model) / b_mae) if b_mae > 0 else float("nan")
    return out
