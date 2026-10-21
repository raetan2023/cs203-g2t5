import numpy as np
import pandas as pd
import pytest
from src import config


def make_long_csv(path, seed=0):
    rng = np.random.default_rng(seed)
    days = pd.bdate_range("2019-06-01", "2026-06-30")
    n = len(days)
    base = {"gasoil": 70, "brent": 65, "dubai": 63, "usd": 120}
    series = {k: v * np.exp(np.cumsum(rng.normal(0, 0.012, n))) for k, v in base.items()}
    names = {"gasoil": "sg_gasoil_investing", "brent": "brent_fred",
             "dubai": "dubai_crude_investing", "usd": "usd_index_fred"}
    rows = []
    for k, s in series.items():
        for d, x in zip(days, s):
            rows.append((d, "daily", names[k], float(x), "observed"))
    mgo_days = days[days >= "2020-03-01"]
    keep = np.where(mgo_days < "2024-06-01", rng.random(len(mgo_days)) < 0.15, True)
    g = pd.Series(series["gasoil"], index=days)
    for d in mgo_days[keep]:
        rows.append((d, "daily", "sg_mgo_themaritime", float(7.5 * g[d] * np.exp(rng.normal(0, 0.02))), "observed"))
    pd.DataFrame(rows, columns=["date", "frequency", "series", "value", "value_status"]).to_csv(path, index=False)


@pytest.fixture(autouse=True)
def fast_config(monkeypatch):
    """Small alpha grid for speed; a development/holdout split that fits the synthetic data."""
    monkeypatch.setattr(config, "ALPHAS", np.logspace(-1, 3, 5))
    monkeypatch.setattr(config, "DEV_END", "2025-06-30")


@pytest.fixture(scope="session")
def synthetic_csv(tmp_path_factory):
    path = tmp_path_factory.mktemp("data") / "market_observations.csv"
    make_long_csv(path)
    return path


@pytest.fixture(scope="session")
def wide(synthetic_csv):
    from src.data_loader import load_wide
    return load_wide(synthetic_csv)