"""Offline orchestration/storage boundary tests; fixtures are never market evidence."""
from datetime import date, datetime, timezone
import io
import json
import joblib
import pandas as pd
import pytest
from news.daily_features import build_daily_payload, save_archive
from src import daily_pipeline as pipeline

NOW = datetime(2026, 10, 27, 1, tzinfo=timezone.utc)  # Tuesday, Singapore morning


class Store:
    def __init__(self):
        self.published = []; self.archived = []; self.saved = []
    def archives(self): return {}
    def archive(self, payload): self.archived.append(payload)
    def latest_bundle(self): return {"id": "weekly", "created_at": "2026-10-26T00:17:00Z", "horizons": {}, "reports": {}}
    def publish(self, run, forecasts): self.published.append((run, forecasts))
    def save_bundle(self, bundle): self.saved.append(bundle)


def news(tmp_path):
    payload = build_daily_payload(date(2026, 10, 26), [], complete=True,
        retrieved_at=NOW, classification_version="v2", classifier_id="test-fixture")
    save_archive(payload, tmp_path / "news")
    return payload


def test_missing_news_publishes_complete_unavailable_batch(tmp_path):
    store = Store()
    run, forecasts = pipeline.run(tmp_path, fetch=False, client=store, now=NOW)
    assert len(store.published) == 1 and len(forecasts) == 3
    assert {f["horizon_days"] for f in forecasts} == {7, 14, 30}
    assert all(f["status"] == "unavailable" and "forecast" not in f for f in forecasts)
    assert run["payload"]["run_started_at"] == NOW.isoformat()
    assert "SUPABASE" not in json.dumps(forecasts)


def test_daily_inference_does_not_retrain_or_invent_news_evidence(tmp_path, monkeypatch):
    payload = news(tmp_path); store = Store()
    monkeypatch.setattr(pipeline, "market_snapshot", lambda *a, **k: pd.DataFrame({"mgo": [100.]}))
    monkeypatch.setattr(pipeline, "source_dates", lambda *a: {k: "2026-10-26" for k in ("mgo", "gasoil", "brent", "dubai", "usd")})
    monkeypatch.setattr(pipeline, "training_bundle", lambda *a: pytest.fail("Daily inference retrained"))
    run, forecasts = pipeline.run(tmp_path, fetch=False, client=store, now=NOW)
    assert run["model_version"] == "weekly"
    assert all(f["reason"] == "insufficient_or_incompatible_evidence" for f in forecasts)
    assert store.archived and store.published
    assert run["payload"]["news_feature_version"] == pipeline.feature_version(payload)


def test_manual_retraining_and_history_archive_publication(tmp_path, monkeypatch):
    news(tmp_path); store = Store()
    earlier = build_daily_payload(date(2026, 10, 25), [], complete=True,
        retrieved_at=NOW, classification_version="v2", classifier_id="test-fixture")
    save_archive(earlier, tmp_path / "news")
    monkeypatch.setattr(pipeline, "market_snapshot", lambda *a, **k: pd.DataFrame({"mgo": [100.]}))
    monkeypatch.setattr(pipeline, "source_dates", lambda *a: {k: "2026-10-26" for k in ("mgo", "gasoil", "brent", "dubai", "usd")})
    seen = []
    def train(wide, archives, origin, revision, now):
        seen.append(archives)
        return {"id": "new-weekly", "created_at": now.isoformat(), "reports": {}, "horizons": {}}
    monkeypatch.setattr(pipeline, "training_bundle", train)
    pipeline.run(tmp_path, fetch=False, client=store, now=NOW, retrain=True)
    assert len(seen) == 1 and set(seen[0]) == {"2026-10-25", "2026-10-26"}
    assert len(store.saved) == 1
    assert {a["news_date"] for a in store.archived} == {"2026-10-25", "2026-10-26"}


