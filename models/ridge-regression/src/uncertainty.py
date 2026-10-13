"""
Uncertainty Quantification, Directional Movement Classification,
and Prediction Interval Estimation for MGO Price Forecasting.
"""

from typing import Dict, Any, Tuple, Optional
import numpy as np
from scipy import stats

try:
    from .config import (
        DIRECTION_THRESHOLD_PCT,
        CONFIDENCE_LEVELS
    )
except ImportError:
    from config import (
        DIRECTION_THRESHOLD_PCT,
        CONFIDENCE_LEVELS
    )


def classify_direction(
    pred_return: float,
    threshold_pct: float = DIRECTION_THRESHOLD_PCT
) -> Tuple[str, str]:
    """
    Classifies the forecast into an expected directional movement:
    - UP (Bullish)
    - DOWN (Bearish)
    - FLAT (Neutral / Range-bound)
    """
    if pred_return > threshold_pct:
        direction = "UP"
        explanation = f"Forecast indicates upward price pressure (+{pred_return*100:.2f}%)."
    elif pred_return < -threshold_pct:
        direction = "DOWN"
        explanation = f"Forecast indicates downward price pressure ({pred_return*100:.2f}%)."
    else:
        direction = "FLAT"
        explanation = f"Forecast indicates range-bound movement within ±{threshold_pct*100:.1f}% ({pred_return*100:.2f}%)."
        
    return direction, explanation


def compute_directional_probabilities(
    pred_return: float,
    return_std: float
) -> Dict[str, float]:
    """
    Computes probabilities of UP vs DOWN movement using forecast distribution.
    """
    if return_std <= 0:
        return {"prob_up": 0.5, "prob_down": 0.5, "prob_flat": 0.0}
        
    # P(return > 0)
    prob_up = float(1.0 - stats.norm.cdf(0.0, loc=pred_return, scale=return_std))
    prob_down = float(stats.norm.cdf(0.0, loc=pred_return, scale=return_std))
    
    return {
        "prob_up": round(prob_up, 4),
        "prob_down": round(prob_down, 4),
        "prob_neutral_band": round(
            float(stats.norm.cdf(DIRECTION_THRESHOLD_PCT, loc=pred_return, scale=return_std) -
                  stats.norm.cdf(-DIRECTION_THRESHOLD_PCT, loc=pred_return, scale=return_std)), 4
        )
    }


def compute_prediction_intervals(
    point_forecast: float,
    residual_std: float,
    confidence_levels: Optional[Dict[int, float]] = None
) -> Dict[str, Dict[str, float]]:
    """
    Computes parametric prediction intervals [lower, upper] across confidence levels.
    """
    if confidence_levels is None:
        confidence_levels = CONFIDENCE_LEVELS
        
    intervals = {}
    for level, z_score in confidence_levels.items():
        margin = z_score * residual_std
        lower = max(0.0, point_forecast - margin)  # Fuel price cannot be negative
        upper = point_forecast + margin
        intervals[f"{level}%"] = {
            "lower": round(lower, 2),
            "upper": round(upper, 2),
            "margin_of_error": round(margin, 2),
            "range_width": round(upper - lower, 2)
        }
        
    return intervals


def compute_empirical_quantile_intervals(
    point_forecast: float,
    train_residuals: np.ndarray,
    levels: Tuple[int, ...] = (80, 90, 95)
) -> Dict[str, Dict[str, float]]:
    """
    Computes non-parametric empirical prediction intervals using historical residual quantiles.
    """
    intervals = {}
    for level in levels:
        alpha = (100 - level) / 2.0
        q_lower = float(np.percentile(train_residuals, alpha))
        q_upper = float(np.percentile(train_residuals, 100 - alpha))
        
        lower = max(0.0, point_forecast + q_lower)
        upper = point_forecast + q_upper
        intervals[f"{level}%_empirical"] = {
            "lower": round(lower, 2),
            "upper": round(upper, 2),
            "range_width": round(upper - lower, 2)
        }
        
    return intervals


def compute_uncertainty_score(
    residual_std: float,
    point_forecast: float,
    days_since_anchor: int,
    market_volatility_pct: float = 0.02
) -> Dict[str, Any]:
    """
    Calculates a composite Uncertainty Index (0 to 100) and Confidence Rating.
    
    Factors considered:
    1. Residual Uncertainty: Relative spread of error margin (residual_std / point_forecast).
    2. Anchor Staleness: Days elapsed since the last observed MGO quote (older quotes carry proxy drift).
    3. Market Indicator Volatility: Current 20-day rolling volatility in energy markets.
    """
    # 1. Base model error component (typically 2% to 6% of price)
    rel_error = residual_std / max(1.0, point_forecast)
    err_score = min(50.0, rel_error * 1000.0)  # 5% rel error -> ~50 pts
    
    # 2. Staleness penalty (1 day = 0, 7 days = +10, 30 days = +30)
    staleness_score = min(35.0, max(0.0, (days_since_anchor - 1) * 1.5))
    
    # 3. Volatility component
    vol_score = min(15.0, market_volatility_pct * 500.0)
    
    uncertainty_score = round(min(100.0, max(5.0, err_score + staleness_score + vol_score)), 1)
    confidence_score = round(100.0 - uncertainty_score, 1)
    
    if confidence_score >= 75.0:
        confidence_tier = "HIGH"
        guidance = "Market indicators and fresh MGO anchor provide strong directional signal."
    elif confidence_score >= 50.0:
        confidence_tier = "MODERATE"
        guidance = "Moderate uncertainty due to market volatility or multi-day anchor gap."
    else:
        confidence_tier = "LOW"
        guidance = "High uncertainty. Recent physical quote anchor is stale; treat forecast as experimental proxy."
        
    return {
        "uncertainty_score": uncertainty_score,
        "confidence_score": confidence_score,
        "confidence_tier": confidence_tier,
        "days_since_anchor": days_since_anchor,
        "guidance": guidance,
        "components": {
            "model_error_component": round(err_score, 1),
            "anchor_staleness_component": round(staleness_score, 1),
            "volatility_component": round(vol_score, 1)
        }
    }
