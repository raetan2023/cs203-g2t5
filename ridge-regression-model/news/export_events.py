"""Export the Pinecone event index to one local file, so evaluation and serving can run offline.

    $env:PINECONE_API_KEY="..."; $env:PINECONE_INDEX="..."
    python -m news.export_events           # writes artifacts/news_events.npz
Check the printed counts against `python -m news.audit_pinecone` before trusting the file."""
import os
import numpy as np
from . import config
from .store import to_date


def _get(o, name, default=None):
    v = o.get(name) if isinstance(o, dict) else getattr(o, name, None)   # dicts first: dict.values is a method!
    return default if v is None else v


def export(index, path=config.EVENTS_NPZ, namespaces=None, page_limit=None):
    stats = index.describe_index_stats()
    namespaces = namespaces or list((_get(stats, "namespaces", {}) or {}).keys()) or [""]
    ids, dates, texts, vecs = [], [], [], []
    outs = {n: [] for n in config.OUTCOME_FIELDS}
    skipped = 0
    for ns in namespaces:
        kw = {"namespace": ns} if ns else {}
        buf = []
        for batch in index.list(**kw):
            buf.extend(batch)
            if page_limit and len(buf) >= page_limit:
                break
        for i in range(0, len(buf), 100):
            resp = index.fetch(ids=buf[i:i + 100], **kw)
            for vid, v in (_get(resp, "vectors", {}) or {}).items():
                md = dict(_get(v, "metadata", {}) or {})
                try:
                    d = to_date(md[config.DATE_FIELD])
                except Exception:
                    skipped += 1
                    continue
                ids.append(vid); dates.append(np.datetime64(d)); texts.append(str(md.get(config.TEXT_FIELD, "")))
                vecs.append(np.asarray(_get(v, "values"), dtype=np.float32))
                for n, f in config.OUTCOME_FIELDS.items():
                    x = md.get(f)
                    outs[n].append(float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else np.nan)
    if not vecs:
        raise ValueError("No events with usable dates were found in the Pinecone index.")
    path.parent.mkdir(exist_ok=True)
    np.savez(path, ids=np.array(ids), dates=np.array(dates, dtype="datetime64[D]"), texts=np.array(texts),
             vectors=np.vstack(vecs), **{f"out_{n}": np.array(v) for n, v in outs.items()})
    print(f"exported {len(ids)} events ({skipped} skipped: no usable date). "
          + ", ".join(f"{n}: {int(np.isfinite(np.array(v)).sum())} with outcome" for n, v in outs.items()))
    return len(ids)


if __name__ == "__main__":
    from pinecone import Pinecone
    export(Pinecone(api_key=os.environ["PINECONE_API_KEY"]).Index(os.environ["PINECONE_INDEX"]))
