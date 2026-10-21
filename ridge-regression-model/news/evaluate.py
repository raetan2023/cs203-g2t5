"""Leave-forward evaluation: does 'similar past events' predict the effect of a new event?

For each event i (oldest to newest) the neighbours are drawn ONLY from events whose outcome window had fully
closed before i happened (date_j + horizon < date_i). Compared with: always zero, and the average outcome of all
eligible events (the base rate). A circular-shift control (outcomes shifted against dates, keeping their time structure) shows what skill luck alone produces.

    python -m news.evaluate --outcome mgo
"""
import argparse, json
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from . import config
from src.metrics import _block_bootstrap_ci


def _unit(V):
    V = np.asarray(V, dtype=np.float32)
    n = np.linalg.norm(V, axis=1, keepdims=True)
    return V / np.where(n == 0, 1, n)


def neighbour_table(Vn, dates, horizon_days, k, min_prior):
    """dates must be sorted ascending. cut[i] = number of events eligible for i (those before date_i - horizon)."""
    N = len(dates)
    cut = np.searchsorted(dates, dates - np.timedelta64(horizon_days, "D"), side="left")
    valid = np.where(cut >= max(min_prior, k))[0]
    idx = np.full((N, k), -1, dtype=np.int64); sims = np.full((N, k), np.nan, dtype=np.float32)
    for s in range(0, len(valid), 256):
        rows = valid[s:s + 256]
        S = Vn[rows] @ Vn[:cut[rows].max()].T
        for r, i in enumerate(rows):
            row = S[r, :cut[i]]
            top = np.argpartition(-row, k - 1)[:k]
            top = top[np.argsort(-row[top])]
            idx[i], sims[i] = top, row[top]
    return valid, idx, sims, cut


def _predict(valid, idx, sims, cut, y, power=1.0):
    W = np.clip(sims[valid], 0, None) ** power
    sw = W.sum(1)
    ok = sw > 0
    pred = np.where(ok, (W * y[idx[valid]]).sum(1) / np.where(ok, sw, 1), np.nan)
    csum = np.cumsum(y)
    base = csum[cut[valid] - 1] / cut[valid]
    return pred, base, ok


def _skill(y_true, pred, base):
    mae = lambda e: float(np.mean(np.abs(e)))
    return 1 - mae(y_true - pred) / mae(y_true), 1 - mae(y_true - pred) / mae(y_true - base)


def evaluate_arrays(dates, V, y, horizon_days=None, k=None, min_prior=30, n_perm=200, seed=42, min_gap_days=None):
    horizon_days = config.OUTCOME_HORIZON_DAYS if horizon_days is None else horizon_days
    k = config.TOP_K if k is None else k
    keep = np.isfinite(y)
    order = np.argsort(dates[keep], kind="stable")
    dates, Vn, y = dates[keep][order], _unit(V[keep][order]), np.asarray(y[keep][order], dtype=float)
    gap = max(horizon_days, min_gap_days or 0)      # a larger gap removes neighbours from the same ongoing storyline
    valid, idx, sims, cut = neighbour_table(Vn, dates, gap, k, min_prior)
    if len(valid) < 20:
        return {"status": "too_few_events", "n_events": int(len(y)), "n_scored": int(len(valid))}
    pred, base, ok = _predict(valid, idx, sims, cut, y)
    valid, pred, base = valid[ok], pred[ok], base[ok]
    actual = y[valid]
    d_zero = np.abs(actual) - np.abs(actual - pred)
    d_base = np.abs(actual - base) - np.abs(actual - pred)
    s_zero, s_base = _skill(actual, pred, base)
    nz = (actual != 0) & (pred != 0)
    rng = np.random.default_rng(seed)
    perm = []
    lo_shift = max(1, len(y) // 10)
    for _ in range(n_perm):                       # same neighbours, outcome series circularly shifted: skill from luck alone
        yp = np.roll(y, int(rng.integers(lo_shift, len(y) - lo_shift)))
        p2, b2, ok2 = _predict(valid, idx, sims, cut, yp)
        perm.append(_skill(yp[valid][ok2], p2[ok2], b2[ok2])[1])
    perm = np.array(perm)
    out = {
        "status": "ok", "n_events": int(len(y)), "n_scored": int(len(valid)), "horizon_days": horizon_days, "min_gap_days": gap, "k": k,
        "MAE_knn": float(np.mean(np.abs(actual - pred))), "MAE_zero": float(np.mean(np.abs(actual))),
        "MAE_base_rate": float(np.mean(np.abs(actual - base))),
        "skill_vs_zero": float(s_zero), "skill_vs_base_rate": float(s_base),
        "gain_vs_zero_CI95": list(_block_bootstrap_ci(d_zero)), "gain_vs_base_rate_CI95": list(_block_bootstrap_ci(d_base)),
        "direction_acc": float((np.sign(pred[nz]) == np.sign(actual[nz])).mean()) if nz.any() else float("nan"),
        "spearman": float(spearmanr(pred, actual).statistic),
        "perm_skill_mean": float(perm.mean()), "perm_p_value": float((1 + np.sum(perm >= s_base)) / (1 + n_perm)),
        "first_scored_date": str(dates[valid[0]]), "post_hoc": True,
    }
    out["evidence"] = news_evidence(out)
    return out


def news_evidence(m):
    """'no_edge' unless it beats BOTH zero and the base rate; 'supported' needs CIs above zero, a permutation
    p < 0.05, and a result not tuned on the same data (post_hoc False, i.e. confirmed on later events)."""
    if m.get("status") != "ok" or not (m["skill_vs_zero"] > 0 and m["skill_vs_base_rate"] > 0):
        return "no_edge"
    strong = m["gain_vs_zero_CI95"][0] > 0 and m["gain_vs_base_rate_CI95"][0] > 0 and m["perm_p_value"] < 0.05
    return "supported" if (strong and not m.get("post_hoc", True)) else "weak"


def load_events_npz(path, outcome):
    z = np.load(path, allow_pickle=True)
    return z["dates"].astype("datetime64[D]"), z["vectors"], z[f"out_{outcome}"].astype(float)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", default=str(config.EVENTS_NPZ)); ap.add_argument("--outcome", default=config.OUTCOME_DEFAULT)
    a = ap.parse_args()
    res = evaluate_arrays(*load_events_npz(a.events, a.outcome))
    config.ARTIFACTS.mkdir(exist_ok=True)
    config.EVAL_JSON.write_text(json.dumps({"outcome": a.outcome, **res}, indent=2, default=str))
    print(json.dumps(res, indent=2, default=str))
