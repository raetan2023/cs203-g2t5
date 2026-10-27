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
    as_of_date: Optional[date] = None      # default: latest available date


class NowcastResponse(BaseModel):
    as_of_date: date
    anchor_quote_date: date
    anchor_price: float
    quote_age_days: int
    gasoil_move_since_quote: float
    nowcast_price: float
    nowcast_return: float
    unit: str
    status: Literal["fresh_quote", "nowcasted"]
    explanation: str

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