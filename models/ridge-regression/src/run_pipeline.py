"""
End-to-end Pipeline Execution Script for 2.5 MGO Price Forecasting.
Executes data loading, feature engineering, walk-forward evaluation,
model fitting, visualization generation, and forecast inference.
"""

import sys
import json
from pathlib import Path
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import seaborn as sns
import numpy as np
import pandas as pd

# Ensure src directory is in sys.path when executed directly
current_dir = Path(__file__).resolve().parent
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

try:
    from .config import (
        FIGURES_DIR,
        SAVED_MODEL_PATH,
        SAVED_METADATA_PATH,
        EVALUATION_METRICS_PATH,
        LATEST_FORECAST_PATH
    )
    from .data_loader import get_market_data
    from .feature_engineering import (
        build_daily_market_features,
        align_mgo_targets_and_features
    )
    from .ridge_model import RidgeMGOForecaster
    from .evaluate import run_walk_forward_evaluation
    from .predict import generate_forecast, format_forecast_report
except ImportError:
    from config import (
        FIGURES_DIR,
        SAVED_MODEL_PATH,
        SAVED_METADATA_PATH,
        EVALUATION_METRICS_PATH,
        LATEST_FORECAST_PATH
    )
    from data_loader import get_market_data
    from feature_engineering import (
        build_daily_market_features,
        align_mgo_targets_and_features
    )
    from ridge_model import RidgeMGOForecaster
    from evaluate import run_walk_forward_evaluation
    from predict import generate_forecast, format_forecast_report


