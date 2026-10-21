"""Optional shrinkage of the predicted return: pred_ret = gamma * raw_pred.
gamma is chosen ONLY on development rows (origin and label both before DEV_END),
so the holdout rows never influence it."""
import numpy as np
import pandas as pd
from . import config


def choose_gamma(wf: pd.DataFrame, dev_end=None, min_rows: int = 20) -> float:
    cut = pd.Timestamp(dev_end or config.DEV_END)
    dev = wf[(wf["origin"] < cut) & (wf["target_date"] < cut)]
    if len(dev) < min_rows:
        return 0.0      # too little evidence to trust the model: fall back to 'no change'
    a, y, r = dev["mgo_t"].to_numpy(), dev["mgo_target"].to_numpy(), dev["pred_ret"].to_numpy()
    # ties go to the smaller gamma (the more conservative choice)
    return float(min(config.GAMMAS, key=lambda g: np.mean(np.abs(y - a * np.exp(g * r)))))


def apply_gamma(wf: pd.DataFrame, gamma: float) -> pd.DataFrame:
    wf = wf.copy()
    wf["pred_ret_raw"] = wf["pred_ret"]
    wf["pred_ret"] = wf["pred_ret_raw"] * gamma
    wf["gamma"] = gamma
    return wf