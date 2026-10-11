"""
Inference module for producing near-term MGO price forecasts, expected direction,
prediction intervals, and uncertainty ratings.
"""

from typing import Dict, Any, Optional
import json
from pathlib import Path
import pandas as pd
import numpy as np

try:
    from .config import (
        SAVED_MODEL_PATH,
        LATEST_FORECAST_PATH,
        TARGET_UNIT,
        DIRECTION_THRESHOLD_PCT
    )
    from .ridge_model import RidgeMGOForecaster
    from .uncertainty import (
        classify_direction,
        compute_directional_probabilities,
        compute_prediction_intervals,
        compute_uncertainty_score
    )
except ImportError:
    from config import (
        SAVED_MODEL_PATH,
        LATEST_FORECAST_PATH,
        TARGET_UNIT,
        DIRECTION_THRESHOLD_PCT
    )
    from ridge_model import RidgeMGOForecaster
    from uncertainty import (
        classify_direction,
        compute_directional_probabilities,
        compute_prediction_intervals,
        compute_uncertainty_score
    )


def generate_forecast(
    aligned_df: pd.DataFrame,
    feature_cols: list,
    forecaster: Optional[RidgeMGOForecaster] = None,
    as_of_date: Optional[str] = None,
    save_path: Optional[Path] = LATEST_FORECAST_PATH
) -> Dict[str, Any]:
    """
    Generates a near-term MGO price forecast with direction, range, and uncertainty info.
    """
    if forecaster is None:
        forecaster = RidgeMGOForecaster.load(SAVED_MODEL_PATH)
        
    if as_of_date is not None:
        target_ts = pd.to_datetime(as_of_date)
        if target_ts not in aligned_df.index:
            # Pick latest date on or before target_ts
            valid_dates = aligned_df.index[aligned_df.index <= target_ts]
            if len(valid_dates) == 0:
                raise ValueError(f"No observations available on or before {as_of_date}.")
            scenario_row = aligned_df.loc[valid_dates[-1]:valid_dates[-1]]
        else:
            scenario_row = aligned_df.loc[target_ts:target_ts]
    else:
        # Default to latest row in aligned dataset
        scenario_row = aligned_df.iloc[-1:]
        
    date_val = scenario_row.index[0]
    X_sample = scenario_row[feature_cols]
    anchor_price = float(scenario_row["mgo_lag_price"].values[0])
    actual_price = float(scenario_row["mgo_price"].values[0]) if "mgo_price" in scenario_row.columns else None
    days_since_anchor = int(scenario_row["days_since_prev_quote"].values[0])
    
    # 1. Model inference
    pred_return = float(forecaster.predict_return(X_sample)[0])
    point_forecast = float(anchor_price * (1.0 + pred_return))
    delta_forecast = float(point_forecast - anchor_price)
    
    # 2. Expected direction and probability
    direction, dir_explanation = classify_direction(pred_return, DIRECTION_THRESHOLD_PCT)
    dir_probs = compute_directional_probabilities(pred_return, forecaster.residual_std_return_)
    
    # 3. Forecast range / prediction intervals
    intervals = compute_prediction_intervals(point_forecast, forecaster.residual_std_price_)
    
    # 4. Uncertainty & confidence scoring
    # Extract rolling volatility if present
    vol_col = "sg_gasoil_investing_vol20"
    mkt_vol = float(scenario_row[vol_col].values[0]) if vol_col in scenario_row.columns else 0.02
    uncertainty_info = compute_uncertainty_score(
        residual_std=forecaster.residual_std_price_,
        point_forecast=point_forecast,
        days_since_anchor=days_since_anchor,
        market_volatility_pct=mkt_vol
    )
    
    # 5. Top contributing drivers for this specific prediction
    X_scaled = forecaster.scaler.transform(X_sample[forecaster.feature_names_])[0]
    contributions = X_scaled * forecaster.model.coef_
    contrib_df = pd.DataFrame({
        "feature": forecaster.feature_names_,
        "contribution": contributions
    }).sort_values(by="contribution", key=abs, ascending=False)
    top_drivers = contrib_df.head(5).to_dict(orient="records")
    
    forecast_output = {
        "forecast_origin_date": date_val.strftime("%Y-%m-%d"),
        "target_commodity": "Singapore Marine Gas Oil (MGO)",
        "unit": TARGET_UNIT,
        "anchor_reference": {
            "anchor_price": round(anchor_price, 2),
            "days_since_anchor": days_since_anchor,
            "anchor_freshness": "Fresh (<3 days)" if days_since_anchor <= 3 else f"Lagged ({days_since_anchor} days)"
        },
        "forecast": {
            "point_estimate_price": round(point_forecast, 2),
            "expected_price_change": round(delta_forecast, 2),
            "expected_return_pct": round(pred_return * 100.0, 2),
            "expected_direction": direction,
            "direction_rationale": dir_explanation,
            "directional_probabilities": dir_probs
        },
        "prediction_intervals": intervals,
        "confidence_and_uncertainty": uncertainty_info,
        "model_provenance": {
            "algorithm": "Ridge Regression (L2 Regularized)",
            "optimal_alpha": forecaster.optimal_alpha_,
            "residual_std_price": round(forecaster.residual_std_price_, 2),
            "top_drivers": top_drivers
        },
        "benchmark_context": {
            "persistence_baseline_price": round(anchor_price, 2),
            "actual_realized_price": round(actual_price, 2) if actual_price is not None else None
        }
    }
    
    if save_path:
        save_path.parent.mkdir(parents=True, exist_ok=True)
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(forecast_output, f, indent=2)
            
    return forecast_output


