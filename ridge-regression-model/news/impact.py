"""Turn similar past events into an impact summary. Descriptive context, not a forecast."""
import numpy as np
from . import config


def aggregate(neighbours, outcome=None, min_neighbours=None, min_similarity=None):
    outcome = outcome or config.OUTCOME_DEFAULT
    min_n = config.MIN_NEIGHBOURS if min_neighbours is None else min_neighbours
    min_s = config.MIN_SIMILARITY if min_similarity is None else min_similarity
    use = [n for n in neighbours if n.similarity >= min_s and np.isfinite(n.event.outcomes.get(outcome, np.nan))]
    if len(use) < min_n:
        return {"status": "insufficient", "n": len(use)}
    sims = np.array([n.similarity for n in use]); y = np.array([n.event.outcomes[outcome] for n in use])
    w = np.clip(sims, 0, None); w = w / w.sum() if w.sum() > 0 else np.full(len(use), 1 / len(use))
    mean = float(np.sum(w * y))
    sign = np.sign(y)
    share_up, share_down = float(w[sign > 0].sum()), float(w[sign < 0].sum())
    agreement = max(share_up, share_down)
    direction = "mixed" if agreement < config.DIRECTION_AGREEMENT_MIN else ("up" if share_up > share_down else "down")
    return {"status": "ok", "n": len(use), "effective_n": float(1 / np.sum(w ** 2)), "mean_similarity": float(sims.mean()),
            "expected_effect": mean, "median_effect": float(np.median(y)),
            "low": float(np.quantile(y, 0.10)), "high": float(np.quantile(y, 0.90)),
            "direction": direction, "direction_agreement": float(agreement)}
