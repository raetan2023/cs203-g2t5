"""
Data Loader module for loading, verifying, and pivoting market observations.
"""

from pathlib import Path
from typing import Optional, Tuple, Dict, Any
import pandas as pd
import numpy as np

try:
    from .config import (
        MODULE_DIR,
        DATA_DIR,
        MARKET_DATA_FILENAME,
        TARGET_SERIES,
        MARKET_INDICATORS,
        BUNKER_INDICATORS
    )
except ImportError:
    from config import (
        MODULE_DIR,
        DATA_DIR,
        MARKET_DATA_FILENAME,
        TARGET_SERIES,
        MARKET_INDICATORS,
        BUNKER_INDICATORS
    )


def find_market_data_file(custom_path: Optional[str] = None) -> Path:
    """
    Locates market_observations.csv across common candidate paths.
    """
    if custom_path:
        p = Path(custom_path)
        if p.exists():
            return p
        raise FileNotFoundError(f"Provided market data path does not exist: {custom_path}")

    candidates = [
        MODULE_DIR / MARKET_DATA_FILENAME,
        DATA_DIR / "raw" / MARKET_DATA_FILENAME,
        DATA_DIR / MARKET_DATA_FILENAME,
        MODULE_DIR.parent.parent / MARKET_DATA_FILENAME,
        Path.cwd() / "models" / "ridge-regression" / MARKET_DATA_FILENAME,
        Path.cwd() / MARKET_DATA_FILENAME
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise FileNotFoundError(
        f"Could not locate {MARKET_DATA_FILENAME}. Looked in: {[str(c) for c in candidates]}"
    )


def load_raw_market_observations(filepath: Optional[str] = None) -> pd.DataFrame:
    """
    Loads raw market observations CSV with schema typing.
    """
    path = find_market_data_file(filepath)
    df = pd.read_csv(
        path,
        parse_dates=["date"],
        dtype={
            "frequency": "category",
            "series": "str",
            "value": "float64",
            "value_status": "category",
            "source_file": "str",
            "quote_source": "str",
            "open": "float64",
            "high": "float64",
            "low": "float64",
            "volume": "float64",
            "change_pct": "float64"
        }
    )
    return df


def audit_market_data(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Performs integrity and coverage audit on loaded market observations.
    """
    all_series = df["series"].unique().tolist()
    mgo_rows = df[df["series"] == TARGET_SERIES]
    
    audit_results = {
        "total_rows": len(df),
        "total_series": len(all_series),
        "date_min": df["date"].min().strftime("%Y-%m-%d"),
        "date_max": df["date"].max().strftime("%Y-%m-%d"),
        "target_mgo_rows": len(mgo_rows),
        "target_mgo_date_min": mgo_rows["date"].min().strftime("%Y-%m-%d") if len(mgo_rows) else None,
        "target_mgo_date_max": mgo_rows["date"].max().strftime("%Y-%m-%d") if len(mgo_rows) else None,
        "target_mgo_min_price": float(mgo_rows["value"].min()) if len(mgo_rows) else None,
        "target_mgo_max_price": float(mgo_rows["value"].max()) if len(mgo_rows) else None,
        "target_mgo_mean_price": float(mgo_rows["value"].mean()) if len(mgo_rows) else None,
        "series_counts": df["series"].value_counts().to_dict()
    }
    return audit_results


def pivot_market_series(df: pd.DataFrame) -> pd.DataFrame:
    """
    Pivots long-format market observations into wide (date x series) DataFrame.
    """
    pivoted = df.pivot(index="date", columns="series", values="value")
    pivoted.index = pd.to_datetime(pivoted.index)
    pivoted = pivoted.sort_index()
    return pivoted


def get_market_data(filepath: Optional[str] = None) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    High-level loader returning pivoted dataframe and audit summary.
    """
    raw_df = load_raw_market_observations(filepath)
    audit = audit_market_data(raw_df)
    pivoted = pivot_market_series(raw_df)
    return pivoted, audit
