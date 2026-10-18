"""Return the same wide price table whatever the source.
Training reads the CSV; serving can read Supabase through the same interface."""
import pandas as pd
from .config import NAMES, OBS_CSV


def load_wide(path=None) -> pd.DataFrame:
    obs = pd.read_csv(path or OBS_CSV, parse_dates=["date"])
    obs = obs[(obs["value_status"] == "observed") & obs["series"].isin(NAMES.values())]
    if obs.duplicated(["date", "series"]).any():
        raise ValueError("Duplicate (date, series) rows; resolve before training.")
    inverse = {v: k for k, v in NAMES.items()}
    wide = obs.pivot(index="date", columns="series", values="value").rename(columns=inverse).sort_index()
    missing = set(NAMES) - set(wide.columns)
    if missing:
        raise ValueError(f"Series missing from data: {sorted(missing)}")
    return wide


def load_wide_supabase(*args, **kwargs):  # pragma: no cover
    raise NotImplementedError("Implement with the Supabase client; must return the same shape as load_wide().")
