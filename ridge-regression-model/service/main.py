from fastapi import FastAPI, HTTPException
from src.predict import predict, nowcast, explain, IntervalArtifactUnavailable
from .schemas import (
    PredictRequest, PredictResponse,
    NowcastRequest, NowcastResponse,
    ExplainRequest, ExplainResponse,
)

from news.service import router as news_router

app = FastAPI(title="MGO forecast service", docs_url="/docs")
app.include_router(news_router)


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except (FileNotFoundError, IntervalArtifactUnavailable):
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


@app.post("/explain", response_model=ExplainResponse, summary="Per-prediction SHAP attributions and top drivers")
def explain_route(req: ExplainRequest):
    return _call(
        explain,
        h=req.horizon_days,
        as_of=req.as_of_date,
        top_k=req.top_k,
        model_type=req.model_type,
    )


@app.post("/shap", response_model=ExplainResponse, include_in_schema=False)
def shap_route(req: ExplainRequest):
    return _call(
        explain,
        h=req.horizon_days,
        as_of=req.as_of_date,
        top_k=req.top_k,
        model_type=req.model_type,
    )


@app.post("/predict/explain", response_model=ExplainResponse, include_in_schema=False)
def predict_explain_route(req: ExplainRequest):
    return _call(
        explain,
        h=req.horizon_days,
        as_of=req.as_of_date,
        top_k=req.top_k,
        model_type=req.model_type,
    )


@app.post("/predict/shap", response_model=ExplainResponse, include_in_schema=False)
def predict_shap_route(req: ExplainRequest):
    return _call(
        explain,
        h=req.horizon_days,
        as_of=req.as_of_date,
        top_k=req.top_k,
        model_type=req.model_type,
    )
