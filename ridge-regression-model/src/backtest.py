"""Expanding-window walk-forward with overlap purge. Also stores the drift baseline
(the mean return of the training rows), so Ridge is compared with 'just assume the average move'."""
import pandas as pd
from .config import MIN_TRAIN
from .feature_engineering import FEATURES
from .model import make_model


def walk_forward(table: pd.DataFrame, features=None, min_train: int = MIN_TRAIN) -> pd.DataFrame:
    features = features or FEATURES
    rows, preds, alphas, drift = [], [], [], []
    for i in range(min_train, len(table)):
        test = table.iloc[i]
        train = table.iloc[:i]
        train = train[train["target_date"] < test["origin"]]   # purge: label must be known at origin
        if len(train) < min_train // 2:
            continue
        m = make_model().fit(train[features], train["y"])
        preds.append(float(m.predict(table.iloc[[i]][features])[0]))
        alphas.append(float(m[-1].alpha_))
        drift.append(float(train["y"].mean()))
        rows.append(i)
    res = table.iloc[rows].copy()
    res["pred_ret"] = preds
    res["alpha"] = alphas
    res["drift_ret"] = drift
    return res.reset_index(drop=True)