"""Event stores. query(vector, k, before) returns the k most similar events dated STRICTLY before `before`."""
from datetime import date, datetime
import numpy as np
from . import config
from .types import Event, Neighbour


def to_date(x):
    if isinstance(x, datetime):
        return x.date()
    if isinstance(x, date):
        return x
    if isinstance(x, (int, float)) and x > 1e8:
        return datetime.utcfromtimestamp(x / (1000 if x > 1e11 else 1)).date()
    return datetime.fromisoformat(str(x)[:10]).date()


def _unit(v):
    v = np.asarray(v, dtype=np.float32)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.where(n == 0, 1, n)


class InMemoryStore:
    """Exact cosine search over an exported event table (see news.export_events). Fast, free, testable."""
    def __init__(self, events, vectors):
        self.events, self.V = list(events), _unit(vectors)
        self.dates = np.array([np.datetime64(e.date) for e in self.events])

    @classmethod
    def from_npz(cls, path):
        z = np.load(path, allow_pickle=True)
        out_names = [k[4:] for k in z.files if k.startswith("out_")]
        events = [Event(id=str(z["ids"][i]), date=to_date(z["dates"][i]), text=str(z["texts"][i]),
                        outcomes={n: float(z[f"out_{n}"][i]) for n in out_names if np.isfinite(z[f"out_{n}"][i])})
                  for i in range(len(z["ids"]))]
        return cls(events, z["vectors"])

    def query(self, vector, k, before):
        mask = self.dates < np.datetime64(before)
        if not mask.any():
            return []
        idx = np.where(mask)[0]
        sims = self.V[idx] @ _unit(vector)
        top = np.argsort(-sims)[:k]
        return [Neighbour(self.events[idx[j]], float(sims[j])) for j in top]


class PineconeStore:
    """Live Pinecone index. Pinecone's $lt filter only works on NUMERIC metadata, so when the date is stored as text
    we over-fetch and drop later events on the client."""
    def __init__(self, index, date_is_numeric=False, namespace=None, overfetch=6):
        self.index, self.numeric, self.ns, self.over = index, date_is_numeric, namespace, overfetch

    def query(self, vector, k, before):
        kw = {"namespace": self.ns} if self.ns else {}
        if self.numeric:
            kw["filter"] = {config.DATE_FIELD: {"$lt": int(datetime.combine(before, datetime.min.time()).timestamp())}}
        resp = self.index.query(vector=[float(x) for x in vector], top_k=k if self.numeric else k * self.over,
                                include_metadata=True, **kw)
        out = []
        for m in (resp["matches"] if isinstance(resp, dict) else resp.matches):
            md = m["metadata"] if isinstance(m, dict) else m.metadata
            sc = m["score"] if isinstance(m, dict) else m.score
            mid = m["id"] if isinstance(m, dict) else m.id
            try:
                d = to_date(md[config.DATE_FIELD])
            except Exception:
                continue
            if d >= before:
                continue
            outcomes = {n: float(md[f]) for n, f in config.OUTCOME_FIELDS.items()
                        if f in md and isinstance(md[f], (int, float))}
            out.append(Neighbour(Event(str(mid), d, str(md.get(config.TEXT_FIELD, "")), outcomes), float(sc)))
        return out[:k]
