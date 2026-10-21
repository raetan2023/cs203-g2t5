"""Evaluate 'similar past events -> next-week price change' on the exported event library.

    python -m news.library_eval --file all_events_2020_2026.json

Outcomes are SIGNED 1-week returns (percentage points) of Brent and Singapore gasoil futures (an MGO proxy, not MGO).
Each event is predicted only from events whose outcome window closed before it. Baselines: always zero, the average of
all earlier events, and the average of earlier events in the SAME category. Robustness: neighbours must be at least
7 / 30 / 90 days older, which removes events from the same ongoing storyline."""
import argparse, json
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.feature_extraction.text import TfidfVectorizer
from . import config
from .evaluate import neighbour_table, _predict, _unit, news_evidence
from src.metrics import _block_bootstrap_ci

SERIES = {"brent": "brent_fred", "gasoil": "sg_gasoil_investing"}


def load_library(path):
    d = json.load(open(path, encoding="utf-8"))
    rows = []
    for e in d["events"]:
        out = {o["series"]: o["return_pct"] for o in e["price_outcomes"] if o.get("return_pct") is not None}
        rows.append({"id": e["event_id"], "date": pd.Timestamp(e["public_date"]), "title": e["title"],
                     "text": f"{e['title']}. {e['description']}", "category": e["category"], "tier": e["importance_tier"],
                     **{k: out.get(s, np.nan) for k, s in SERIES.items()}})
    return pd.DataFrame(rows).sort_values("date", kind="stable").reset_index(drop=True), d


def _category_baseline(cats, y, cut):
    """Average earlier outcome in the same category (falls back to the overall earlier average)."""
    out = np.empty(len(y))
    for i in range(len(y)):
        j = np.arange(cut[i]) if cut[i] > 0 else np.array([], dtype=int)
        same = j[cats[j] == cats[i]] if len(j) else j
        pool = same if len(same) >= 3 else j
        out[i] = y[pool].mean() if len(pool) else np.nan
    return out


def evaluate_outcome(df, V, outcome, gap_days, k=None, n_perm=500, seed=42):
    k = k or config.TOP_K
    d = df[np.isfinite(df[outcome])].reset_index(drop=True)
    Vn = _unit(V[df.index[np.isfinite(df[outcome])]])
    dates = d["date"].values.astype("datetime64[D]")
    y = d[outcome].to_numpy(float)
    valid, idx, sims, cut = neighbour_table(Vn, dates, gap_days, k, min_prior=30)
    pred, base, ok = _predict(valid, idx, sims, cut, y)
    cat = _category_baseline(d["category"].to_numpy(), y, cut)[valid]
    keep = ok & np.isfinite(cat)
    v, pred, base, cat = valid[keep], pred[keep], base[keep], cat[keep]
    a = y[v]
    mae = lambda e: float(np.mean(np.abs(e)))
    res = {"n_scored": int(len(v)), "gap_days": gap_days, "MAE_zero": mae(a), "MAE_base_rate": mae(a - base),
           "MAE_category": mae(a - cat), "MAE_knn": mae(a - pred)}
    for name, b in (("zero", 0 * a), ("base_rate", base), ("category", cat)):
        res[f"skill_vs_{name}"] = 1 - res["MAE_knn"] / mae(a - b)
        res[f"gain_vs_{name}_CI95"] = list(_block_bootstrap_ci(np.abs(a - b) - np.abs(a - pred)))
    nz = (a != 0) & (pred != 0)
    res["direction_acc"] = float((np.sign(pred[nz]) == np.sign(a[nz])).mean())
    res["share_up_actual"] = float((a > 0).mean())
    res["spearman"] = float(spearmanr(pred, a).statistic)
    rng = np.random.default_rng(seed)
    perm = []
    for _ in range(n_perm):
        yp = np.roll(y, int(rng.integers(len(y) // 10, len(y) - len(y) // 10)))
        p2, b2, ok2 = _predict(valid, idx, sims, cut, yp)
        a2 = yp[valid][ok2]
        perm.append(1 - mae(a2 - p2[ok2]) / mae(a2 - b2[ok2]))
    res["perm_p_value_vs_base_rate"] = float((1 + np.sum(np.array(perm) >= res["skill_vs_base_rate"])) / (1 + n_perm))
    return res


def run(path, gaps=(7, 30, 90)):
    df, meta = load_library(path)
    V = TfidfVectorizer(stop_words="english", min_df=2, sublinear_tf=True).fit_transform(df["text"]).toarray().astype(np.float32)
    out = {"n_events": len(df), "date_range": [str(df.date.min().date()), str(df.date.max().date())], "results": {}}
    for o in SERIES:
        out["results"][o] = {f"gap{g}": evaluate_outcome(df, V, o, g) for g in gaps}
    out["descriptive"] = {
        "mean_abs_1w_return_by_tier": {int(t): {o: float(g[o].abs().mean()) for o in SERIES} | {"n": int(len(g))} for t, g in df.groupby("tier")},
        "mean_1w_return_by_category": {c: {o: float(g[o].mean()) for o in SERIES} | {"n": int(len(g))} for c, g in df.groupby("category")}}
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--file", required=True)
    r = run(ap.parse_args().file)
    config.ARTIFACTS.mkdir(exist_ok=True)
    (config.ARTIFACTS / "news_library_eval.json").write_text(json.dumps(r, indent=2))
    print(json.dumps(r["descriptive"], indent=1))
    for o, by in r["results"].items():
        for g, m in by.items():
            print(f"{o:6s} {g:6s} n={m['n_scored']:3d} MAE knn={m['MAE_knn']:.2f} zero={m['MAE_zero']:.2f} base={m['MAE_base_rate']:.2f} cat={m['MAE_category']:.2f} | "
                  f"skill vs zero {m['skill_vs_zero']:+.3f} base {m['skill_vs_base_rate']:+.3f} cat {m['skill_vs_category']:+.3f} | "
                  f"dir {m['direction_acc']:.2f} rho {m['spearman']:+.2f} p {m['perm_p_value_vs_base_rate']:.3f}")
