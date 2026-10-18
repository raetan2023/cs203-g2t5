from datetime import date
from typing import Optional
from fastapi import FastAPI, HTTPException
from src.predict import predict, nowcast
from .schemas import PredictRequest, PredictResponse, NowcastRequest, NowcastResponse

app = FastAPI(title="MGO forecast service", docs_url="/docs")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict", response_model=PredictResponse)
def predict_route(req: PredictRequest):
    try:
        return predict(req.horizon_days, req.as_of_date)
    except FileNotFoundError:
        raise HTTPException(503, "Model artifacts not found; run `python -m src.train`.")
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/nowcast", response_model=NowcastResponse)
def nowcast_post_route(req: NowcastRequest = NowcastRequest()):
    try:
        return nowcast(req.as_of_date)
    except FileNotFoundError:
        raise HTTPException(503, "Market data not found.")
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/nowcast", response_model=NowcastResponse)
def nowcast_get_route(as_of_date: Optional[date] = None):
    try:
        return nowcast(as_of_date)
    except FileNotFoundError:
        raise HTTPException(503, "Market data not found.")
    except ValueError as e:
        raise HTTPException(422, str(e))