def generate_pipeline_visualizations(
    res_df: pd.DataFrame,
    forecaster: RidgeMGOForecaster,
    output_dir: Path = FIGURES_DIR
) -> None:
    """
    Generates high-resolution diagnostic and performance figures.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    sns.set_theme(style="whitegrid", palette="deep")
    plt.rcParams["font.family"] = "sans-serif"
    
    # 1. Actual vs Predicted Price Time Series
    plt.figure(figsize=(12, 6), dpi=150)
    plt.plot(res_df.index, res_df["actual_price"], label="Actual MGO Price", color="#1f77b4", linewidth=2.0)
    plt.plot(res_df.index, res_df["pred_ridge_price"], label="Ridge Regression Forecast", color="#d62728", linestyle="--", linewidth=1.8)
    plt.plot(res_df.index, res_df["pred_persist_price"], label="Persistence Baseline", color="#7f7f7f", linestyle=":", alpha=0.7)
    
    plt.title("Singapore Marine Gas Oil (MGO): Walk-Forward Out-of-Sample Predictions", fontsize=14, fontweight="bold", pad=12)
    plt.xlabel("Date", fontsize=11)
    plt.ylabel("Price (USD / Metric Tonne)", fontsize=11)
    plt.legend(frameon=True, facecolor="white", framealpha=0.9)
    plt.tight_layout()
    plt.savefig(output_dir / "actual_vs_predicted.png")
    plt.close()
    
    # 2. Prediction Interval Fan Chart
    plt.figure(figsize=(12, 6), dpi=150)
    plt.plot(res_df.index, res_df["actual_price"], label="Actual MGO", color="#1a252f", linewidth=1.8, marker="o", markersize=3, alpha=0.8)
    plt.plot(res_df.index, res_df["pred_ridge_price"], label="Point Forecast", color="#e74c3c", linewidth=1.5)
    
    plt.fill_between(res_df.index, res_df["lower_90"], res_df["upper_90"], color="#e74c3c", alpha=0.15, label="90% Prediction Interval")
    plt.fill_between(res_df.index, res_df["lower_80"], res_df["upper_80"], color="#e74c3c", alpha=0.25, label="80% Prediction Interval")
    
    plt.title("MGO Forecast Prediction Intervals & Realized Quotes (Walk-Forward)", fontsize=14, fontweight="bold", pad=12)
    plt.xlabel("Date", fontsize=11)
    plt.ylabel("Price (USD / Metric Tonne)", fontsize=11)
    plt.legend(loc="upper left", frameon=True, facecolor="white", framealpha=0.9)
    plt.tight_layout()
    plt.savefig(output_dir / "forecast_intervals.png")
    plt.close()
    
    # 3. Standardized Feature Coefficients
    coef_df = forecaster.get_feature_coefficients().head(12)
    plt.figure(figsize=(10, 6), dpi=150)
    colors = ["#2ecc71" if c > 0 else "#e74c3c" for c in coef_df["coefficient"]]
    
    sns.barplot(
        data=coef_df,
        y="feature",
        x="coefficient",
        palette=colors
    )
    plt.title("Top Standardized Ridge Regression Coefficients (L2 Regularized)", fontsize=14, fontweight="bold", pad=12)
    plt.xlabel("Standardized Coefficient (Sensitivity to Return)", fontsize=11)
    plt.ylabel("Market Indicator / Feature", fontsize=11)
    plt.axvline(0, color="#333333", linestyle="--", linewidth=0.8)
    plt.tight_layout()
    plt.savefig(output_dir / "feature_coefficients.png")
    plt.close()
    
    # 4. Residual Distribution
    resids = res_df["actual_price"] - res_df["pred_ridge_price"]
    plt.figure(figsize=(10, 5), dpi=150)
    sns.histplot(resids, kde=True, color="#3498db", bins=25, stat="density")
    plt.title(f"Out-of-Sample Residual Error Distribution (Mean={resids.mean():.2f}, Std={resids.std():.2f})", fontsize=13, fontweight="bold", pad=12)
    plt.xlabel("Forecast Error: Actual - Predicted ($/MT)", fontsize=11)
    plt.ylabel("Density", fontsize=11)
    plt.axvline(0, color="red", linestyle="--", linewidth=1.2, label="Zero Error")
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_dir / "residual_distribution.png")
    plt.close()


def run_full_pipeline() -> None:
    """
    Main driver executing full forecasting workflow.
    """
    print("=" * 65)
    print(" 2.5 MGO PRICE FORECASTING - RIDGE REGRESSION PIPELINE")
    print("=" * 65)
    
    # Step 1: Load and audit data
    print("\n[Step 1/5] Loading and auditing market observations...")
    pivoted_df, audit_info = get_market_data()
    print(f"  Loaded {audit_info['total_rows']} raw rows across {audit_info['total_series']} series.")
    print(f"  Target MGO observations: {audit_info['target_mgo_rows']} quotes ({audit_info['target_mgo_date_min']} to {audit_info['target_mgo_date_max']}).")
    
    # Step 2: Feature engineering
    print("\n[Step 2/5] Deriving point-in-time market features & aligning targets...")
    features_df = build_daily_market_features(pivoted_df)
    aligned_df, feature_cols = align_mgo_targets_and_features(pivoted_df, features_df)
    print(f"  Constructed {len(feature_cols)} predictor features.")
    print(f"  Aligned clean dataset: {len(aligned_df)} rows from {aligned_df.index.min().date()} to {aligned_df.index.max().date()}.")
    
    # Step 3: Walk-forward cross validation
    print("\n[Step 3/5] Executing expanding-window walk-forward cross validation...")
    val_df, eval_metrics = run_walk_forward_evaluation(aligned_df, feature_cols)
    print(f"  Walk-forward evaluated: {eval_metrics['total_evaluated_samples']} out-of-sample points.")
    print(f"  Ridge RMSE: ${eval_metrics['models']['ridge_regression']['rmse']:.2f}/MT (MAE: ${eval_metrics['models']['ridge_regression']['mae']:.2f}/MT, R2: {eval_metrics['models']['ridge_regression']['r2']:.4f})")
    print(f"  Baseline RMSE: ${eval_metrics['models']['persistence_baseline']['rmse']:.2f}/MT (MAE: ${eval_metrics['models']['persistence_baseline']['mae']:.2f}/MT)")
    print(f"  RMSE Error Reduction: {eval_metrics['error_reduction_vs_persistence']['rmse_reduction_pct']}%")
    print(f"  Directional Accuracy: {eval_metrics['directional_accuracy_pct']}%")
    print(f"  90% Prediction Interval Coverage: {eval_metrics['prediction_interval_coverage']['coverage_90pct']}%")
    
    # Step 4: Fit model on full dataset & save artifacts
    print("\n[Step 4/5] Training final production Ridge forecaster & serializing...")
    final_forecaster = RidgeMGOForecaster()
    final_forecaster.fit(
        aligned_df[feature_cols],
        aligned_df["mgo_return"],
        aligned_df["mgo_lag_price"],
        aligned_df["mgo_price"]
    )
    final_forecaster.save()
    print(f"  Optimal regularization parameter (alpha): {final_forecaster.optimal_alpha_:.4f}")
    print(f"  Model artifacts saved to: {SAVED_MODEL_PATH}")
    
    # Step 5: Visualizations & Inference
    print("\n[Step 5/5] Generating evaluation figures & latest forecast...")
    generate_pipeline_visualizations(val_df, final_forecaster)
    print(f"  Diagnostic plots saved to: {FIGURES_DIR}")
    
    latest_fc = generate_forecast(aligned_df, feature_cols, final_forecaster)
    report_text = format_forecast_report(latest_fc)
    print("\n" + report_text)
    print("\nPipeline execution completed successfully!")


if __name__ == "__main__":
    run_full_pipeline()
