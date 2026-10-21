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
        '{"category":"sanctions","confidence":0.8,"reason":"Trade restrictions were announced."}'
    )
    assert valid == {
        "category": "sanctions",
        "confidence": 0.8,
        "reason": "Trade restrictions were announced.",
        "valid": True,
    }
    assert len(CATEGORIES) == 9

    invalid_replies = [
        "not JSON",
        '{"category":"unknown","confidence":0.8,"reason":"Unknown label."}',
        '{"category":"sanctions","reason":"Missing confidence."}',
        '{"category":"sanctions","confidence":true,"reason":"Boolean confidence."}',
        '{"category":"sanctions","confidence":1.1,"reason":"Out of range."}',
        '{"category":"sanctions","confidence":0.8}',
        '{"category":"sanctions","confidence":0.8,"reason":"one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen"}',
    ]
    for reply in invalid_replies:
        assert parse_response(reply)["category"] == "invalid"


def test_classify_converts_llm_exceptions_to_invalid_result():
    class FailingLLM:
        def complete(self, system, user):
            raise TimeoutError

    result = classify(["Tanker delays reported"], FailingLLM())[0]
    assert result["category"] == "invalid"
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
            return '{"category":"other","confidence":0.7,"reason":"Unrelated headline."}'

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
            return '{"category":"other","confidence":0.7,"reason":"Unrelated headline."}'

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
    monkeypatch.setattr(service, "fetch_headlines", lambda max_records: [item])
    monkeypatch.setattr(service, "build_llm", lambda: object())
    monkeypatch.setattr(
        service,
        "classify",
        lambda titles, llm, workers: [
            {"category": "shipping_disruption", "confidence": 0.9, "reason": "Tanker delays.", "valid": True}
        ],
    )
    monkeypatch.setattr(service, "_llm_agreement", lambda: None)

    result = service.news_tags_route(service.TagRequest(max_items=1))

    assert result["counts"]["shipping_disruption"] == 1
    assert result["counts"]["sanctions"] == 0
    assert result["counts"]["invalid"] == 0
    assert set(result["counts"]) == {*CATEGORIES, "invalid"}
