import numpy as np
import pandas as pd
from src.feature_engineering import prepare
from src.labels import build_table
from src.backtest import walk_forward
from src.shrinkage import choose_gamma, apply_gamma
from src.metrics import score, score_splits
from src.predict import evidence_label


def test_gamma_ignores_holdout_rows(wide):
    wf = walk_forward(build_table(prepare(wide), 7))
    g = choose_gamma(wf)
    cut = pd.Timestamp("2025-06-30")
    wf2 = wf.copy()
    hold = wf2["origin"] >= cut
    wf2.loc[hold, "mgo_target"] *= 3.0           # corrupt the holdout outcomes
    assert choose_gamma(wf2) == g


def test_gamma_falls_back_to_zero_with_too_little_evidence(wide):
    wf = walk_forward(build_table(prepare(wide), 7)).iloc[:10]
    assert choose_gamma(wf) == 0.0


def test_apply_gamma_scales_prediction(wide):
    wf = walk_forward(build_table(prepare(wide), 7))
    out = apply_gamma(wf, 0.5)
    np.testing.assert_allclose(out["pred_ret"], 0.5 * wf["pred_ret"])
    assert "pred_ret_raw" in out


def test_score_has_baselines_and_zero_gamma_equals_persistence(wide):
    wf = apply_gamma(walk_forward(build_table(prepare(wide), 7)), 0.0)
    wf["pred_price"] = wf["mgo_t"] * np.exp(wf["pred_ret"])
    s = score(wf)
    assert {"persist", "drift", "sma5", "sma10", "ema10"} <= set(s["baselines"])
    assert abs(s["baselines"]["persist"]["MAE_skill"]) < 1e-12
    assert set(score_splits(wf)) >= {"all"}


def _bt(skills, lows, post_hoc):
    return {"baselines": {k: {"MAE_skill": s, "paired_gain_CI95": [lo, 9.0]}
                          for k, s, lo in zip(("persist", "drift", "sma5"), skills, lows)}, "post_hoc": post_hoc}


def test_evidence_labels():
    assert evidence_label(_bt((0.0, 0.1, 0.1), (0, 1, 1), False)) == "no_edge"      # ties persistence
    assert evidence_label(_bt((0.2, -0.1, 0.1), (1, 1, 1), False)) == "no_edge"     # loses to drift
    assert evidence_label(_bt((0.2, 0.1, 0.1), (-1, 1, 1), False)) == "weak"        # CI includes zero
    assert evidence_label(_bt((0.2, 0.1, 0.1), (1, 1, 1), True)) == "weak"          # tuned on the data scored
    assert evidence_label(_bt((0.2, 0.1, 0.1), (1, 1, 1), False)) == "supported"