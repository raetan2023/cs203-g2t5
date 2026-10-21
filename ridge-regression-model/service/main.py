from fastapi import FastAPI, HTTPException
from src.predict import predict, nowcast
from .schemas import PredictRequest, PredictResponse, NowcastRequest, NowcastResponse

from news.service import router as news_router

app = FastAPI(title="MGO forecast service", docs_url="/docs")
app.include_router(news_router)


def _call(fn, *args):
    try:
        return fn(*args)
    except FileNotFoundError:
        raise HTTPException(503, "Model artifacts not found; run `python -m src.train`.")
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict", response_model=PredictResponse)
def predict_route(req: PredictRequest):
    return _call(predict, req.horizon_days, req.as_of_date)


@app.post("/nowcast", response_model=NowcastResponse)
def nowcast_route(req: NowcastRequest):
    return _call(nowcast, req.as_of_date)
