"""Audit the Pinecone event index. Prints a summary with NO keys and only short text snippets.

PowerShell:
    $env:PINECONE_API_KEY = "<your key>"
    $env:PINECONE_INDEX   = "<index name>"
    python -m news.audit_pinecone
"""
import collections, json, os, statistics
from datetime import datetime, timezone

SAMPLE = 400
MGO_START, DATA_CUTOFF = "2020-03-13", "2026-10-06"
NUM_HINTS = ("ret", "chg", "change", "pct", "move", "impact", "brent", "mgo", "gasoil", "price")
TEXT_HINTS = ("text", "title", "summary", "headline", "description", "event")


def _get(o, name, default=None):
    v = o.get(name) if isinstance(o, dict) else getattr(o, name, None)   # dicts first: dict.values is a method!
    return default if v is None else v


def _to_date(x):
    try:
        if isinstance(x, (int, float)) and x > 1e8:
            return datetime.fromtimestamp(x / (1000 if x > 1e11 else 1), tz=timezone.utc).date().isoformat()
        return datetime.fromisoformat(str(x)[:10]).date().isoformat()
    except Exception:
        return None


def collect(index, sample=SAMPLE):
    stats = index.describe_index_stats()
    info = {"total_vectors": _get(stats, "total_vector_count"), "dimension": _get(stats, "dimension"),
            "namespaces": list((_get(stats, "namespaces", {}) or {}).keys())}
    metas, notes = [], []
    for ns in (info["namespaces"] or [""]):
        kw = {"namespace": ns} if ns else {}
        ids = []
        try:
            for batch in index.list(**kw):
                ids.extend(batch)
                if len(ids) >= sample:
                    break
        except Exception as e:
            notes.append(f"index.list failed for namespace {ns!r}: {type(e).__name__}: {e}")
        for i in range(0, min(len(ids), sample), 100):
            resp = index.fetch(ids=ids[i:i + 100], **kw)
            for v in (_get(resp, "vectors", {}) or {}).values():
                metas.append(dict(_get(v, "metadata", {}) or {}))
    return info, metas, notes


def summarize(info, metas, notes):
    keys = collections.defaultdict(list)
    for m in metas:
        for k, v in m.items():
            keys[k].append(v)
    out = {"index": info, "sampled_records": len(metas), "notes": notes, "fields": {}, "dates": {}, "numeric": {}, "flags": []}
    for k, vals in keys.items():
        out["fields"][k] = {"present": len(vals), "type": type(vals[0]).__name__, "example": str(vals[0])[:60]}
    for k, vals in keys.items():
        if any(h in k.lower() for h in ("date", "time", "day")):
            ds = [d for d in (_to_date(v) for v in vals) if d]
            if ds:
                by_year = collections.Counter(d[:4] for d in ds)
                out["dates"][k] = {"min": min(ds), "max": max(ds), "by_year": dict(sorted(by_year.items())),
                                   "share_in_mgo_era": round(sum(d >= MGO_START for d in ds) / len(ds), 3),
                                   "after_data_cutoff": sum(d > DATA_CUTOFF for d in ds)}
        nums = [v for v in vals if isinstance(v, (int, float)) and not isinstance(v, bool)]
        if nums and any(h in k.lower() for h in NUM_HINTS):
            out["numeric"][k] = {"n": len(nums), "min": min(nums), "median": statistics.median(nums), "max": max(nums)}
    for k, vals in keys.items():
        if any(h in k.lower() for h in TEXT_HINTS) and isinstance(vals[0], str):
            texts = [v for v in vals if isinstance(v, str)]
            out["fields"][k]["avg_len"] = round(sum(map(len, texts)) / len(texts))
            out["fields"][k]["duplicates"] = len(texts) - len(set(texts))
    if not out["dates"]:
        out["flags"].append("No date-like metadata field found: retrieval cannot be restricted to events BEFORE a date.")
    if not out["numeric"]:
        out["flags"].append("No numeric outcome-like field found: price effects may not be stored.")
    for k, d in out["dates"].items():
        if d["after_data_cutoff"]:
            out["flags"].append(f"{k}: {d['after_data_cutoff']} sampled events are dated after {DATA_CUTOFF}.")
        if d["share_in_mgo_era"] < 0.5:
            out["flags"].append(f"{k}: only {d['share_in_mgo_era']:.0%} of events fall in the MGO era (>= {MGO_START}).")
    return out


def main():
    from pinecone import Pinecone
    index = Pinecone(api_key=os.environ["PINECONE_API_KEY"]).Index(os.environ["PINECONE_INDEX"])
    print(json.dumps(summarize(*collect(index)), indent=2, default=str))


if __name__ == "__main__":
    main()
