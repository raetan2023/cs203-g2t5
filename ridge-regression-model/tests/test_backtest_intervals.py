import numpy as np
from src.feature_engineering import prepare
from src.labels import build_table
from src.backtest import walk_forward
from src.intervals import add_range


def test_walk_forward_has_purged_drift_baseline(wide):
    t = build_table(prepare(wide), 7)
    wf = walk_forward(t)
    assert len(wf) == len(t) - 50
    first = wf.iloc[0]
    known = t[t["target_date"] < first["origin"]].iloc[:50]
    assert np.isclose(first["drift_ret"], known["y"].mean())


def test_symmetric_range_and_causality(wide):
    t = build_table(prepare(wide), 7)
    wf = walk_forward(t)
    res, cov, n = add_range(wf)
    ok = res.low.notna()
    assert n > 10 and (res.low[ok] <= res.pred_price[ok]).all() and (res.pred_price[ok] <= res.high[ok]).all()
    wf2 = wf.copy()
    wf2.loc[len(wf2) - 1, "y"] += 0.5          # a later outcome must not change an earlier range
    res2, _, _ = add_range(wf2)
    i = len(wf) - 2
    assert np.isclose(res.low[i], res2.low[i]) and np.isclose(res.high[i], res2.high[i])


def test_flat_range_also_available(wide):
    wf = walk_forward(build_table(prepare(wide), 7))
    res, cov, n = add_range(wf, scaled=False)
    assert n > 10 and 0 <= cov <= 1