def test_before_utc_day_close_can_use_an_older_complete_archive(tmp_path, monkeypatch):
    store = Store()
    now = datetime(2026, 10, 26, 19, tzinfo=timezone.utc)  # Singapore next day
    payload = build_daily_payload(date(2026, 10, 25), [], complete=True,
        retrieved_at=now, classification_version="v2", classifier_id="test-fixture")
    save_archive(payload, tmp_path / "news")
    monkeypatch.setattr(pipeline, "market_snapshot", lambda *a, **k: pd.DataFrame({"mgo": [100.]}))
    monkeypatch.setattr(pipeline, "source_dates", lambda *a: {k: "2026-10-25" for k in ("mgo", "gasoil", "brent", "dubai", "usd")})
    _, forecasts = pipeline.run(tmp_path, fetch=False, client=store, now=now)
    assert all(f["reason"] == "insufficient_or_incompatible_evidence" for f in forecasts)


def test_snapshot_reuses_existing_identity_checks_and_rejects_unresolved_units(tmp_path):
    sources = pipeline.SOURCES
    importer = pipeline.ingestion_module()
    for source, (_, _, unit) in sources.items():
        provider = importer.SOURCES[source][1]
        payload = {"source": {"id": source, "provider": provider, "name": source},
                   "data": [{"date": "2026-10-26", "value": "100", "unit": unit,
                             "source": provider, "series": source}]}
        (tmp_path / f"{source}.json").write_text(json.dumps(payload))
    wide = pipeline.market_snapshot(tmp_path, fetch=False)
    assert set(wide) == {"mgo", "gasoil", "brent", "dubai", "usd"}
    path = tmp_path / "gasoil_singapore.json"
    payload = json.loads(path.read_text()); payload["data"][0]["unit"] = "source-defined"
    path.write_text(json.dumps(payload))
    with pytest.raises(ValueError, match="Unresolved"):
        pipeline.market_snapshot(tmp_path, fetch=False)


def test_supabase_publisher_uses_one_transactional_rpc_with_all_horizons():
    client = object.__new__(pipeline.Supabase)
    calls = []
    client.request = lambda method, path, **kwargs: calls.append((method, path, kwargs))
    values = [pipeline.unavailable(h, "missing", "No history") for h in (7, 14, 30)]
    client.publish({"id": "run"}, values)
    assert len(calls) == 1 and calls[0][1] == "/rest/v1/rpc/publish_forecast_run"
    assert calls[0][2]["json"]["forecasts_json"] == values


def test_storage_errors_do_not_echo_remote_body_or_credentials():
    class Response:
        ok = False; status_code = 403
        text = "secret-bearing diagnostic must not appear"
    class Session:
        def request(self, *a, **k): return Response()
    client = pipeline.Supabase("https://example.test", "test-fixture-not-a-key", Session())
    with pytest.raises(RuntimeError, match="HTTP 403") as error:
        client.request("GET", "/rest/v1/forecast_runs")
    assert "secret-bearing" not in str(error.value) and "test-fixture" not in str(error.value)


def test_workflow_is_opt_in_and_pins_daily_schedule():
    workflow = (pipeline.ROOT / ".github/workflows/daily-forecasts.yml").read_text()
    assert "17 0 * * *" in workflow and "DAILY_FORECASTS_ENABLED" in workflow
    assert "publish:" in workflow and "default: false" in workflow
    assert "contents: read" in workflow and "--retrain" in workflow


def test_latest_bundle_ignores_only_missing_manifest_not_storage_failure():
    class Response:
        def __init__(self, value=None, content=None): self.value = value; self.content = content
        def json(self): return self.value
    content = io.BytesIO(); joblib.dump({"test_only": True}, content)
    raw = content.getvalue()
    client = object.__new__(pipeline.Supabase)
    def request(method, path, **kwargs):
        if method == "POST": return Response([{"name": "orphan"}, {"name": "valid"}])
        if "orphan" in path: raise pipeline.SupabaseError(404)
        if path.endswith("manifest.json"):
            return Response({"created_at": "2026-10-26T00:00:00Z", "has_validated_horizon": True,
                             "path": "models/valid/bundle.joblib", "sha256": pipeline.digest(raw)})
        return Response(content=raw)
    client.request = request
    assert client.latest_bundle() == {"test_only": True}
    def denied(*args, **kwargs): raise pipeline.SupabaseError(403)
    client.request = denied
    with pytest.raises(pipeline.SupabaseError): client.latest_bundle()


