"""Offline evidence tests: day boundaries, truncation, classification and archives."""
from datetime import date, datetime, timedelta, timezone
import json
import pytest
from news.daily_features import (FEATURE_NAMES, build_daily_payload, collect_day,
    load_archive, save_archive, previous_completed_utc_day)

UTC = timezone.utc
DAY = date(2026, 10, 24)
NOW = datetime(2026, 10, 25, 0, 1, tzinfo=UTC)


def label(category="shipping_disruption", bias="bullish"):
    return {"category": category, "market_bias": bias, "confidence": .8,
            "reason": "Tanker route interrupted", "valid": True}


def article(i=0, seen="20261024T120000Z"):
    return {"url": f"https://source{i % 2}.example/news/{i}", "title": f"Tanker route disruption {i}",
            "seendate": seen, "domain": "untrusted.example"}


class Response:
    status_code = 200
    def __init__(self, articles):
        self.articles = articles
    def raise_for_status(self):
        pass
    def json(self):
        return {"articles": self.articles}


def classifier(texts):
    return [label() for _ in texts]


def test_previous_day_is_utc_even_when_local_day_is_different():
    singapore = timezone(timedelta(hours=8))
    # 00:30 Singapore on Oct 25 is Oct 24 UTC: last completed UTC day is Oct 23.
    assert previous_completed_utc_day(datetime(2026, 10, 25, 0, 30, tzinfo=singapore)) == date(2026, 10, 23)
    with pytest.raises(ValueError, match="timezone-aware"):
        previous_completed_utc_day(datetime(2026, 10, 25))


def test_exact_window_url_dedup_and_source_hostname():
    calls = []
    def get(url, **kwargs):
        calls.append(kwargs["params"])
        return Response([article(), article(), article(1, "20261024T000000Z"),
                         article(2, "20261025T000000Z")])
    out = collect_day(DAY, get=get, classify_fn=classifier, now=NOW)
    assert out["status"] == "complete"
    assert calls[0]["startdatetime"] == "20261023235959"
    assert calls[0]["enddatetime"] == "20261025000000"
    assert out["start"] == "2026-10-24T00:00:00Z"
    assert out["end"] == "2026-10-25T00:00:00Z"
    assert out["article_count"] == out["relevant_count"] == 2
    assert out["unique_source_count"] == 2
    assert set(out["features"]) == set(FEATURE_NAMES)
    assert out["features"]["news_category_shipping_disruption"] == 1
    assert out["bias_proportions"]["bullish"] == 1


def test_cap_splits_windows_and_deduplicates_boundaries():
    calls, sleeps = [], []
    def get(url, **kwargs):
        params = kwargs["params"]
        calls.append(params)
        if len(calls) == 1:
            return Response([article(i) for i in range(250)])
        seen = "20261024T060000Z" if len(calls) == 2 else "20261024T180000Z"
        return Response([article(len(calls), seen)])
    out = collect_day(DAY, get=get, sleep=sleeps.append, classify_fn=classifier, now=NOW)
    assert out["status"] == "complete" and out["article_count"] == 2
    assert len(calls) == 3 and sleeps == [5, 5]
    assert calls[1]["enddatetime"] == "20261024120000"
    assert calls[2]["startdatetime"] == "20261024115959"


def test_unresolvable_caps_fail_closed_at_fifteen_minutes():
    calls = []
    def get(url, **kwargs):
        calls.append(kwargs["params"])
        return Response([article(i) for i in range(250)])
    out = collect_day(DAY, get=get, sleep=lambda _: None, classify_fn=classifier, now=NOW)
    assert out["status"] == "incomplete" and out["features"] is None
    assert "250-record cap" in out["error"]
    left = datetime.strptime(calls[-1]["startdatetime"], "%Y%m%d%H%M%S") + timedelta(seconds=1)
    right = datetime.strptime(calls[-1]["enddatetime"], "%Y%m%d%H%M%S")
    assert right - left == timedelta(minutes=15)


def test_rate_limit_nonjson_and_invalid_classifier_are_not_empty_success():
    class Limited(Response):
        status_code = 429
    out = collect_day(DAY, get=lambda *a, **k: Limited([]), now=NOW)
    assert out["status"] == "incomplete" and "rate limited" in out["error"]
    class Malformed(Response):
        def json(self):
            raise ValueError("unparseable response, credential=must-not-leak")
    out = collect_day(DAY, get=lambda *a, **k: Malformed([]), now=NOW)
    assert out["status"] == "incomplete" and "credential" not in out["error"]
    out = collect_day(DAY, get=lambda *a, **k: Response([article()]),
                      classify_fn=lambda _: [{"category": "invalid"}], now=NOW)
    assert out["status"] == "incomplete" and out["features"] is None
    assert len(out["records"]) == 1


