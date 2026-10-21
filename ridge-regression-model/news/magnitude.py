"""Do the event metrics (significance, market_sensitivity, ...) track the SIZE of the price move that follows?

The catalogue gives magnitude-type scores but no direction, so the outcome is the absolute 7-day move of
Brent / gasoil / Dubai / MGO after the event day, and the test asks whether a metric adds information BEYOND
how volatile the market already was (trailing volatility). Descriptive evidence only.

    python -m news.magnitude --pages pages/p1.json pages/p2.json
"""
import argparse, glob, json
import numpy as np
import pandas as pd
from scipy.stats import rankdata
from . import config

METRICS = ["significance", "confidence", "magnitude", "systemic_importance", "propagation_potential",
           "market_sensitivity", "goldstein_scale"]


def flatten_catalogue(pages) -> pd.DataFrame:
    """pages: list of API responses ({"data": [...]}). One row per event."""
    rows = []
    for page in pages:
        for e in page.get("data", []):
            m = e.get("metrics") or {}
            rows.append({"id": e.get("id"), "event_date": e.get("event_date"), "title": e.get("title", ""),
                         "summary": e.get("summary", ""), "category": e.get("category"), "domain": e.get("domain"),
                         "country": (e.get("geo") or {}).get("country"),
                         **{k: m.get(k) for k in METRICS + ["article_count"]}})
    df = pd.DataFrame(rows).drop_duplicates("id")
    df["event_date"] = pd.to_datetime(df["event_date"])
    return df.sort_values("event_date").reset_index(drop=True)


def daily_signal(events: pd.DataFrame, metrics=("significance", "market_sensitivity", "magnitude")) -> pd.DataFrame:
    """One row per event day. Several events on one day are collapsed (max and mean), so one story is not counted many times."""
    g = events.groupby("event_date")
    out = pd.DataFrame({"n_events": g.size()})
    for m in metrics:
        out[f"{m}_max"], out[f"{m}_mean"] = g[m].max(), g[m].mean()
    return out.reset_index()


def abs_moves(prepared, dates, horizon=7, vol_window=20, mgo_tol=3) -> pd.DataFrame:
    """Absolute log move from the close of the event day to `horizon` days later, plus trailing volatility
    (known on the event day) as the control. MGO uses observed quotes only; its control is gasoil volatility."""
    dates = pd.DatetimeIndex(dates)
    D = prepared.daily
    out = pd.DataFrame({"event_date": dates})
    for c in ("brent", "gasoil", "dubai"):
        end = D[c].reindex(dates + pd.Timedelta(days=horizon)).values
        out[f"abs_{c}"] = np.abs(np.log(end / D[c].reindex(dates).values))
        out[f"vol_{c}"] = (np.log(D[c]).diff().rolling(vol_window).std().reindex(dates).values) * np.sqrt(horizon)
    q = prepared.mgo
    base = pd.Series(np.nan, index=dates); tgt = pd.Series(np.nan, index=dates)
    pos = q.index.searchsorted(dates, side="right") - 1           # last quote on or before the event day
    ok = (pos >= 0)
    ok[ok] = (dates[ok] - q.index[pos[ok]]).days <= mgo_tol
    base[ok] = q.values[pos[ok]]
    want = dates + pd.Timedelta(days=horizon)
    j = q.index.get_indexer(want, method="nearest")
    good = ok & (np.abs((q.index[j] - want).days) <= mgo_tol) & (q.index[j] > q.index[np.where(ok, pos, 0)])
    tgt[good] = q.values[j[good]]
    out["abs_mgo"] = np.abs(np.log(tgt.values / base.values))
    out["vol_mgo"] = out["vol_gasoil"]
    return out


def _partial_corr(x, y, z):
    rx, ry, rz = rankdata(x), rankdata(y), rankdata(z)
    def resid(a, b):
        slope, icpt = np.polyfit(b, a, 1)
        return a - (slope * b + icpt)
    ex, ey = resid(rx, rz), resid(ry, rz)
    return float(np.corrcoef(ex, ey)[0, 1])


def check_metric(df, metric, outcome, vol, n_perm=1000, seed=42, min_n=40):
    """Partial rank correlation of metric with the absolute move, controlling for trailing volatility.
    p-value: the metric series is circularly shifted against the outcomes (keeps both series' time structure)."""
    d = df.dropna(subset=[metric, outcome, vol]).sort_values("event_date")
    n = len(d)
    if n < min_n:
        return {"status": "too_few_event_days", "n": n}
    x, y, z = d[metric].to_numpy(float), d[outcome].to_numpy(float), d[vol].to_numpy(float)
    obs = _partial_corr(x, y, z)
    rng = np.random.default_rng(seed)
    null = np.array([_partial_corr(np.roll(x, int(rng.integers(5, n - 5))), y, z) for _ in range(n_perm)])
    half = n // 2
    bins = pd.qcut(d[metric].rank(method="first"), 5, labels=False)
    lift = d.groupby(bins)[outcome].mean() / d[outcome].mean()
    res = {"status": "ok", "n": n, "partial_rho": obs, "raw_rho": float(np.corrcoef(rankdata(x), rankdata(y))[0, 1]),
           "p_value": float((1 + np.sum(null >= obs)) / (1 + n_perm)),
           "rho_first_half": _partial_corr(x[:half], y[:half], z[:half]), "rho_second_half": _partial_corr(x[half:], y[half:], z[half:]),
           "lift_by_quintile": [round(float(v), 2) for v in lift.values], "post_hoc": True}
    res["evidence"] = "weak" if (obs > 0 and res["p_value"] < 0.05 and res["rho_first_half"] > 0 and res["rho_second_half"] > 0) else "no_edge"
    return res


def run(events, prepared, horizon=7, metrics=("significance_max", "market_sensitivity_max", "magnitude_max")):
    sig = daily_signal(events)
    df = sig.merge(abs_moves(prepared, sig["event_date"], horizon), on="event_date")
    return {f"{m}->{o}": check_metric(df, m, f"abs_{o}", f"vol_{o}") for m in metrics for o in ("brent", "gasoil", "mgo")}


if __name__ == "__main__":
    from src.data_loader import load_wide
    from src.feature_engineering import prepare
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", nargs="+", required=True); ap.add_argument("--horizon", type=int, default=7)
    a = ap.parse_args()
    pages = [json.load(open(p, encoding="utf-8")) for pat in a.pages for p in glob.glob(pat)]
    ev = flatten_catalogue(pages)
    print(f"{len(ev)} events, {ev.event_date.min().date()} to {ev.event_date.max().date()}")
    out = run(ev, prepare(load_wide()), a.horizon)
    config.ARTIFACTS.mkdir(exist_ok=True)
    (config.ARTIFACTS / "news_magnitude.json").write_text(json.dumps(out, indent=2, default=str))
    for k, v in out.items():
        print(k, v if v["status"] != "ok" else {x: (round(y, 3) if isinstance(y, float) else y) for x, y in v.items() if x != "post_hoc"})
