import numpy as np
from src.feature_engineering import prepare
from src.labels import build_table
from src.backtest import walk_forward
from src.intervals import add_range


def test_walk_forward_and_causal_intervals(wide):
    t = build_table(prepare(wide), 7)
    wf = walk_forward(t)
    assert len(wf) == len(t) - 50
    res, cov, n = add_range(wf)
    ok = res.low.notna()
    assert n > 10 and (res.low[ok] <= res.pred_price[ok]).all() and (res.pred_price[ok] <= res.high[ok]).all()
    # changing a LATER row's outcome must not change an earlier interval
    wf2 = wf.copy()
    wf2.loc[len(wf2) - 1, "y"] += 0.5
    res2, _, _ = add_range(wf2)
    i = len(wf) - 2
    assert np.isclose(res.low[i], res2.low[i], equal_nan=True) and np.isclose(res.high[i], res2.high[i], equal_nan=True)
