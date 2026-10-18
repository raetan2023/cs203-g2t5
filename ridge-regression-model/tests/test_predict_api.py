import pytest
import pandas as pd
from fastapi.testclient import TestClient
import src.train as train
import src.predict as predict_mod
from service.main import app
import service.main as service_main


@pytest.fixture()
def trained(tmp_path, monkeypatch, synthetic_csv):
    for mod in (train, predict_mod):
        monkeypatch.setattr(mod, "ARTIFACTS", tmp_path)
    monkeypatch.setattr(train, "REPORTS", tmp_path)
    train.run(horizons=(7,), data_path=synthetic_csv)
    return tmp_path


def test_predict_contract(trained, wide):
    out = predict_mod.predict(7, wide=wide)
    assert out["low"] <= out["forecast"] <= out["high"]
    assert out["evidence"] in {"supported", "weak", "no_edge"}
    assert out["unit"] == "USD/metric tonne" and out["quote_age_days"] >= 0
    assert "nowcast_price" in out and "nowcast_return" in out


def test_nowcast_fresh_and_stale(wide):
    p = predict_mod.prepare(wide)
    last_quote_date = p.mgo.index[-1]
    
    # Fresh quote
    fresh = predict_mod.nowcast(as_of=last_quote_date, wide=wide)
    assert fresh["quote_age_days"] == 0
    assert fresh["nowcast_price"] == fresh["anchor_price"]
    assert fresh["status"] == "fresh_quote"
    assert fresh["gasoil_move_since_quote"] == 0.0

    # Stale quote (5 days after latest quote)
    future_date = last_quote_date + pd.Timedelta(days=5)
    stale = predict_mod.nowcast(as_of=future_date, wide=wide)
    assert stale["quote_age_days"] == 5
    assert stale["status"] == "nowcasted"
    assert stale["nowcast_price"] > 0


def test_predict_stale_anchor_uses_nowcast(trained, wide):
    p = predict_mod.prepare(wide)
    last_quote_date = p.mgo.index[-1]
    future_date = last_quote_date + pd.Timedelta(days=4)
    out = predict_mod.predict(7, as_of=future_date, wide=wide)
    assert out["quote_age_days"] == 4
    assert out["nowcast_price"] > 0
    assert out["low"] <= out["forecast"] <= out["high"]


def test_api_validation_and_shape(monkeypatch):
    fake = {"horizon_days": 7, "as_of_date": "2026-10-06", "anchor_quote_date": "2026-10-06", "anchor_price": 1278.5,
            "nowcast_price": 1278.5, "nowcast_return": 0.0,
            "quote_age_days": 0, "forecast": 1270.0, "low": 1200.0, "high": 1340.0, "unit": "USD/metric tonne",
            "evidence": "no_edge", "mae_skill_vs_persistence": -0.07, "backtest_rows": 114, "model_version": "test"}
    fake_nc = {"as_of_date": "2026-10-18", "anchor_quote_date": "2026-10-13", "anchor_price": 1278.0,
               "quote_age_days": 5, "gasoil_move_since_quote": 0.04, "nowcast_price": 1320.0, "nowcast_return": 0.04,
               "unit": "USD/metric tonne", "status": "nowcasted", "explanation": "test"}
    monkeypatch.setattr(service_main, "predict", lambda h, d=None: fake)
    monkeypatch.setattr(service_main, "nowcast", lambda d=None: fake_nc)
    c = TestClient(app)
    assert c.get("/health").json() == {"status": "ok"}
    assert c.post("/predict", json={"horizon_days": 5}).status_code == 422
    r = c.post("/predict", json={"horizon_days": 7})
    assert r.status_code == 200 and r.json()["low"] <= r.json()["forecast"] <= r.json()["high"]
    
    # Test nowcast endpoints
    r_nc_post = c.post("/nowcast", json={"as_of_date": "2026-10-18"})
    assert r_nc_post.status_code == 200 and r_nc_post.json()["nowcast_price"] == 1320.0
    r_nc_get = c.get("/nowcast")
    assert r_nc_get.status_code == 200 and r_nc_get.json()["nowcast_price"] == 1320.0

