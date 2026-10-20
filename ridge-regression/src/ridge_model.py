"""
Ridge Regression Forecaster module for Singapore MGO price and movement estimation.
Implements L2 regularized regression with StandardScaler, optimal alpha cross-validation,
residual tracking, and serialization.
"""

from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge, RidgeCV
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

try:
    from .config import (
        DEFAULT_ALPHAS,
        CV_FOLDS,
        SAVED_MODEL_PATH,
        SAVED_METADATA_PATH
    )
except ImportError:
    from config import (
        DEFAULT_ALPHAS,
        CV_FOLDS,
        SAVED_MODEL_PATH,
        SAVED_METADATA_PATH
    )


class RidgeMGOForecaster:
    """
    Ridge Regression forecaster for near-term Singapore MGO price movement.
    Models return r_t = (M_t - M_{t-1}) / M_{t-1} as a function of lagged market indicators.
    Predicted price is obtained via: M_hat_t = M_{t-1} * (1 + r_hat_t).
    """
    
    def __init__(
        self,
        alphas: np.ndarray = DEFAULT_ALPHAS,
        cv: int = CV_FOLDS,
        fixed_alpha: Optional[float] = None
    ):
        self.alphas = alphas
        self.cv = cv
        self.fixed_alpha = fixed_alpha
        self.scaler: StandardScaler = StandardScaler()
        self.model: Optional[Ridge] = None
        self.optimal_alpha_: Optional[float] = None
        self.feature_names_: List[str] = []
        self.train_residuals_price_: Optional[np.ndarray] = None
        self.train_residuals_return_: Optional[np.ndarray] = None
        self.residual_std_price_: Optional[float] = None
        self.residual_std_return_: Optional[float] = None
        self.train_metrics_: Dict[str, float] = {}

    def fit(self, X: pd.DataFrame, y_return: pd.Series, lag_price: pd.Series, actual_price: pd.Series) -> "RidgeMGOForecaster":
        """
        Fits the regularized Ridge model on training features and returns.
        Records in-sample residuals and residual standard error for uncertainty estimation.
        """
        self.feature_names_ = list(X.columns)
        X_scaled = self.scaler.fit_transform(X)
        
        if self.fixed_alpha is not None:
            self.model = Ridge(alpha=self.fixed_alpha)
            self.model.fit(X_scaled, y_return)
            self.optimal_alpha_ = self.fixed_alpha
        else:
            ridge_cv = RidgeCV(alphas=self.alphas, cv=self.cv)
            ridge_cv.fit(X_scaled, y_return)
            self.optimal_alpha_ = float(ridge_cv.alpha_)
            self.model = Ridge(alpha=self.optimal_alpha_)
            self.model.fit(X_scaled, y_return)
            
        # In-sample predictions and residuals
        pred_return = self.model.predict(X_scaled)
        pred_price = lag_price.values * (1.0 + pred_return)
        
        self.train_residuals_return_ = y_return.values - pred_return
        self.train_residuals_price_ = actual_price.values - pred_price
        
        self.residual_std_return_ = float(np.std(self.train_residuals_return_))
        self.residual_std_price_ = float(np.std(self.train_residuals_price_))
        
        # In-sample metrics
        mae_price = float(np.mean(np.abs(self.train_residuals_price_)))
        rmse_price = float(np.sqrt(np.mean(self.train_residuals_price_ ** 2)))
        r2_return = float(self.model.score(X_scaled, y_return))
        
        self.train_metrics_ = {
            "train_mae_price": mae_price,
            "train_rmse_price": rmse_price,
            "train_r2_return": r2_return,
            "residual_std_price": self.residual_std_price_,
            "residual_std_return": self.residual_std_return_,
            "optimal_alpha": self.optimal_alpha_,
            "n_samples": len(X)
        }
        
        return self

    def predict_return(self, X: pd.DataFrame) -> np.ndarray:
        """
        Predicts expected percentage return r_hat.
        """
        if self.model is None:
            raise RuntimeError("Model is not fitted yet.")
        X_scaled = self.scaler.transform(X[self.feature_names_])
        return self.model.predict(X_scaled)

    def predict_price(self, X: pd.DataFrame, anchor_price: pd.Series) -> np.ndarray:
        """
        Predicts price level M_hat = anchor_price * (1 + r_hat).
        """
        pred_ret = self.predict_return(X)
        return anchor_price.values * (1.0 + pred_ret)

    def get_feature_coefficients(self) -> pd.DataFrame:
        """
        Returns standardized feature coefficients sorted by absolute magnitude.
        """
        if self.model is None:
            raise RuntimeError("Model is not fitted yet.")
        df = pd.DataFrame({
            "feature": self.feature_names_,
            "coefficient": self.model.coef_,
            "abs_importance": np.abs(self.model.coef_)
        }).sort_values(by="abs_importance", ascending=False).reset_index(drop=True)
        return df

    def save(self, model_path: Path = SAVED_MODEL_PATH, meta_path: Path = SAVED_METADATA_PATH) -> None:
        """
        Serializes model pipeline and metadata to disk.
        """
        model_path.parent.mkdir(parents=True, exist_ok=True)
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        
        payload = {
            "scaler": self.scaler,
            "model": self.model,
            "optimal_alpha_": self.optimal_alpha_,
            "feature_names_": self.feature_names_,
            "residual_std_price_": self.residual_std_price_,
            "residual_std_return_": self.residual_std_return_,
            "train_metrics_": self.train_metrics_
        }
        joblib.dump(payload, model_path)
        
        metadata = {
            "optimal_alpha": self.optimal_alpha_,
            "features_count": len(self.feature_names_),
            "features": self.feature_names_,
            "train_metrics": self.train_metrics_,
            "top_features": self.get_feature_coefficients().head(10).to_dict(orient="records")
        }
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

    @classmethod
    def load(cls, model_path: Path = SAVED_MODEL_PATH) -> "RidgeMGOForecaster":
        """
        Deserializes a saved RidgeMGOForecaster model pipeline.
        """
        if not model_path.exists():
            raise FileNotFoundError(f"Model file not found at: {model_path}")
            
        payload = joblib.load(model_path)
        forecaster = cls(fixed_alpha=payload["optimal_alpha_"])
        forecaster.scaler = payload["scaler"]
        forecaster.model = payload["model"]
        forecaster.optimal_alpha_ = payload["optimal_alpha_"]
        forecaster.feature_names_ = payload["feature_names_"]
        forecaster.residual_std_price_ = payload["residual_std_price_"]
        forecaster.residual_std_return_ = payload["residual_std_return_"]
        forecaster.train_metrics_ = payload["train_metrics_"]
        return forecaster
