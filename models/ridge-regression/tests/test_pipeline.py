"""
Unit tests for 2.5 MGO Price Forecasting pipeline components.
"""

import unittest
from pathlib import Path
import numpy as np
import pandas as pd

import sys
from pathlib import Path

# Add src to sys.path
src_dir = Path(__file__).resolve().parent.parent / "src"
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

from config import (
    DIRECTION_THRESHOLD_PCT,
    TARGET_SERIES
)
from data_loader import (
    find_market_data_file,
    get_market_data
)
from feature_engineering import (
    build_daily_market_features,
    align_mgo_targets_and_features
)
from ridge_model import RidgeMGOForecaster
from uncertainty import (
    classify_direction,
    compute_directional_probabilities,
    compute_prediction_intervals,
    compute_uncertainty_score
)
from predict import generate_forecast


class TestMGOForecastingPipeline(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        cls.pivoted_df, cls.audit_info = get_market_data()
        cls.features_df = build_daily_market_features(cls.pivoted_df)
        cls.aligned_df, cls.feature_cols = align_mgo_targets_and_features(
            cls.pivoted_df, cls.features_df, save_processed=False
        )

    def test_market_data_loaded(self):
        self.assertGreater(self.audit_info["total_rows"], 10000)
        self.assertIn(TARGET_SERIES, self.pivoted_df.columns)
        self.assertGreater(len(self.pivoted_df), 2000)

    def test_feature_engineering_no_lookahead(self):
        self.assertIn("sg_gasoil_investing_lag1", self.features_df.columns)
        self.assertIn("crack_gasoil_brent_lag1", self.features_df.columns)
        self.assertIn("gasoil_return_interval", self.aligned_df.columns)
        self.assertGreater(len(self.feature_cols), 10)
        self.assertFalse(self.aligned_df[self.feature_cols].isnull().any().any())

    def test_ridge_model_fit_and_predict(self):
        train = self.aligned_df.iloc[:80]
        test = self.aligned_df.iloc[80:85]
        
        forecaster = RidgeMGOForecaster()
        forecaster.fit(
            train[self.feature_cols],
            train["mgo_return"],
            train["mgo_lag_price"],
            train["mgo_price"]
        )
        self.assertIsNotNone(forecaster.optimal_alpha_)
        self.assertGreater(forecaster.optimal_alpha_, 0)
        
        pred_rets = forecaster.predict_return(test[self.feature_cols])
        self.assertEqual(len(pred_rets), 5)
        
        pred_prices = forecaster.predict_price(test[self.feature_cols], test["mgo_lag_price"])
        self.assertEqual(len(pred_prices), 5)
        self.assertTrue(np.all(pred_prices > 0))

    def test_directional_classification(self):
        dir_up, _ = classify_direction(0.015)
        dir_down, _ = classify_direction(-0.015)
        dir_flat, _ = classify_direction(0.001)
        
        self.assertEqual(dir_up, "UP")
        self.assertEqual(dir_down, "DOWN")
        self.assertEqual(dir_flat, "FLAT")

    def test_prediction_intervals(self):
        intervals = compute_prediction_intervals(1000.0, 30.0)
        self.assertIn("80%", intervals)
        self.assertIn("90%", intervals)
        self.assertIn("95%", intervals)
        
        # 95% interval should be strictly wider than 80%
        self.assertGreater(intervals["95%"]["range_width"], intervals["80%"]["range_width"])
        self.assertLess(intervals["90%"]["lower"], 1000.0)
        self.assertGreater(intervals["90%"]["upper"], 1000.0)

    def test_uncertainty_score(self):
        score_fresh = compute_uncertainty_score(residual_std=30.0, point_forecast=1000.0, days_since_anchor=1)
        score_stale = compute_uncertainty_score(residual_std=30.0, point_forecast=1000.0, days_since_anchor=20)
        
        self.assertLess(score_fresh["uncertainty_score"], score_stale["uncertainty_score"])
        self.assertGreater(score_fresh["confidence_score"], score_stale["confidence_score"])


if __name__ == "__main__":
    unittest.main()
