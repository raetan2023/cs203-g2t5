import numpy as np
import pandas as pd
from src.feature_engineering import prepare, nowcast_features, NOW_FEATURES
from src.nowcast import build_nowcast_table, gated, gap_breakdown


def test_nowcast_features_ignore_quote_at_origin_and_later(wide):
    p = prepare(wide)
    q = p.mgo.index
    i = len(q) // 2
    origin, prev = q[i], q[i - 1]
    base = nowcast_features(p, [origin], [prev]).iloc[0]
    w2 = wide.copy()
    w2.loc[w2.index >= origin, ["gasoil", "brent", "dubai", "usd"]] *= 5.0
    w2.loc[w2.index >= origin, "mgo"] *= 5.0
    changed = nowcast_features(prepare(w2), [origin], [prev]).iloc[0]
    np.testing.assert_allclose(base.values, changed.values, rtol=1e-9)


def test_nowcast_table_targets(wide):
    p = prepare(wide)
    t = build_nowcast_table(p)
    assert len(t) > 100 and not t[NOW_FEATURES].isna().any().any()
    np.testing.assert_allclose(t["y"], np.log(t["mgo_target"] / t["mgo_t"]))
    assert (t["gap_days"] >= 1).all()


def test_gating_carries_fresh_quotes_forward(wide):
    t = build_nowcast_table(prepare(wide)).iloc[:60].copy()
    t["pred_price"] = t["mgo_t"] * 1.10
    g = gated(t, "pred_price", min_gap=2)
    fresh = g["gap_days"] < 2
    assert fresh.any() and (g.loc[fresh, "pred_price"] == g.loc[fresh, "mgo_t"]).all()
    assert (g.loc[~fresh, "pred_price"] > g.loc[~fresh, "mgo_t"]).all()
    t["gasoil_transfer_price"] = t["mgo_t"]
    assert set(gap_breakdown(t)) <= {"1d", "2-6d", "7d+"}