"""POST /news-impact: recent headlines -> similar past events -> impact summary. Separate from the Ridge model."""
import json
import math
from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Literal, Optional
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from . import config
from .gdelt_source import fetch_headlines
from .impact import aggregate
from .classifier import CATEGORIES, classify
from .llm import build_llm


@dataclass
class Deps:
    fetch: callable       # fetch(max_items) -> list[NewsItem]
    embedder: object      # .embed(list[str]) -> ndarray
    store: object         # .query(vector, k, before) -> list[Neighbour]


def build_deps() -> Deps:
    """Production wiring. Needs NEWS_EVENTS_NPZ (exported events) or Pinecone env vars, plus an embedder."""
    import os
    from .embedder import OpenAIEmbedder
    from .store import InMemoryStore, PineconeStore
    if config.EVENTS_NPZ.exists():
        store = InMemoryStore.from_npz(config.EVENTS_NPZ)
    else:
        from pinecone import Pinecone
        store = PineconeStore(Pinecone(api_key=os.environ["PINECONE_API_KEY"]).Index(os.environ["PINECONE_INDEX"]))
    return Deps(lambda n: fetch_headlines(max_records=n), OpenAIEmbedder(config.EMBED_MODEL), store)


def load_evidence() -> dict:
    if config.EVAL_JSON.exists():
        m = json.loads(config.EVAL_JSON.read_text())
        return {"evidence": m.get("evidence", "no_edge"), "n_scored": m.get("n_scored"),
                "skill_vs_base_rate": m.get("skill_vs_base_rate")}
    return {"evidence": "unevaluated", "n_scored": None, "skill_vs_base_rate": None}


def news_impact(deps: Deps, outcome=None, max_items=10, k=None, n_neighbours_shown=3) -> dict:
    outcome, k = outcome or config.OUTCOME_DEFAULT, k or config.TOP_K
    items = deps.fetch(max_items)[:max_items]
    vecs = deps.embedder.embed([i.title for i in items]) if items else []
    results, used = [], []
    for item, v in zip(items, vecs):
        cutoff = item.seen_date - timedelta(days=config.OUTCOME_HORIZON_DAYS)   # outcome window must be closed
        neigh = deps.store.query(v, k, before=cutoff)
        imp = aggregate(neigh, outcome)
        if imp["status"] == "ok":
            used.append(imp)
        results.append({"title": item.title, "url": item.url, "seen_date": item.seen_date, "domain": item.domain, "impact": imp,
                        "similar_events": [{"event_id": n.event.id, "date": n.event.date, "text": n.event.text[:200],
                                            "similarity": n.similarity, "effect": n.event.outcomes.get(outcome)}
                                           for n in neigh[:n_neighbours_shown]]})
    summary = {"status": "insufficient", "n_items_used": 0}
    if used:
        w = np.array([u["mean_similarity"] for u in used]); e = np.array([u["expected_effect"] for u in used])
        summary = {"status": "ok", "n_items_used": len(used), "expected_effect": float(np.sum(w * e) / w.sum()),
                   "share_up": float(np.mean([u["direction"] == "up" for u in used])),
                   "share_down": float(np.mean([u["direction"] == "down" for u in used]))}
    return {"outcome": outcome, "horizon_days": config.OUTCOME_HORIZON_DAYS, "n_headlines": len(items), "summary": summary,
            "items": results, **load_evidence(),
            "note": "Context from similar past events. It is not a price forecast."}


class NewsRequest(BaseModel):
    outcome: Literal["mgo", "brent"] = "mgo"
    max_items: int = 10


class NewsResponse(BaseModel):
    outcome: str
    horizon_days: int
    n_headlines: int
    summary: dict
    items: List[dict]
    evidence: Literal["supported", "weak", "no_edge", "unevaluated"]
    n_scored: Optional[int] = None
    skill_vs_base_rate: Optional[float] = None
    note: str


router = APIRouter()


@router.post("/news-impact", response_model=NewsResponse)
def news_impact_route(req: NewsRequest):
    try:
        return news_impact(build_deps(), req.outcome, req.max_items)
    except (FileNotFoundError, KeyError) as e:
        raise HTTPException(503, f"News pipeline not configured: {e}")
    except Exception as e:
        raise HTTPException(502, f"News pipeline failed: {type(e).__name__}")


class TagRequest(BaseModel):
    target_date: date
    max_items: int = Field(default=20, gt=0, le=250)


class TagResponse(BaseModel):
    target_date: date
    n_headlines: int
    counts: dict
    items: List[dict]
    daily_summary: dict
    agreement_with_library_labels: Optional[float] = None
    note: str


def _llm_agreement() -> Optional[float]:
    p = config.ARTIFACTS / "news_classify_eval.json"
    try:
        return float(json.loads(p.read_text())["llm"]["all_scored"]["accuracy"])
    except Exception:
        return None


def _daily_market_summary(target_date: date, results: List[dict]) -> dict:
    biases = ("bullish", "bearish", "neutral")
    weights = {bias: 0.0 for bias in biases}
    n_classified = 0
    for result in results:
        if not result["valid"] or result["market_bias"] not in weights:
            continue
        confidence = result["confidence"]
        if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
            continue
        if not math.isfinite(confidence) or not 0 <= confidence <= 1:
            continue
        weights[result["market_bias"]] += confidence
        n_classified += 1

    total_weight = sum(weights.values())
    if total_weight == 0:
        return {
            "status": "insufficient",
            "date": target_date,
            "n_classified": n_classified,
            "market_bias": "neutral",
            "confidence_weighted_shares": {bias: None for bias in biases},
        }

    shares = {bias: weight / total_weight for bias, weight in weights.items()}
    highest_share = max(shares.values())
    leaders = [bias for bias, share in shares.items() if math.isclose(share, highest_share, abs_tol=1e-12)]
    return {
        "status": "ok",
        "date": target_date,
        "n_classified": n_classified,
        "market_bias": leaders[0] if len(leaders) == 1 else "neutral",
        "confidence_weighted_shares": shares,
    }


@router.post("/news-tags", response_model=TagResponse)
def news_tags_route(req: TagRequest):
    """Label headlines for a requested date and summarize their confidence-weighted market bias."""
    try:
        items = fetch_headlines(max_records=req.max_items, target_date=req.target_date)[:req.max_items]
        res = classify([i.title for i in items], build_llm(), workers=4) if items else []
    except KeyError as e:
        raise HTTPException(503, f"LLM not configured: {e}")
    except Exception as e:
        raise HTTPException(502, f"Tagging failed: {type(e).__name__}")
    counts = {category: 0 for category in (*CATEGORIES, "invalid")}
    for r in res:
        counts[r["category"]] = counts.get(r["category"], 0) + 1
    return {"target_date": req.target_date, "n_headlines": len(items), "counts": counts,
            "items": [{"title": i.title, "url": i.url, "seen_date": i.seen_date, **r} for i, r in zip(items, res)],
            "daily_summary": _daily_market_summary(req.target_date, res),
            "agreement_with_library_labels": _llm_agreement(),
            "note": "The daily bias is a confidence-weighted summary of returned headlines, capped by max_items (up to 250). "
                    "It is not a price forecast or a complete census of all news that day."}
