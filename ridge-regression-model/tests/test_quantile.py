"""Focused tests for quantile chronology and the actual served interval rule."""
import json
import joblib
import numpy as np
import pandas as pd
import pytest
from src.quantile import (fit_quantile, predict_quantile, walk_forward_quantile,
                          summarize_quantile, _order_statistic)


def table(n=85):
    rng = np.random.default_rng(28)
    origin = pd.date_range("2025-01-01", periods=n, freq="D")
    x = rng.normal(size=n)
    y = 0.03 * x + rng.normal(0, 0.02, n)
    return pd.DataFrame({"origin": origin, "target_date": origin + pd.Timedelta(days=3),
                         "x": x, "y": y, "mgo_t": np.full(n, 800.),
                         "mgo_target": 800 * np.exp(y)})


def test_exact_finite_sample_order_statistic():
    assert _order_statistic(np.arange(20)) == 16  # seventeenth, not interpolated
    with pytest.raises(ValueError, match="Insufficient"):
        _order_statistic([1, 2])


def test_split_purges_overlapping_targets_and_never_fits_calibration_labels():
    t = table()
    bundle = fit_quantile(t, ["x"])
    assert bundle["proper_training_rows"] == 62  # 65 prefix minus three overlapping labels
    assert pd.Timestamp(bundle["proper_training_cutoff"]) < pd.Timestamp(bundle["calibration_start"])
    changed = t.copy()
    changed.loc[changed.index[-20:], "y"] += .5
    other = fit_quantile(changed, ["x"])
    X = t.iloc[[-1]]
    assert bundle["lower_model"].predict(X[["x"]]) == pytest.approx(other["lower_model"].predict(X[["x"]]))
    assert bundle["upper_model"].predict(X[["x"]]) == pytest.approx(other["upper_model"].predict(X[["x"]]))
    assert other["q_correction"] > bundle["q_correction"]


def test_bounds_roundtrip_and_crossing_repair(tmp_path):
    t = table()
    bundle = fit_quantile(t, ["x"])
    # Swapping fitted models deliberately creates crossed predictions.
    bundle["lower_model"], bundle["upper_model"] = bundle["upper_model"], bundle["lower_model"]
    out = predict_quantile(bundle, t, t.mgo_t)
    assert np.isfinite(out.to_numpy()).all()
    assert (out.raw_low <= out.raw_high).all()
    assert (out.low <= out.raw_low).all() and (out.high >= out.raw_high).all()
    assert (out.low > 0).all()
    path = tmp_path / "quantile.joblib"
    joblib.dump(bundle, path)
    pd.testing.assert_frame_equal(out, predict_quantile(joblib.load(path), t, t.mgo_t))


def test_walk_forward_is_unchanged_by_future_outcomes():
    t = table(68)
    res = walk_forward_quantile(t, ["x"])
    assert len(res) > 0
    assert (pd.to_datetime(res.trained_through_target_date) < res.origin).all()
    changed = t.copy()
    changed.loc[changed.index[-1], ["y", "mgo_target"]] = [1., 800 * np.exp(1)]
    again = walk_forward_quantile(changed, ["x"])
    pd.testing.assert_frame_equal(res[["low", "high", "baseline_low", "baseline_high"]],
                                  again[["low", "high", "baseline_low", "baseline_high"]])


def test_insufficient_data_and_invalid_values_fail_explicitly():
    t = table(52)
    with pytest.raises(ValueError, match="after target-date purge"):
        fit_quantile(t, ["x"])
    t = table()
    t.loc[0, "x"] = np.inf
    with pytest.raises(ValueError, match="finite"):
        fit_quantile(t, ["x"])
    t = table()
    bundle = fit_quantile(t, ["x"])
    with pytest.raises(ValueError, match="positive anchor"):
        predict_quantile(bundle, t.iloc[:1], [0])


def test_report_uses_paired_rows_and_json_safe_empty_splits():
    t = table(64)
    res = walk_forward_quantile(t, ["x"])
    report = summarize_quantile(res)
    assert report["all"]["n"] == len(res)
    for name in ("raw", "calibrated", "baseline"):
        metrics = report["all"][name]
        assert metrics["coverage"] + metrics["lower_tail_rate"] + metrics["upper_tail_rate"] == pytest.approx(1)
        assert metrics["interval_score"] >= metrics["mean_width"]
    assert report["holdout"]["n"] == 0
    assert report["holdout"]["calibrated"]["coverage"] is None
    json.dumps(report, allow_nan=False)
    empty = summarize_quantile(walk_forward_quantile(t.iloc[:20], ["x"]))
    assert empty["all"]["n"] == 0
    json.dumps(empty, allow_nan=False)
