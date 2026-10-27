"""Decision-day chronology and paired news-error quantile checks (no network)."""
import numpy as np
import pandas as pd
import pytest
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
import src.daily_model as daily
from src.feature_engineering import FEATURES

@pytest.fixture(autouse=True)
def fast_central(monkeypatch):
    monkeypatch.setattr(daily, "make_model", lambda: make_pipeline(StandardScaler(), Ridge(alpha=1.)))

def make_wide(n=210):
    rng = np.random.default_rng(73)
    dates = pd.date_range("2025-01-01", periods=n, freq="D")
    oil = 80 * np.exp(np.cumsum(rng.normal(0, .008, n)))
    return pd.DataFrame({"gasoil": oil, "brent": oil*.9, "dubai": oil*.85,
        "usd": 100+np.arange(n)*.01, "mgo": oil*10*np.exp(rng.normal(0,.01,n))}, index=dates)

def make_oos(n=90):
    rng = np.random.default_rng(72)
    dates = pd.date_range("2025-01-01", periods=n)
    frame = pd.DataFrame(rng.normal(0,.1,(n,len(FEATURES))),columns=FEATURES)
    frame["origin"], frame["target_date"] = dates, dates+pd.Timedelta(days=3)
    frame["mgo_t"], frame["central"] = 800.,810.
    frame["error"] = rng.normal(0,.025,n)
    frame["mgo_target"] = frame.central*np.exp(frame.error)
    frame["y"] = np.log(frame.mgo_target/frame.mgo_t)
    frame["news_constant"] = 0.
    return frame

def test_decision_features_exclude_same_day_and_future_mgo():
    wide=make_wide(); origin=wide.index[150]
    original=daily.decision_features(wide,[origin])
    changed=wide.copy(); changed.loc[changed.index>=origin,"mgo"]*=3
    pd.testing.assert_frame_equal(original,daily.decision_features(changed,[origin]))
    assert original.anchor_date.iloc[0] == origin-pd.Timedelta(days=1)
    assert original.mgo_t.iloc[0] == wide.mgo.loc[origin-pd.Timedelta(days=1)]

def test_exact_targets_and_strict_training_cutoff():
    wide=make_wide(); cutoff=wide.index[-1]
    t=daily.daily_table(wide,7,cutoff)
    assert len(t)>50 and ((t.target_date-t.origin).dt.days==7).all()
    assert (t.target_date<cutoff).all() and t.target_date.is_unique
    assert (t.anchor_date<t.origin).all()
    assert t.mgo_target.to_numpy()==pytest.approx(wide.mgo.reindex(pd.DatetimeIndex(t.target_date)).to_numpy())

def test_central_training_and_gamma_cannot_see_later_labels():
    table=make_oos(85); first=daily.central_oos(table,min_train=10)
    changed=table.copy(); changed.loc[70:,"y"]+=.8; changed.loc[70:,"mgo_target"]*=np.exp(.8)
    second=daily.central_oos(changed,min_train=10)
    before=first.origin<changed.origin.iloc[70]
    cols=["origin","central","gamma","pred_ret_raw"]
    pd.testing.assert_frame_equal(first.loc[before,cols],second.loc[before,cols])
    assert (first.gamma.iloc[:20]==0).all()

def test_news_join_requires_exact_previous_day_complete_and_schema():
    rows=make_oos(4); day=(rows.origin.iloc[0]-pd.Timedelta(days=1)).date().isoformat()
    archives={day:{"status":"complete","features":{"news_constant":0.},
        "classification_version":"v2","classifier_id":"fixed-provider-model"}}
    joined=daily.attach_news(rows,archives,["news_constant"])
    assert len(joined)==1 and joined.news_date.iloc[0]==day
    archives[day]["status"]="incomplete"
    assert daily.attach_news(rows,archives,["news_constant"]).empty
    archives[day]["status"]="complete"
    with pytest.raises(ValueError,match="schema"):
        daily.attach_news(rows,archives,["news_different"])

def test_constant_news_matches_market_and_identical_calibration():
    rows=make_oos(85); models=daily.fit_error_models(rows,["news_constant"])
    for key in ("calibration_start","proper_training_cutoff"):
        assert models["news"][key]==models["market"][key]
    bounds=daily.error_bounds(models,rows.iloc[[-1]])
    assert bounds.low.iloc[0]==pytest.approx(bounds.market_low.iloc[0],abs=1e-7)
    assert bounds.high.iloc[0]==pytest.approx(bounds.market_high.iloc[0],abs=1e-7)
    assert 0<bounds.low.iloc[0]<=bounds.high.iloc[0]