def test_complete_remote_archive_replaces_incomplete_local(tmp_path, monkeypatch):
    complete = news(tmp_path)
    incomplete = build_daily_payload(date(2026, 10, 26), [], complete=False,
        retrieved_at=NOW, classification_version="v2", classifier_id="test-fixture")
    (tmp_path / "news" / "2026-10-26.json").unlink()
    save_archive(incomplete, tmp_path / "news")
    store = Store(); store.archives = lambda: {"2026-10-26": complete}
    monkeypatch.setattr(pipeline, "market_snapshot", lambda *a, **k: pd.DataFrame({"mgo": [100.]}))
    monkeypatch.setattr(pipeline, "source_dates", lambda *a: {k: "2026-10-26" for k in ("mgo", "gasoil", "brent", "dubai", "usd")})
    _, forecasts = pipeline.run(tmp_path, fetch=False, client=store, now=NOW)
    assert forecasts[0]["reason"] == "insufficient_or_incompatible_evidence"


def test_rejected_weekly_candidate_keeps_prior_validated_version(tmp_path, monkeypatch):
    news(tmp_path); store = Store()
    monkeypatch.setattr(pipeline, "market_snapshot", lambda *a, **k: pd.DataFrame({"mgo": [100.]}))
    monkeypatch.setattr(pipeline, "source_dates", lambda *a: {k: "2026-10-26" for k in ("mgo", "gasoil", "brent", "dubai", "usd")})
    monkeypatch.setattr(pipeline, "training_bundle", lambda *a: {"id": "rejected", "created_at": NOW.isoformat(), "reports": {}, "horizons": {}})
    run, _ = pipeline.run(tmp_path, fetch=False, client=store, now=NOW, retrain=True)
    assert run["model_version"] == "weekly"
    assert run["payload"]["retraining_status"] == "rejected_insufficient_evidence"
    assert len(store.saved) == 1 and store.saved[0]["id"] == "rejected"


def test_old_validated_model_fails_closed(tmp_path, monkeypatch):
    news(tmp_path); store = Store()
    store.latest_bundle = lambda: {"id": "too-old", "created_at": "2026-09-01T00:00:00Z", "horizons": {}}
    monkeypatch.setattr(pipeline, "market_snapshot", lambda *a, **k: pd.DataFrame({"mgo": [100.]}))
    monkeypatch.setattr(pipeline, "source_dates", lambda *a: {k: "2026-10-26" for k in ("mgo", "gasoil", "brent", "dubai", "usd")})
    _, forecasts = pipeline.run(tmp_path, fetch=False, client=store, now=NOW)
    assert all(f["status"] == "unavailable" for f in forecasts)
    assert "14 days" in forecasts[0]["message"]


def test_read_only_remote_verification_never_publishes_or_uploads(tmp_path, monkeypatch):
    news(tmp_path); reader = Store()
    monkeypatch.setattr(pipeline, "Supabase", lambda: reader)
    monkeypatch.setattr(pipeline, "market_snapshot", lambda *a, **k: pd.DataFrame({"mgo": [100.]}))
    monkeypatch.setattr(pipeline, "source_dates", lambda *a: {k: "2026-10-26" for k in ("mgo", "gasoil", "brent", "dubai", "usd")})
    run, values = pipeline.run(tmp_path, fetch=False, read_published=True, now=NOW)
    assert run["model_version"] == "weekly" and len(values) == 3
    assert reader.published == [] and reader.archived == [] and reader.saved == []


def test_latest_rolling_archive_does_not_replace_daily_training_history(tmp_path, monkeypatch):
    daily = news(tmp_path)
    rolling = build_daily_payload(date(2026,10,26), [], complete=True, retrieved_at=NOW,
        classification_version="v2", classifier_id="test-fixture",
        window_start="2026-10-26T00:45:00Z", window_end="2026-10-27T00:45:00Z")
    save_archive(rolling,tmp_path / "news")
    monkeypatch.setattr(pipeline, "market_snapshot", lambda *a, **k: pd.DataFrame({"mgo": [100.]}))
    monkeypatch.setattr(pipeline, "source_dates", lambda *a: {k: "2026-10-26" for k in ("mgo", "gasoil", "brent", "dubai", "usd")})
    run, _ = pipeline.run(tmp_path, fetch=False, client=Store(), now=NOW)
    assert run["payload"]["news_window_end"] == rolling["end"]
    assert ':rolling24h:' in run["payload"]["news_feature_version"]
    assert pipeline.read_archives(tmp_path / 'news') == {daily['news_date']: daily}
