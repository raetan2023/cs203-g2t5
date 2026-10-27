"""The contract between FastAPI and the Spring client. Agree changes here first."""
from datetime import date
from typing import Literal, Optional
from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    horizon_days: Literal[7, 14, 30]
    as_of_date: Optional[date] = None      # default: latest available quote


class FeatureContribution(BaseModel):
    feature: str
    contribution: float = Field(description="Signed contribution to predicted log return, after gamma shrinkage.")


class IntervalMetadata(BaseModel):
    method: Literal["split_conformal_quantile"]
    nominal_coverage: float = Field(ge=0, le=1)
    empirical_coverage: Optional[float] = Field(ge=0, le=1)
    evaluation_rows: int = Field(ge=0)
    evaluation_scope: str
    baseline_coverage: Optional[float] = Field(ge=0, le=1)
    baseline_mean_width: Optional[float] = Field(ge=0)
    mean_width: Optional[float] = Field(ge=0)
    limitations: str


class PredictResponse(BaseModel):
    horizon_days: int
    target_date: date
    interval: IntervalMetadata
    raw_q10_price: float
    raw_q90_price: float
    as_of_date: date
    anchor_quote_date: date
    anchor_price: float
    quote_age_days: int
    forecast: float
    low: float
    high: float
    unit: str
    evidence: Literal["supported", "weak", "no_edge"]
    mae_skill_vs_persistence: float
    backtest_rows: int
    model_version: str
    top_drivers: list[FeatureContribution] = Field(
        description="Up to five features with the largest absolute contributions to predicted log return."
    )


class NowcastRequest(BaseModel):
    as_of_date: Optional[date] = None      # default: latest date with market data


class NowcastResponse(BaseModel):
    as_of_date: date
    status: Literal["observed", "estimated", "carried_forward"]
    last_quote_date: date
    last_quote_price: float
    gap_days: int
    estimate: float
    low: Optional[float] = None     # null when status is carried_forward (no calibrated range)
    high: Optional[float] = None
    unit: str
    evidence: Literal["supported", "weak", "no_edge"]
    mae_skill_vs_persistence: float
    backtest_rows: int
    model_version: str


class FeatureShapDetail(BaseModel):
    feature: str = Field(description="Feature identifier.")
    description: str = Field(description="Human-readable description of the feature.")
    feature_value: float = Field(description="Raw observed feature value before standardization.")
    standardized_value: float = Field(description="Standardized feature value (z-score after StandardScaler).")
    coefficient: float = Field(description="Standardized Ridge regression coefficient (beta_j).")
    shap_value: float = Field(description="Per-prediction SHAP attribution: gamma * beta_j * z_j.")
    contribution: float = Field(description="Signed contribution to predicted log return (equivalent to shap_value).")
    abs_shap_value: float = Field(description="Absolute magnitude of the SHAP attribution.")
    direction: Literal["upward", "downward", "neutral"] = Field(
        description="Direction of impact on predicted return / price ('upward' if shap_value > 0, 'downward' if shap_value < 0, else 'neutral')."
    )
    price_impact_usd: float = Field(
        description="Estimated marginal dollar price impact on MGO forecast: anchor_price * (exp(shap_value) - 1)."
    )


class ExplainRequest(BaseModel):
    horizon_days: Literal[7, 14, 30] = Field(
        default=7,
        description="Forecast horizon in days (7, 14, or 30). Default is 7."
    )
    as_of_date: Optional[date] = Field(
        default=None,
        description="As-of evaluation date. Defaults to the latest available quote."
    )
    top_k: int = Field(
        default=5,
        ge=1,
        le=30,
        description="Number of top drivers to highlight (default 5)."
    )
    model_type: Literal["forecast", "nowcast"] = Field(
        default="forecast",
        description="Model to explain ('forecast' for horizon Ridge model, 'nowcast' for nowcast Ridge model)."
    )


class ExplainResponse(BaseModel):
    model_type: Literal["forecast", "nowcast"]
    horizon_days: Optional[int] = None
    as_of_date: date
    anchor_quote_date: date
    anchor_price: float
    quote_age_days: int
    forecast_price: float
    predicted_return: float
    base_value: float = Field(
        description="Expected log return (intercept term after gamma shrinkage), representing the model baseline before feature contributions."
    )
    unit: str = "USD/metric tonne"
    model_version: str
    top_drivers: list[FeatureShapDetail] = Field(
        description="Top K features ranked by absolute SHAP attribution magnitude."
    )
    top_positive_drivers: list[FeatureShapDetail] = Field(
        description="Top drivers exerting upward pressure on predicted price/return."
    )
    top_negative_drivers: list[FeatureShapDetail] = Field(
        description="Top drivers exerting downward pressure on predicted price/return."
    )
    all_shap_values: list[FeatureShapDetail] = Field(
        description="Full decomposition of all features into per-prediction SHAP attribution values."
    )
    efficiency_check: bool = Field(
        description="Verifies the Shapley efficiency axiom: base_value + sum(shap_values) == predicted_return within numerical tolerance."
    )
    explanation: str = Field(
        description="Grounded summary of forecast drivers and market associations, complying with FR-09."
    )