def format_forecast_report(fc: Dict[str, Any]) -> str:
    """
    Renders human-readable forecast card for bunker procurement officers.
    """
    p = fc["forecast"]
    ci = fc["confidence_and_uncertainty"]
    rng80 = fc["prediction_intervals"]["80%"]
    rng90 = fc["prediction_intervals"]["90%"]
    
    lines = [
        "=" * 65,
        "        SINGAPORE MGO PRICE FORECAST (ADVISORY)",
        "=" * 65,
        f"As-of Date:       {fc['forecast_origin_date']}",
        f"Target Commodity: {fc['target_commodity']} ({fc['unit']})",
        f"Anchor Price:     ${fc['anchor_reference']['anchor_price']:.2f} (Age: {fc['anchor_reference']['days_since_anchor']} days)",
        "-" * 65,
        f"EXPECTED DIRECTION:  [{p['expected_direction']}] ({p['expected_return_pct']:+.2f}%)",
        f"Point Estimate:      ${p['point_estimate_price']:.2f}/MT (${p['expected_price_change']:+.2f}/MT change)",
        f"Direction Prob:      P(UP) = {p['directional_probabilities']['prob_up']*100:.1f}% | P(DOWN) = {p['directional_probabilities']['prob_down']*100:.1f}%",
        "-" * 65,
        "FORECAST RANGES (PREDICTION INTERVALS):",
        f"  80% Confidence:    ${rng80['lower']:.2f} - ${rng80['upper']:.2f}/MT  (±${rng80['margin_of_error']:.2f})",
        f"  90% Confidence:    ${rng90['lower']:.2f} - ${rng90['upper']:.2f}/MT  (±${rng90['margin_of_error']:.2f})",
        "-" * 65,
        f"CONFIDENCE RATING:   {ci['confidence_tier']} ({ci['confidence_score']}/100)",
        f"Uncertainty Score:   {ci['uncertainty_score']}/100",
        f"Advisory Guidance:   {ci['guidance']}",
        "=" * 65
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    from pathlib import Path
    
    # Bootstrap imports
    curr_dir = Path(__file__).resolve().parent
    if str(curr_dir) not in sys.path:
        sys.path.insert(0, str(curr_dir))
        
    try:
        from data_loader import get_market_data
        from feature_engineering import build_daily_market_features, align_mgo_targets_and_features
    except ImportError:
        from .data_loader import get_market_data
        from .feature_engineering import build_daily_market_features, align_mgo_targets_and_features

    print("Loading latest market data & generating forecast...")
    pivoted_df, _ = get_market_data()
    features_df = build_daily_market_features(pivoted_df)
    aligned_df, feature_cols = align_mgo_targets_and_features(pivoted_df, features_df, save_processed=False)
    
    fc = generate_forecast(aligned_df, feature_cols)
    print("\n" + format_forecast_report(fc))

