"""The contract between FastAPI and the Spring client. Agree changes here first."""
from datetime import date
from typing import Literal, Optional
from pydantic import BaseModel


class PredictRequest(BaseModel):
    horizon_days: Literal[7, 14, 30]
    as_of_date: Optional[date] = None      # default: latest available quote


class PredictResponse(BaseModel):
    horizon_days: int
    as_of_date: date
    anchor_quote_date: date
    anchor_price: float
    nowcast_price: Optional[float] = None
    nowcast_return: Optional[float] = None
    quote_age_days: int
    forecast: float
    low: float
    high: float
    unit: str
    evidence: Literal["supported", "weak", "no_edge"]
    mae_skill_vs_persistence: float
    backtest_rows: int
    model_version: str


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

