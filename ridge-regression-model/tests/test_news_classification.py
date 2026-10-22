import json
import threading
import time
from datetime import date

import pytest
from pydantic import ValidationError

from news.classifier import CATEGORIES, classify, parse_response
from news.llm import CachedLLM
from news.types import NewsItem


def test_parse_response_requires_valid_complete_json():
    valid = parse_response(
        '{"category":"sanctions","market_bias":"bullish","confidence":0.8,'
        '"reason":"Trade restrictions may limit oil supply."}'
    )
    assert valid == {
        "category": "sanctions",
        "market_bias": "bullish",
        "confidence": 0.8,
        "reason": "Trade restrictions may limit oil supply.",
        "valid": True,
    }
    assert len(CATEGORIES) == 9

    invalid_replies = [
        "not JSON",
        '{"category":"unknown","market_bias":"neutral","confidence":0.8,"reason":"Unknown label."}',
        '{"category":"sanctions","market_bias":"neutral","reason":"Missing confidence."}',
        '{"category":"sanctions","market_bias":"neutral","confidence":true,"reason":"Boolean confidence."}',
        '{"category":"sanctions","market_bias":"neutral","confidence":1.1,"reason":"Out of range."}',
        '{"category":"sanctions","market_bias":"neutral","confidence":0.8}',
        '{"category":"sanctions","market_bias":"neutral","confidence":0.8,"reason":"one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen"}',
        '{"category":"sanctions","confidence":0.8,"reason":"Missing market bias."}',
        '{"category":"sanctions","market_bias":"positive","confidence":0.8,"reason":"Invalid market bias."}',
    ]
    for reply in invalid_replies:
        assert parse_response(reply)["category"] == "invalid"


def test_classify_converts_llm_exceptions_to_invalid_result():
    class FailingLLM:
        def complete(self, system, user):
            raise TimeoutError

    result = classify(["Tanker delays reported"], FailingLLM())[0]
    assert result["category"] == "invalid"
    assert result["market_bias"] == "invalid"
    assert result["valid"] is False
    assert result["reason"] == "LLM request failed: TimeoutError"


def test_cached_llm_retries_and_reuses_successful_disk_response(tmp_path):
    class SometimesFails:
        name = "test:model"

        def __init__(self):
            self.calls = 0

        def complete(self, system, user):
            self.calls += 1
            if self.calls < 3:
                raise TimeoutError
            return '{"category":"other","market_bias":"neutral","confidence":0.7,"reason":"Unrelated headline."}'

    path = tmp_path / "cache.jsonl"
    llm = SometimesFails()
    cached = CachedLLM(llm, path, tries=3, sleep=lambda _: None)
    response = cached.complete("system", "headline")
    reopened = CachedLLM(llm, path)

    assert json.loads(response)["category"] == "other"
    assert reopened.complete("system", "headline") == response
    assert llm.calls == 3


def test_cached_llm_returns_invalid_after_retries_and_retries_again_later(tmp_path):
    class Recovers:
        name = "test:recover"

        def __init__(self):
            self.fail = True
            self.calls = 0

        def complete(self, system, user):
            self.calls += 1
            if self.fail:
                raise TimeoutError
            return '{"category":"other","market_bias":"neutral","confidence":0.7,"reason":"Unrelated headline."}'

    path = tmp_path / "cache.jsonl"
    llm = Recovers()
    cached = CachedLLM(llm, path, tries=2, sleep=lambda _: None)

    failed = parse_response(cached.complete("system", "headline"))
    assert failed["category"] == "invalid"
    assert "2 attempts" in failed["reason"]
    assert not path.exists()

    llm.fail = False
    assert parse_response(cached.complete("system", "headline"))["category"] == "other"
    assert llm.calls == 3


def test_cached_llm_deduplicates_concurrent_identical_requests(tmp_path):
    class SlowLLM:
        name = "test:concurrent"

        def __init__(self):
            self.calls = 0
            self.lock = threading.Lock()

        def complete(self, system, user):
            with self.lock:
                self.calls += 1
            time.sleep(0.05)
            return "one response"

    llm = SlowLLM()
    cached = CachedLLM(llm, tmp_path / "cache.jsonl")
    barrier = threading.Barrier(8)

    def request():
        barrier.wait()
        return cached.complete("system", "same headline")

    from concurrent.futures import ThreadPoolExecutor

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(lambda _: request(), range(8)))

    assert results == ["one response"] * 8
    assert llm.calls == 1