def test_error_walk_forward_is_paired_and_future_independent():
    rows=make_oos(62); first,report=daily.evaluate_errors(rows,["news_constant"])
    assert report["evaluation_rows"]>0
    assert report["all"]["n"]==report["market_only"]["all"]["n"]==len(first)
    changed=rows.copy(); changed.loc[61,"error"]+=1.; changed.loc[61,"mgo_target"]*=np.exp(1.)
    second,_=daily.evaluate_errors(changed,["news_constant"])
    cols=["low","high","baseline_low","baseline_high","market_low","market_high"]
    pd.testing.assert_frame_equal(first[cols],second[cols])
    assert report["all"]["calibrated"]["coverage"]==report["market_only"]["all"]["calibrated"]["coverage"]

def test_calibration_error_labels_do_not_fit_estimators():
    rows=make_oos(85); models=daily.fit_error_models(rows,["news_constant"])
    changed=rows.copy(); changed.loc[65:,"error"]+=.5; changed.loc[65:,"mgo_target"]*=np.exp(.5)
    again=daily.fit_error_models(changed,["news_constant"])
    for name in ("news","market"):
        x=rows.iloc[[-1]][models[name]["features"]]
        for side in ("lower_model","upper_model"):
            assert models[name][side].predict(x)==pytest.approx(again[name][side].predict(x))
        assert again[name]["q_correction"]>models[name]["q_correction"]

def test_insufficient_history_cannot_become_ready():
    with pytest.raises(ValueError,match="Insufficient"):
        daily.train_horizon(make_wide(45),{},["news_constant"],7,"2025-03-01")


def test_training_cohort_matches_serving_anchor_freshness():
    wide = make_wide()
    wide.loc[wide.index[120:140], "mgo"] = np.nan
    t = daily.daily_table(wide, 7, wide.index[-1])
    assert ((t.origin - t.anchor_date).dt.days <= 7).all()
    assert len(t) > 50


def test_classifier_identity_checks_only_joined_complete_archives(monkeypatch):
    rows = make_oos(85)
    rows["pred_ret_raw"] = 0.
    monkeypatch.setattr(daily, "daily_table", lambda *args: rows)
    monkeypatch.setattr(daily, "central_oos", lambda *args: rows)
    monkeypatch.setattr(daily, "evaluate_errors", lambda *args: (None, {"evaluation_rows": 0}))
    archives = {}
    for origin in rows.origin:
        day = (origin - pd.Timedelta(days=1)).date().isoformat()
        archives[day] = {"status": "complete", "features": {"news_constant": 0.},
                         "classification_version": "v2", "classifier_id": "provider:model-a"}
    # Unrelated first archive must not decide the model's classifier identity.
    archives = {"1990-01-01": {"status": "incomplete", "classification_version": "old",
                              "classifier_id": "unused"}, **archives}
    bundle, _ = daily.train_horizon(make_wide(), archives, ["news_constant"],
                                    7, "2026-01-01", min_evaluation=0)
    assert bundle["classifier_id"] == "provider:model-a"
    next(v for v in archives.values() if v["status"] == "complete")["classifier_id"] = "provider:model-b"
    with pytest.raises(ValueError, match="classifier versions differ"):
        daily.train_horizon(make_wide(), archives, ["news_constant"],
                            7, "2026-01-01", min_evaluation=0)


def test_predict_accepts_latest_older_news_and_rejects_future_or_stale_windows():
    from news.daily_features import build_daily_payload
    wide = make_wide()
    origin = wide.index[-1] + pd.Timedelta(days=1)
    table = daily.daily_table(wide, 7, origin)
    model = daily.make_model().fit(table[FEATURES], table.y)
    bundle = {"version": 1, "horizon_days": 7, "central_model": model, "gamma": 0.,
              "models": daily.fit_error_models(make_oos(), ["news_constant"]),
              "news_features": ["news_constant"], "trained_through_target_date": str(table.target_date.max().date()),
              "classification_version": "v2", "classifier_id": "test-model",
              "evaluation": {"all": {"n": 40, "calibrated": {"coverage": .8, "mean_width": 100},
                                      "baseline": {"coverage": .8, "mean_width": 120}}}}
    now = origin.tz_localize("UTC").to_pydatetime()
    news = build_daily_payload((origin-pd.Timedelta(days=3)).date(), [], complete=True,
        retrieved_at=now, classifier_id="test-model")
    news["features"]["news_constant"] = 0.
    result = daily.predict_day(bundle, wide, news, origin, now=now)
    assert result["status"] == "ready" and result["low"] <= result["high"]
    news["end"] = (origin+pd.Timedelta(days=1)).isoformat() + 'Z'
    with pytest.raises(ValueError, match="nonfuture"):
        daily.predict_day(bundle, wide, news, origin, now=now)
