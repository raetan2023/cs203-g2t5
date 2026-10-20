"""
Configuration and constants for 2.5 MGO Price Forecasting Ridge Regression pipeline.
"""

from pathlib import Path
import numpy as np

# Base paths
SRC_DIR = Path(__file__).resolve().parent
MODULE_DIR = SRC_DIR.parent
DATA_DIR = MODULE_DIR / "data"
MODELS_DIR = MODULE_DIR / "models"
REPORTS_DIR = MODULE_DIR / "reports"
FIGURES_DIR = REPORTS_DIR / "figures"
NOTEBOOKS_DIR = MODULE_DIR / "notebooks"

# Data file candidates (checks local module root, data dir, or workspace root)
MARKET_DATA_FILENAME = "market_observations.csv"
GDELT_SCORES_FILENAME = "gdelt_daily_scores.csv"

# Target configuration
TARGET_SERIES = "sg_mgo_themaritime"  # Port-of-Singapore bunker indication (USD/metric tonne)
TARGET_UNIT = "USD/metric tonne"

# Continuous market indicators (daily financial series)
MARKET_INDICATORS = [
    "sg_gasoil_investing",      # NYMEX Singapore Gasoil futures closing price (USD/barrel)
    "brent_fred",               # EIA Brent-Europe crude spot benchmark (USD/barrel)
    "dubai_crude_investing",    # Dubai crude futures closing price (USD/barrel)
    "usd_index_fred"            # Federal Reserve broad nominal trade-weighted USD index
]

# Bunker comparison series (USD/metric tonne)
BUNKER_INDICATORS = [
    "sg_vlsfo_themaritime",     # Very Low Sulphur Fuel Oil 0.5% (USD/metric tonne)
    "sg_hsfo_themaritime"       # High Sulphur Fuel Oil 3.5% (USD/metric tonne)
]

# Point-in-time alignment parameters
MAX_STALENESS_DAYS = 5          # Maximum forward fill days for financial trading indicators (covers weekends/holidays)
MOMENTUM_WINDOWS = [1, 5, 20]   # Return calculation lookback windows (days)
VOLATILITY_WINDOW = 20          # Rolling standard deviation lookback window (days)

# Ridge model hyperparameters
DEFAULT_ALPHAS = np.logspace(-3, 4, 35)  # Alpha regularization grid for RidgeCV
CV_FOLDS = None                          # None enables efficient analytic Generalized Cross-Validation (GCV)

# Walk-forward evaluation parameters
INITIAL_TRAIN_SIZE = 50         # Minimum training observations before starting walk-forward evaluation

# Directional classification
# Threshold in percentage change for declaring UP vs DOWN vs FLAT
DIRECTION_THRESHOLD_PCT = 0.003  # 0.3% movement (~$2.70 - $3.00/MT)

# Prediction interval confidence levels (Z-scores for standard normal)
CONFIDENCE_LEVELS = {
    80: 1.282,
    90: 1.645,
    95: 1.960
}

# Artifact file paths
SAVED_MODEL_PATH = MODELS_DIR / "ridge_mgo_pipeline.joblib"
SAVED_METADATA_PATH = MODELS_DIR / "model_metadata.json"
EVALUATION_METRICS_PATH = REPORTS_DIR / "evaluation_metrics.json"
LATEST_FORECAST_PATH = REPORTS_DIR / "latest_forecast.json"
PROCESSED_DATA_PATH = DATA_DIR / "processed" / "mgo_aligned_features.csv"