def test_cached_llm_requires_positive_retry_count(tmp_path):
    class DummyLLM:
        name = "test:dummy"

    with pytest.raises(ValueError, match="at least 1"):
        CachedLLM(DummyLLM(), tmp_path / "cache.jsonl", tries=0)


def test_news_tags_request_limits_and_zero_inclusive_counts(monkeypatch):
    from news import service

    with pytest.raises(ValidationError):
        service.TagRequest(max_items=0)
    with pytest.raises(ValidationError):
        service.TagRequest(max_items=251)

    item = NewsItem("Tanker delays reported", "https://example.test/news", date(2026, 10, 21))
    requested = date(2026, 10, 21)
    monkeypatch.setattr(
        service,
        "fetch_headlines",
        lambda max_records, target_date: [item] if target_date == requested else [],
    )
    monkeypatch.setattr(service, "build_llm", lambda: object())
    monkeypatch.setattr(
        service,
        "classify",
        lambda titles, llm, workers: [
            {"category": "shipping_disruption", "market_bias": "bullish", "confidence": 0.9,
             "reason": "Tanker delays constrain supply.", "valid": True}
        ],
    )
    monkeypatch.setattr(service, "_llm_agreement", lambda: None)

    result = service.news_tags_route(service.TagRequest(target_date=requested, max_items=1))

    assert result["target_date"] == requested
    assert result["counts"]["shipping_disruption"] == 1
    assert result["counts"]["sanctions"] == 0
    assert result["counts"]["invalid"] == 0
    assert set(result["counts"]) == {*CATEGORIES, "invalid"}
    assert result["items"][0]["market_bias"] == "bullish"
    assert result["daily_summary"] == {
        "status": "ok",
        "date": requested,
        "n_classified": 1,
        "market_bias": "bullish",
        "confidence_weighted_shares": {"bullish": 1.0, "bearish": 0.0, "neutral": 0.0},
    }


def test_daily_summary_weights_confidence_and_ties_to_neutral():
    from news.service import _daily_market_summary

    target = date(2026, 10, 21)
    results = [
        {"valid": True, "market_bias": "bullish", "confidence": 0.9},
        {"valid": True, "market_bias": "bearish", "confidence": 0.3},
        {"valid": False, "market_bias": "bullish", "confidence": None},
    ]
    summary = _daily_market_summary(target, results)

    assert summary["market_bias"] == "bullish"
    assert summary["n_classified"] == 2
    assert summary["confidence_weighted_shares"] == pytest.approx(
        {"bullish": 0.75, "bearish": 0.25, "neutral": 0.0}
    )

    tied = _daily_market_summary(
        target,
        [
            {"valid": True, "market_bias": "bullish", "confidence": 0.8},
            {"valid": True, "market_bias": "bearish", "confidence": 0.8},
        ],
    )
    assert tied["market_bias"] == "neutral"


def test_daily_summary_is_insufficient_without_confidence_weight():
    from news.service import _daily_market_summary

    summary = _daily_market_summary(
        date(2026, 10, 21),
        [{"valid": False, "market_bias": "invalid", "confidence": None}],
    )

    assert summary["status"] == "insufficient"
    assert summary["market_bias"] == "neutral"
    assert summary["confidence_weighted_shares"] == {
        "bullish": None,
        "bearish": None,
        "neutral": None,
    }


def test_fetch_headlines_requests_the_selected_date(monkeypatch):
    from news.gdelt_source import fetch_headlines

    calls = []

    class Response:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {
                "articles": [
                    {"title": "Selected date headline", "seendate": "20261021120000", "url": ""},
                    {"title": "Next date headline", "seendate": "20261022000000", "url": ""},
                ]
            }

    def fake_get(url, params, timeout):
        calls.append(params)
        return Response()

    headlines = fetch_headlines(target_date=date(2026, 10, 21), get=fake_get)

    assert calls[0]["startdatetime"] == "20261021000000"
    assert calls[0]["enddatetime"] == "20261022000000"
    assert "timespan" not in calls[0]
    assert [item.title for item in headlines] == ["Selected date headline"]
