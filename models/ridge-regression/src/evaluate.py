"""
Evaluation module implementing expanding-window walk-forward validation
and benchmark comparison against Persistence and Gasoil baselines.
"""

from typing import Dict, Any, List, Tuple, Optional
import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

try:
    from .config import (
        INITIAL_TRAIN_SIZE,
        DEFAULT_ALPHAS,
        DIRECTION_THRESHOLD_PCT,
        EVALUATION_METRICS_PATH,
        TARGET_UNIT
    )
    from .ridge_model import RidgeMGOForecaster
    from .uncertainty import (
        classify_direction,
        compute_prediction_intervals
    )
except ImportError:
    from config import (
        INITIAL_TRAIN_SIZE,
        DEFAULT_ALPHAS,
        DIRECTION_THRESHOLD_PCT,
        EVALUATION_METRICS_PATH,
        TARGET_UNIT
    )
    from ridge_model import RidgeMGOForecaster
    from uncertainty import (
        classify_direction,
        compute_prediction_intervals
    )


def run_walk_forward_evaluation(
    aligned_df: pd.DataFrame,
    feature_cols: List[str],
    min_train: int = INITIAL_TRAIN_SIZE,
    alphas: np.ndarray = DEFAULT_ALPHAS,
    save_path: Optional[Path] = EVALUATION_METRICS_PATH
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Executes expanding-window out-of-sample evaluation across chronological MGO observations.
    Benchmarks Ridge against Persistence and Gasoil Transfer baselines.
    """
    if len(aligned_df) <= min_train:
        raise ValueError(
            f"Dataset size ({len(aligned_df)}) must exceed initial training window ({min_train})."
        )
        
    records = []
    
    for i in range(min_train, len(aligned_df)):
        train = aligned_df.iloc[:i]
        test = aligned_df.iloc[i:i+1]
        
        X_train = train[feature_cols]
        y_train_ret = train["mgo_return"]
        lag_train_price = train["mgo_lag_price"]
        actual_train_price = train["mgo_price"]
        
        X_test = test[feature_cols]
        y_test_price = float(test["mgo_price"].values[0])
        y_test_ret = float(test["mgo_return"].values[0])
        lag_price = float(test["mgo_lag_price"].values[0])
        gasoil_ret_int = float(test["gasoil_return_interval"].values[0])
        test_date = test.index[0]
        
        # 1. Fit Ridge forecaster on historical fold
        forecaster = RidgeMGOForecaster(alphas=alphas)
        forecaster.fit(X_train, y_train_ret, lag_train_price, actual_train_price)
        
        pred_ret_ridge = float(forecaster.predict_return(X_test)[0])
        pred_price_ridge = float(lag_price * (1.0 + pred_ret_ridge))
        
        # 2. Persistence baseline: tomorrow's price is today's price (r = 0)
        pred_price_persist = lag_price
        pred_ret_persist = 0.0
        
        # 3. Gasoil direct transfer baseline: percentage movement transferred 1:1
        pred_price_gasoil = float(lag_price * (1.0 + gasoil_ret_int))
        pred_ret_gasoil = gasoil_ret_int
        
        # Prediction intervals based on training residual standard error
        resid_std = forecaster.residual_std_price_
        intervals = compute_prediction_intervals(pred_price_ridge, resid_std)
        
        # Direction classification
        pred_dir, _ = classify_direction(pred_ret_ridge, DIRECTION_THRESHOLD_PCT)
        actual_dir, _ = classify_direction(y_test_ret, DIRECTION_THRESHOLD_PCT)
        
        records.append({
            "date": test_date,
            "actual_price": y_test_price,
            "actual_return": y_test_ret,
            "anchor_price": lag_price,
            "pred_ridge_price": pred_price_ridge,
            "pred_ridge_return": pred_ret_ridge,
            "pred_persist_price": pred_price_persist,
            "pred_gasoil_price": pred_price_gasoil,
            "pred_direction": pred_dir,
            "actual_direction": actual_dir,
            "direction_match": bool(pred_dir == actual_dir),
            "resid_std": resid_std,
            "lower_80": intervals["80%"]["lower"],
            "upper_80": intervals["80%"]["upper"],
            "lower_90": intervals["90%"]["lower"],
            "upper_90": intervals["90%"]["upper"],
            "lower_95": intervals["95%"]["lower"],
            "upper_95": intervals["95%"]["upper"],
            "in_80": bool(intervals["80%"]["lower"] <= y_test_price <= intervals["80%"]["upper"]),
            "in_90": bool(intervals["90%"]["lower"] <= y_test_price <= intervals["90%"]["upper"]),
            "in_95": bool(intervals["95%"]["lower"] <= y_test_price <= intervals["95%"]["upper"]),
            "optimal_alpha": forecaster.optimal_alpha_
        })
        
    res_df = pd.DataFrame(records).set_index("date")
    
    # Calculate aggregate benchmark metrics
    actual_p = res_df["actual_price"].values
    pred_ridge_p = res_df["pred_ridge_price"].values
    pred_persist_p = res_df["pred_persist_price"].values
    pred_gasoil_p = res_df["pred_gasoil_price"].values
    
    def calc_metrics(actual, pred):
        mae = float(mean_absolute_error(actual, pred))
        rmse = float(np.sqrt(mean_squared_error(actual, pred)))
        r2 = float(r2_score(actual, pred))
        mape = float(np.mean(np.abs((actual - pred) / actual)) * 100.0)
        return {
            "mae": round(mae, 2),
            "rmse": round(rmse, 2),
            "r2": round(r2, 4),
            "mape_pct": round(mape, 2)
        }
        
    metrics_summary = {
        "evaluation_type": "Expanding-Window Walk-Forward Cross Validation",
        "total_evaluated_samples": len(res_df),
        "start_evaluation_date": res_df.index.min().strftime("%Y-%m-%d"),
        "end_evaluation_date": res_df.index.max().strftime("%Y-%m-%d"),
        "target_unit": TARGET_UNIT,
        "models": {
            "ridge_regression": calc_metrics(actual_p, pred_ridge_p),
            "persistence_baseline": calc_metrics(actual_p, pred_persist_p),
            "gasoil_transfer_baseline": calc_metrics(actual_p, pred_gasoil_p)
        },
        "directional_accuracy_pct": round(res_df["direction_match"].mean() * 100.0, 2),
        "prediction_interval_coverage": {
            "coverage_80pct": round(res_df["in_80"].mean() * 100.0, 2),
            "coverage_90pct": round(res_df["in_90"].mean() * 100.0, 2),
            "coverage_95pct": round(res_df["in_95"].mean() * 100.0, 2),
            "mean_width_80pct": round(float((res_df["upper_80"] - res_df["lower_80"]).mean()), 2),
            "mean_width_90pct": round(float((res_df["upper_90"] - res_df["lower_90"]).mean()), 2),
            "mean_width_95pct": round(float((res_df["upper_95"] - res_df["lower_95"]).mean()), 2)
        },
        "error_reduction_vs_persistence": {
            "rmse_reduction_pct": round(
                ((calc_metrics(actual_p, pred_persist_p)["rmse"] - calc_metrics(actual_p, pred_ridge_p)["rmse"]) /
                 calc_metrics(actual_p, pred_persist_p)["rmse"]) * 100.0, 2
            ),
            "mae_reduction_pct": round(
                ((calc_metrics(actual_p, pred_persist_p)["mae"] - calc_metrics(actual_p, pred_ridge_p)["mae"]) /
                 calc_metrics(actual_p, pred_persist_p)["mae"]) * 100.0, 2
            )
        }
    }
    
    if save_path:
        save_path.parent.mkdir(parents=True, exist_ok=True)
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(metrics_summary, f, indent=2)
            
    return res_df, metrics_summary