def test_empty_complete_and_zero_relevant_differ_from_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("NEWS_LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("NEWS_LLM_MODEL", "existing-configured-model")
    empty = collect_day(DAY, get=lambda *a, **k: Response([]), now=NOW)
    assert empty["status"] == "complete" and empty["features"]["news_article_count"] == 0
    assert empty["classifier_id"] == "anthropic:existing-configured-model"
    other = collect_day(DAY, get=lambda *a, **k: Response([article()]),
                        classify_fn=lambda _: [label("other", "neutral")], now=NOW)
    assert other["status"] == "complete" and other["relevant_count"] == 0
    assert other["features"]["news_article_count"] == 1
    assert other["bias_disagreement"] == 0
    with pytest.raises(FileNotFoundError):
        load_archive(tmp_path, DAY)


def test_archive_roundtrip_recomputes_evidence_and_rejects_tampering(tmp_path):
    record = {**article(), "classification": label(), "tone": 2.}
    out = build_daily_payload(DAY, [record], complete=True, retrieved_at=NOW)
    path = save_archive(out, tmp_path)
    assert load_archive(path, DAY) == out
    tampered = json.loads(path.read_text())
    tampered["features"]["news_relevant_count"] = 999.
    path.write_text(json.dumps(tampered))
    with pytest.raises(ValueError, match="features"):
        load_archive(path)
    path.write_text(json.dumps(out))
    tampered = json.loads(path.read_text())
    tampered["records"][0]["title"] = "Changed evidence"
    path.write_text(json.dumps(tampered))
    with pytest.raises(ValueError, match="records_sha256"):
        load_archive(path)
    path.write_text(json.dumps(out))
    incomplete = build_daily_payload(DAY, [], complete=False, retrieved_at=NOW, error="missing")
    with pytest.raises(ValueError, match="overwrite"):
        save_archive(incomplete, tmp_path)


def test_future_out_of_retention_and_outside_archive_day_rejected():
    with pytest.raises(ValueError, match="completed"):
        collect_day(date(2026, 10, 25), now=NOW)
    with pytest.raises(ValueError, match="retention"):
        collect_day(date(2020, 1, 1), now=NOW)
    with pytest.raises(ValueError, match="exact UTC day"):
        build_daily_payload(DAY, [{**article(seen="20261025T000000Z"), "classification": label()}],
                            complete=True, retrieved_at=NOW)
    with pytest.raises(ValueError, match="classification"):
        build_daily_payload(DAY, [article()], complete=True, retrieved_at=NOW)
    with pytest.raises(ValueError, match="precede"):
        build_daily_payload(DAY, [], complete=True, retrieved_at=datetime(2026, 10, 24, tzinfo=UTC))


def test_relevant_bias_disagreement_and_tone_dispersion():
    records = [{**article(i), "classification": label(bias=bias), "tone": tone}
               for i, bias, tone in [(0, "bullish", -2), (1, "bearish", 2)]]
    out = build_daily_payload(DAY, records, complete=True, retrieved_at=NOW)
    assert out["bias_proportions"]["bullish"] == out["bias_proportions"]["bearish"] == .5
    assert out["bias_disagreement"] == .5
    assert out["tone_dispersion"] == 2.
    assert out["features"]["news_tone_std"] == 2.
    assert out["features"]["news_tone_available"] == 1.
    missing = build_daily_payload(DAY, [{**article(), "classification": label()}],
                                  complete=True, retrieved_at=NOW)
    assert missing["features"]["news_tone_std"] == 0.
    assert missing["features"]["news_tone_available"] == 0.
    assert missing["classification_fingerprint"] != build_daily_payload(
        DAY, [], complete=True, retrieved_at=NOW, classifier_id="different-model")["classification_fingerprint"]


def test_unconfigured_existing_classifier_is_incomplete_not_neutral(monkeypatch):
    import news.llm
    def unavailable():
        raise RuntimeError("private credential diagnostic must not be logged")
    monkeypatch.setattr(news.llm, "build_llm", unavailable)
    out = collect_day(DAY, get=lambda *a, **k: Response([article()]), now=NOW)
    assert out["status"] == "incomplete" and out["features"] is None
    assert out["article_count"] == 1
    assert "credential" not in out["error"]
