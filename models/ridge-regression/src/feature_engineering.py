"""
Feature Engineering module for point-in-time market alignment, indicator derivation,
and target pairing for Singapore Marine Gas Oil (MGO) forecasting.
"""

from typing import List, Tuple, Optional
import pandas as pd
import numpy as np

try:
    from .config import (
        TARGET_SERIES,
        MARKET_INDICATORS,
        BUNKER_INDICATORS,
        MAX_STALENESS_DAYS,
        MOMENTUM_WINDOWS,
        VOLATILITY_WINDOW,
        PROCESSED_DATA_PATH
    )
except ImportError:
    from config import (
        TARGET_SERIES,
        MARKET_INDICATORS,
        BUNKER_INDICATORS,
        MAX_STALENESS_DAYS,
        MOMENTUM_WINDOWS,
        VOLATILITY_WINDOW,
        PROCESSED_DATA_PATH
    )


def build_daily_market_features(
    pivoted_df: pd.DataFrame,
    max_staleness: int = MAX_STALENESS_DAYS,
    momentum_windows: List[int] = MOMENTUM_WINDOWS,
    vol_window: int = VOLATILITY_WINDOW
) -> pd.DataFrame:
    """
    Constructs point-in-time daily market features from continuous indicators.
    Enforces strict t-1 lagging to prevent lookahead bias (historical availability).
    
    Forward-fill is restricted to max_staleness days to cover weekends/holidays
    without propagating stale quotes indefinitely.
    """
    # Create contiguous daily calendar
    daily_idx = pd.date_range(pivoted_df.index.min(), pivoted_df.index.max(), freq="D")
    
    # 1. Continuous market indicators (Gasoil, Brent, Dubai, USD index)
    available_market_inds = [col for col in MARKET_INDICATORS if col in pivoted_df.columns]
    df_market = pivoted_df[available_market_inds].reindex(daily_idx).ffill(limit=max_staleness)
    
    # Strictly lag by 1 day: market close at date t-1 is the latest known as-of morning of date t
    market_lagged = df_market.shift(1)
    
    features = pd.DataFrame(index=daily_idx)
    
    # Levels, momentum, and rolling volatility
    for col in available_market_inds:
        # Price level (as of t-1)
        features[f"{col}_lag1"] = market_lagged[col]
        
        # Returns / momentum
        for window in momentum_windows:
            features[f"{col}_ret{window}"] = market_lagged[col].pct_change(window)
            
        # Rolling volatility
        features[f"{col}_vol{vol_window}"] = market_lagged[col].pct_change(1).rolling(vol_window).std()
        
    # Economic spreads
    if "sg_gasoil_investing_lag1" in features.columns and "brent_fred_lag1" in features.columns:
        features["crack_gasoil_brent_lag1"] = (
            features["sg_gasoil_investing_lag1"] - features["brent_fred_lag1"]
        )
        
    if "brent_fred_lag1" in features.columns and "dubai_crude_investing_lag1" in features.columns:
        features["spread_brent_dubai_lag1"] = (
            features["brent_fred_lag1"] - features["dubai_crude_investing_lag1"]
        )
        
    # 2. Bunker indication signals (VLSFO, HSFO) - forward filled as-of indications
    available_bunkers = [col for col in BUNKER_INDICATORS if col in pivoted_df.columns]
    if available_bunkers:
        df_bunkers = pivoted_df[available_bunkers].reindex(daily_idx).ffill()
        bunkers_lagged = df_bunkers.shift(1)
        
        for b_col in available_bunkers:
            clean_name = b_col.replace("sg_", "").replace("_themaritime", "")
            features[f"{clean_name}_lag1"] = bunkers_lagged[b_col]
            
        if "vlsfo_lag1" in features.columns and "hsfo_lag1" in features.columns:
            features["vlsfo_hsfo_spread_lag1"] = features["vlsfo_lag1"] - features["hsfo_lag1"]
            
    return features


def align_mgo_targets_and_features(
    pivoted_df: pd.DataFrame,
    features_df: pd.DataFrame,
    target_series: str = TARGET_SERIES,
    save_processed: bool = True
) -> Tuple[pd.DataFrame, List[str]]:
    """
    Pairs observed MGO quotes with lagged market indicators.
    Computes MGO return, price delta, anchor staleness, and benchmark Gasoil interval returns.
    """
    if target_series not in pivoted_df.columns:
        raise KeyError(f"Target series '{target_series}' not found in pivoted DataFrame.")
        
    mgo = pivoted_df[target_series].dropna().sort_index()
    if len(mgo) < 2:
        raise ValueError("Insufficient MGO observations to construct target movements.")
        
    mgo_df = pd.DataFrame({"mgo_price": mgo})
    mgo_df["mgo_lag_price"] = mgo_df["mgo_price"].shift(1)
    
    # Days elapsed since previous quote (anchor age / staleness)
    mgo_dates = mgo_df.index.to_series()
    mgo_df["days_since_prev_quote"] = (mgo_dates - mgo_dates.shift(1)).dt.days
    
    # Movement targets
    mgo_df["mgo_return"] = (mgo_df["mgo_price"] - mgo_df["mgo_lag_price"]) / mgo_df["mgo_lag_price"]
    mgo_df["mgo_delta"] = mgo_df["mgo_price"] - mgo_df["mgo_lag_price"]
    
    # Gasoil proxy return over the exact same interval between MGO quotes
    if "sg_gasoil_investing_lag1" in features_df.columns:
        gasoil_asof = features_df["sg_gasoil_investing_lag1"]
        gasoil_at_mgo = gasoil_asof.loc[mgo_df.index]
        mgo_df["gasoil_prev_mgo"] = gasoil_at_mgo.shift(1)
        mgo_df["gasoil_return_interval"] = (
            (gasoil_at_mgo - mgo_df["gasoil_prev_mgo"]) / mgo_df["gasoil_prev_mgo"]
        )
        
    # Join target and engineered market features
    aligned = mgo_df.join(features_df, how="inner").dropna()
    
    # Exclude metadata and non-predictor columns from feature set
    non_feature_cols = [
        "mgo_price",
        "mgo_lag_price",
        "mgo_return",
        "mgo_delta",
        "gasoil_prev_mgo"
    ]
    feature_cols = [col for col in aligned.columns if col not in non_feature_cols]
    
    if save_processed:
        PROCESSED_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        aligned.to_csv(PROCESSED_DATA_PATH, index=True)
        
    return aligned, feature_cols
