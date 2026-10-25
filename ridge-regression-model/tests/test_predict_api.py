import pandas as pd
import pytest
from fastapi.testclient import TestClient
import src.train as train
import src.predict as predict_mod
import src.evaluate_new as evaluate_new
import service.main as service_main
from service.main import app


@pytest.fixture()
def trained(tmp_path, monkeypatch, synthetic_csv):
    for mod in (train, predict_mod, evaluate_new):
        monkeypatch.setattr(mod, "ARTIFACTS", tmp_path)
    monkeypatch.setattr(train, "REPORTS", tmp_path)
    train.run(horizons=(7,), data_path=synthetic_csv)
    return tmp_path


def test_predict_contract(trained, wide):
    out = predict_mod.predict(7, wide=wide)
    assert 0 < out["low"] <= out["high"]
    assert out["interval"]["nominal_coverage"] == 0.8
    assert out["interval"]["evaluation_rows"] > 0
    stale_date = wide["mgo"].dropna().index.max() + pd.Timedelta(days=8)
    with pytest.raises(ValueError, match="target date has passed"):
        predict_mod.predict(7, as_of=stale_date, wide=wide)
    assert out["evidence"] in {"weak", "no_edge"}          # never 'supported' before a forward test
    assert out["unit"] == "USD/metric tonne" and out["quote_age_days"] >= 0
    assert len(out["top_drivers"]) == 5
    assert all(set(driver) == {"feature", "contribution"} for driver in out["top_drivers"])
    assert [abs(driver["contribution"]) for driver in out["top_drivers"]] == sorted(
        [abs(driver["contribution"]) for driver in out["top_drivers"]],
        reverse=True,
    )

    meta, model = predict_mod._load("7d")
    p = predict_mod.prepare(wide)
    origin = p.mgo.index[-1]
    X = predict_mod.origin_features(p, [origin])[meta["features"]]
    expected_return = float(model.predict(X)[0]) * meta["gamma"]
    ridge = model.named_steps["ridgecv"]
    intercept = ridge.intercept_ * meta["gamma"]
    all_drivers = predict_mod._top_drivers(model, X, meta["gamma"], limit=len(X.columns))
    assert sum(driver["contribution"] for driver in all_drivers) + intercept == pytest.approx(
        expected_return,
        abs=1e-10,
    )


def test_nowcast_statuses(trained, wide):
    last = wide["mgo"].dropna().index.max()
    obs = predict_mod.nowcast(last, wide=wide)
    assert obs["status"] == "observed" and obs["estimate"] == obs["last_quote_price"]
    fresh = predict_mod.nowcast(last + pd.Timedelta(days=1), wide=wide)
    assert fresh["status"] == "carried_forward" and fresh["low"] is None and fresh["estimate"] == fresh["last_quote_price"]
    stale = predict_mod.nowcast(last + pd.Timedelta(days=4), wide=wide)
    assert stale["status"] == "estimated" and stale["low"] <= stale["estimate"] <= stale["high"]


def test_forward_test_scores_only_new_rows(tmp_path, monkeypatch, synthetic_csv, wide):
    for mod in (train, predict_mod, evaluate_new):
        monkeypatch.setattr(mod, "ARTIFACTS", tmp_path)
    monkeypatch.setattr(train, "REPORTS", tmp_path)
    df = pd.read_csv(synthetic_csv, parse_dates=["date"])
    cut = tmp_path / "market_observations.csv"
    df[df["date"] <= "2025-06-30"].to_csv(cut, index=False)
    train.run(horizons=(7,), data_path=cut, nowcast=False)
    s = evaluate_new.evaluate(7, wide)
    assert s is not None and s["n"] > 30 and "baselines" in s
    assert s["quantile_intervals"]["all"]["n"] == s["n"]
    assert s["frozen_through_target_date"] <= "2025-06-30"


def test_api_validation_and_shapes(monkeypatch):
    fake = {"horizon_days": 7, "as_of_date": "2026-10-06", "anchor_quote_date": "2026-10-06", "anchor_price": 1278.5,
            "quote_age_days": 0, "forecast": 1278.5, "low": 1300.0, "high": 1400.0, "unit": "USD/metric tonne",
            "evidence": "no_edge", "mae_skill_vs_persistence": 0.0, "backtest_rows": 64, "model_version": "test",
            "top_drivers": [{"feature": "gasoil_ret5", "contribution": 0.01}]}
    fake.update(target_date="2026-10-13", raw_q10_price=1300.0, raw_q90_price=1400.0,
                interval={"method": "split_conformal_quantile", "nominal_coverage": .8,
                          "empirical_coverage": .75, "evaluation_rows": 40,
                          "evaluation_scope": "chronological holdout", "baseline_coverage": .8,
                          "baseline_mean_width": 150.0, "mean_width": 140.0,
                          "limitations": "Experimental."})
    now = {"as_of_date": "2026-10-08", "status": "carried_forward", "last_quote_date": "2026-10-07", "last_quote_price": 1280.0,
           "gap_days": 1, "estimate": 1280.0, "low": None, "high": None, "unit": "USD/metric tonne", "evidence": "weak",
           "mae_skill_vs_persistence": 0.1, "backtest_rows": 199, "model_version": "test"}
    monkeypatch.setattr(service_main, "predict", lambda h, d=None: fake)
    monkeypatch.setattr(service_main, "nowcast", lambda d=None: now)
    c = TestClient(app)
    assert c.get("/health").json() == {"status": "ok"}
    assert c.post("/predict", json={"horizon_days": 5}).status_code == 422
    r = c.post("/predict", json={"horizon_days": 7}).json()
    assert r["forecast"] < r["low"] <= r["high"]  # independent Ridge point is allowed outside
    assert r["interval"]["empirical_coverage"] == .75
    assert r["interval"]["evaluation_rows"] == 40
    assert r["top_drivers"] == [{"feature": "gasoil_ret5", "contribution": 0.01}]
    n = c.post("/nowcast", json={}).json()
    assert n["status"] == "carried_forward" and n["low"] is None

def test_historical_inference_rejected(trained, wide):
    with pytest.raises(ValueError, match="predates"):
        predict_mod.predict(7, as_of="2025-06-30", wide=wide)


def test_missing_or_incompatible_quantile_artifact(trained, wide):
    import joblib
    path = trained / "quantile_7d.joblib"
    bundle = joblib.load(path)
    bundle["version"] = 999
    joblib.dump(bundle, path)
    with pytest.raises(predict_mod.IntervalArtifactUnavailable):
        predict_mod.predict(7, wide=wide)
    path.unlink()
    with pytest.raises(FileNotFoundError):
        predict_mod.predict(7, wide=wide)


def test_missing_artifact_api_is_unavailable(monkeypatch):
    def missing(*args):
        raise predict_mod.IntervalArtifactUnavailable("Retrain")
    monkeypatch.setattr(service_main, "predict", missing)
    assert TestClient(app).post("/predict", json={"horizon_days": 7}).status_code == 503
