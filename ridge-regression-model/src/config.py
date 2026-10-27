"""Single source of truth for series names, lags, horizons and paths."""
import os
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("MGO_DATA_DIR", ROOT / "data"))
OBS_CSV = DATA_DIR / "market_observations.csv"
ARTIFACTS = ROOT / "artifacts"
REPORTS = ROOT / "reports"

# short name -> series key in market_observations.csv
NAMES = {
    "mgo": "sg_mgo_themaritime",        # USD/tonne, target
    "gasoil": "sg_gasoil_investing",    # USD/barrel
    "brent": "brent_fred",              # USD/barrel
    "dubai": "dubai_crude_investing",   # USD/barrel
    "usd": "usd_index_fred",            # index points
}
INPUTS = ["gasoil", "brent", "dubai", "usd"]

# Days each input is delayed before the model may use it.
# Investing.com series: 1 day. FRED series have no availability timestamp,
# so these lags are ASSUMPTIONS (brent 3, usd 5) and should be tested.
LAG_DAYS = {"gasoil": 1, "dubai": 1, "brent": 3, "usd": 5}
MAX_FFILL_DAYS = 7        # maximum age of a forward-filled input

HORIZONS = (7, 14, 30)
TOLERANCE_DAYS = 3        # target quote must be within +/- this of origin + h
MIN_TRAIN = 50            # rows before the first walk-forward prediction
MIN_RESID = 20            # residuals needed before an interval is issued
QUANTILES = (0.10, 0.90)  # independently fitted conditional log-return quantiles
INTERVAL_COVERAGE = 0.80  # target coverage of the range
MIN_INTERVAL_ROWS = 40    # below this the coverage figure is not reliable
DEV_END = "2026-07-31"    # gamma is chosen on rows before this; later rows are the holdout
GAMMAS = np.linspace(0, 1, 21)
ALPHAS = np.logspace(-2, 3, 20)
CLIP_RET5, CLIP_RET20, CLIP_DAILY = 0.25, 0.50, 0.25
VOL_FLOOR = 0.003         # minimum daily volatility used to scale ranges
SEED = 42

MIN_GAP_DAYS = 2          # nowcast adjusts the last quote only if it is at least this many days old