"""Label an oil-market headline with ONE event category (the library's categories plus 'other').

The category definitions below were written from the category names and sample headlines in the event library;
the library's own screening rules were not available. Bump PROMPT_VERSION when you change them."""
import json
import math
import re
from concurrent.futures import ThreadPoolExecutor

PROMPT_VERSION = "v1"
CATEGORIES = {
    "sanctions": "sanctions, embargoes, export/import bans or other trade restrictions on oil, oil companies or tankers, or their lifting",
    "shipping_disruption": "attacks on, delays, suspensions or rerouting of tankers, ports, straits, pipelines or shipping routes, or their restoration",
    "refinery_outage": "refinery shutdowns, fires, attacks, breakdowns or restarts",
    "production_disruption": "physical changes in crude output: field outages, strikes, shortages, output cuts or increases not framed as a formal policy decision",
    "production_decision": "formal output policy: OPEC+ or government agreements, quotas, pledges to cut or raise production",
    "oil_infrastructure_conflict": "armed conflict or attacks that threaten oil fields and infrastructure",
    "strategic_stock_release": "government releases of strategic petroleum reserves",
    "demand_shock": "a sudden large fall or rise in oil demand (lockdowns, recessions, travel collapse)",
    "other": "not about any of the events above (for example general business, politics or unrelated energy news)",
}
LABELS = list(CATEGORIES)

SYSTEM = (
    "You label oil-market news headlines. Choose exactly ONE category from the list.\n\n"
    + "\n".join(f"- {k}: {v}" for k, v in CATEGORIES.items())
    + "\n\nIf a headline fits two categories, choose the one that names the physical thing affected "
      "(tanker or route -> shipping_disruption, refinery -> refinery_outage, oil field or output -> production_disruption). "
      "Judge only from the headline text. Reply with ONLY a JSON object: "
      '{"category": "<one of the category names>", "confidence": <0 to 1>, "reason": "<at most 15 words>"}'
)


def build_user(text: str) -> str:
    return f"Headline: {text.strip()}"


def parse_response(raw: str) -> dict:
    """Return invalid unless the reply contains the complete expected JSON result."""
    if not isinstance(raw, str):
        return {"category": "invalid", "confidence": None, "reason": "unparseable reply", "valid": False}
    m = re.search(r"\{.*?\}", raw, re.S)
    try:
        obj = json.loads(m.group(0)) if m else {}
        if not isinstance(obj, dict):
            raise ValueError("response is not a JSON object")
        cat = str(obj.get("category", "")).strip().lower()
        if cat not in CATEGORIES:
            reason = obj.get("reason")
            if cat == "invalid" and isinstance(reason, str) and reason.strip():
                return {"category": "invalid", "confidence": None, "reason": reason.strip()[:120], "valid": False}
            return {"category": "invalid", "confidence": None, "reason": f"unrecognised: {cat[:40]!r}", "valid": False}
        conf = obj.get("confidence")
        if not isinstance(conf, (int, float)) or isinstance(conf, bool):
            raise ValueError("missing or invalid confidence")
        conf = float(conf)
        if not math.isfinite(conf) or not 0 <= conf <= 1:
            raise ValueError("confidence must be between 0 and 1")
        reason = obj.get("reason")
        if not isinstance(reason, str) or not reason.strip():
            raise ValueError("missing reason")
        reason = reason.strip()
        if len(reason.split()) > 15:
            raise ValueError("reason exceeds 15 words")
        return {"category": cat, "confidence": conf, "reason": reason, "valid": True}
    except ValueError as exc:
        return {"category": "invalid", "confidence": None, "reason": str(exc)[:120], "valid": False}
    except Exception:
        return {"category": "invalid", "confidence": None, "reason": "unparseable reply", "valid": False}


def classify(texts, llm, workers=1):
    def one(text):
        try:
            return parse_response(llm.complete(SYSTEM, build_user(text)))
        except Exception as exc:
            return {"category": "invalid", "confidence": None,
                    "reason": f"LLM request failed: {type(exc).__name__}", "valid": False}

    if workers <= 1:
        return [one(t) for t in texts]
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(one, texts))
