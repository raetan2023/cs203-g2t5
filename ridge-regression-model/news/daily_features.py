"""Auditable, exact-UTC-day GDELT headline features.

DOC 2.0 covers recent months only, and caps ArtList at 250 results. Capped
windows are subdivided down to 15 minutes; unresolved caps, HTTP failures and
invalid classifications make the day incomplete. 'complete' describes this
query's successfully enumerated API results, not all world news or final GDELT
indexing. Archives retain headline evidence and classification provenance.

python -m news.daily_features --archive-dir PATH [--start YYYY-MM-DD --end YYYY-MM-DD]
Dates are inclusive. Default: previous completed UTC day. Historical backfill
outside DOC retention requires genuine archived evidence, never URL-slug text.
"""
import argparse
from datetime import date, datetime, time as dt_time, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import statistics
import time
from urllib.parse import urlparse

from . import config
from .classifier import CATEGORIES, MARKET_BIASES, PROMPT_VERSION, classify, parse_response
from .gdelt_source import DOC_URL

VERSION = 1
UTC = timezone.utc
BIAS_NAMES = tuple(sorted(MARKET_BIASES))
FEATURE_NAMES = tuple(["news_article_count", "news_relevant_count", "news_unique_source_count"]
    + [f"news_category_{c}" for c in CATEGORIES if c != "other"]
    + [f"news_bias_{b}" for b in BIAS_NAMES] + ["news_bias_disagreement", "news_tone_std", "news_tone_available"])


class CollectionError(ValueError):
    """The requested day cannot safely be marked complete."""


def _utc_now(now=None):
    now = now or datetime.now(UTC)
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    return now.astimezone(UTC)


def _day(value):
    if isinstance(value, datetime):
        raise ValueError("Use a date, not a datetime, for news_date")
    return value if isinstance(value, date) else date.fromisoformat(value)


def _stamp(value):
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _parse_stamp(value):
    if not isinstance(value, str):
        raise ValueError("Timestamp must be a string")
    try:
        parsed = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
    except ValueError:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timestamp must include UTC offset")
    return parsed.astimezone(UTC)


def day_window(news_date):
    start = datetime.combine(_day(news_date), dt_time(), tzinfo=UTC)
    return start, start + timedelta(days=1)


def previous_completed_utc_day(now=None):
    return _utc_now(now).date() - timedelta(days=1)


def _hash(records):
    encoded = json.dumps(records, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    return hashlib.sha256(encoded).hexdigest()


def _normalise_record(record, start, end):
    if not isinstance(record, dict):
        raise ValueError("Article must be an object")
    url = str(record.get("url", "")).strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Article requires an HTTP(S) URL")
    title = " ".join(str(record.get("title", "")).split())
    if not title:
        raise ValueError("Article requires a real headline")
    seen = _parse_stamp(record.get("seendate", record.get("seen_at")))
    if not start <= seen < end:
        raise ValueError("Article lies outside its exact UTC day")
    out = {"url": url, "title": title, "seen_at": _stamp(seen),
           "domain": parsed.hostname.lower(), "language": str(record.get("language", "")),
           "sourcecountry": str(record.get("sourcecountry", ""))}
    if "classification" in record:
        label = parse_response(json.dumps(record["classification"]))
        if not label["valid"]:
            raise ValueError("Invalid archived article classification")
        out["classification"] = label
    if record.get("tone") is not None:
        tone = float(record["tone"])
        if not math.isfinite(tone):
            raise ValueError("Tone must be finite")
        out["tone"] = tone
    return out


def build_daily_payload(news_date, records, *, complete, retrieved_at=None,
                        classification_version=PROMPT_VERSION, classifier_id="unspecified",
                        query=None, error=None):
    """Build an archive from actual classified evidence; never infer coverage.

    Offline importers must explicitly attest enumeration completeness. Records
    must include a real title, URL, UTC seen_at and valid existing-schema label.
    An empty, explicitly complete day is distinct from absent/incomplete data.
    """
    start, end = day_window(news_date)
    normalised = [_normalise_record(r, start, end) for r in records]
    by_url = {}
    for record in sorted(normalised, key=lambda r: (r["seen_at"], r["url"], r["title"])):
        by_url.setdefault(record["url"], record)
    retained = sorted(by_url.values(), key=lambda r: (r["seen_at"], r["url"]))
    if complete and any("classification" not in r for r in retained):
        raise ValueError("Complete archives require every article classification")
    retrieved = _parse_stamp(retrieved_at) if isinstance(retrieved_at, str) else _utc_now(retrieved_at)
    if retrieved < end:
        raise ValueError("A daily archive cannot precede its completed UTC window")
    labels = [r["classification"] for r in retained if "classification" in r]
    relevant = [label for label in labels if label["category"] != "other"]
    sources = len({r["domain"] for r in retained})
    n = len(relevant)
    cats = {cat: sum(label["category"] == cat for label in relevant) / n if n else 0.
            for cat in CATEGORIES if cat != "other"}
    biases = {bias: sum(label["market_bias"] == bias for label in relevant) / n if n else 0.
              for bias in BIAS_NAMES}
    disagreement = 1. - max(biases.values()) if n else 0.
    tones = [r["tone"] for r in retained if "tone" in r]
    tone_std = statistics.pstdev(tones) if len(tones) >= 2 else 0.
    features = dict(zip(FEATURE_NAMES,
        [float(len(retained)), float(n), float(sources)] + list(cats.values())
        + list(biases.values()) + [disagreement, tone_std, float(len(tones) >= 2)])) if complete else None
    return {"version": VERSION, "news_date": _day(news_date).isoformat(),
            "start": _stamp(start), "end": _stamp(end),
            "status": "complete" if complete else "incomplete", "retrieved_at": _stamp(retrieved),
            "query": query or config.GDELT_QUERY, "source": "gdelt_doc_2_artlist",
            "coverage_scope": "Enumerated matching API records, not all world news; GDELT indexing can change.",
            "article_count": len(retained), "relevant_count": n, "unique_source_count": sources,
            "event_category_proportions": cats if complete else None,
            "bias_proportions": biases if complete else None,
            "bias_disagreement": disagreement if complete else None,
            "tone_dispersion": statistics.pstdev(tones) if len(tones) >= 2 else None,
            "tone_article_count": len(tones), "classification_version": classification_version,
            "classifier_id": classifier_id,
            "classification_fingerprint": hashlib.sha256(f"{classification_version}\n{classifier_id}".encode()).hexdigest(),
            "features": features, "records": retained,
            "records_sha256": _hash(retained), "error": error}


def save_archive(payload, archive_dir):
    path = Path(archive_dir) / f"{payload['news_date']}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    # Never replace previously complete evidence with a failed retry.
    if path.exists() and payload["status"] != "complete":
        existing = load_archive(path)
        if existing["status"] == "complete":
            raise ValueError("Refusing to overwrite a complete archive with an incomplete retry")
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)
    return path


def load_archive(path, news_date=None):
    """Load and validate explicit coverage/evidence. Missing days raise, never zero-fill."""
    path = Path(path)
    if path.is_dir():
        if news_date is None:
            raise ValueError("news_date required when loading an archive directory")
        path /= f"{_day(news_date).isoformat()}.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("version") != VERSION or payload.get("status") not in {"complete", "incomplete"}:
        raise ValueError("Unsupported daily archive version or missing explicit coverage status")
    if news_date is not None and payload.get("news_date") != _day(news_date).isoformat():
        raise ValueError("Archive news_date does not match requested date")
    rebuilt = build_daily_payload(payload["news_date"], payload["records"],
        complete=payload["status"] == "complete", retrieved_at=payload["retrieved_at"],
        classification_version=payload["classification_version"], classifier_id=payload["classifier_id"],
        query=payload["query"], error=payload.get("error"))
    for key in rebuilt:
        if payload.get(key) != rebuilt[key]:
            raise ValueError(f"Archive evidence/metadata mismatch: {key}")
    return payload


def collect_day(news_date, *, classify_fn=None, llm=None, get=None, sleep=time.sleep,
                now=None, archive_dir=None, query=None):
    """Collect one closed day. Failure returns incomplete with no usable features.

    classify_fn: batch list[str] -> existing classifier list[dict]. With no
    injection, uses classify(..., build_llm()), preserving the existing taxonomy.
    Network requests are paced; no broad retries hide rate limits or errors.
    """
    import requests
    get = get or requests.get
    now = _utc_now(now)
    start, end = day_window(news_date)
    if end > now:
        raise ValueError("Only completed UTC days may be collected")
    # Conservative 89-day live retention; older days need genuine archives.
    if start < now - timedelta(days=89):
        raise ValueError("Outside recent DOC retention; supply genuine archived evidence")
    records, calls = [], 0
    query = query or config.GDELT_QUERY
    configured_identity = f"{os.environ.get('NEWS_LLM_PROVIDER', 'anthropic').lower()}:{os.environ.get('NEWS_LLM_MODEL', 'claude-haiku-5-5')}"
    classifier_id = getattr(llm, "name", "injected" if classify_fn else configured_identity)
    error = None
    try:
        def fetch(left, right):
            nonlocal calls
            if calls >= 256:
                raise CollectionError("Collection request budget exhausted")
            if calls:
                sleep(5)
            calls += 1
            params = {"query": query, "mode": "ArtList", "format": "json", "sort": "DateAsc",
                      "maxrecords": 250,
                      # One-second overlap protects the left boundary; local filtering is half-open.
                      "startdatetime": (left - timedelta(seconds=1)).strftime("%Y%m%d%H%M%S"),
                      "enddatetime": right.strftime("%Y%m%d%H%M%S")}
            response = get(DOC_URL, params=params, timeout=30)
            if response.status_code == 429:
                raise CollectionError("GDELT rate limited the requested window")
            response.raise_for_status()
            body = response.json()
            if not isinstance(body, dict) or not isinstance(body.get("articles"), list):
                raise CollectionError("GDELT response did not explicitly contain an article list")
            articles = body["articles"]
            if len(articles) >= 250:
                slots = int((right - left).total_seconds() // 900)
                if slots < 2:
                    raise CollectionError("Unresolved 250-record cap at minimum 15-minute window")
                midpoint = left + timedelta(seconds=(slots // 2) * 900)
                fetch(left, midpoint)
                fetch(midpoint, right)
                return
            for article in articles:
                seen = _parse_stamp(article.get("seendate"))
                if left <= seen < right:
                    records.append(_normalise_record(article, start, end))
        fetch(start, end)
        dedup = {r["url"]: r for r in reversed(records)}
        records = sorted(dedup.values(), key=lambda r: (r["seen_at"], r["url"]))
        if records:
            if classify_fn is None:
                if llm is None:
                    from .llm import build_llm
                    llm = build_llm()
                classifier_id = getattr(llm, "name", type(llm).__name__)
                classify_fn = lambda texts: classify(texts, llm)
            labels = classify_fn([r["title"] for r in records])
            if not isinstance(labels, list) or len(labels) != len(records):
                raise CollectionError("Classifier did not return one result per headline")
            for record, label in zip(records, labels):
                validated = parse_response(json.dumps(label))
                if not validated["valid"]:
                    raise CollectionError("Headline classification failed validation")
                record["classification"] = validated
    except Exception as exc:
        # Persist safe evidence/error type, never provider exception text (may contain credentials).
        error = f"{type(exc).__name__}: " + (str(exc) if isinstance(exc, CollectionError) else "collection or classification failed")
    payload = build_daily_payload(news_date, records, complete=error is None,
        retrieved_at=now, classifier_id=classifier_id, query=query, error=error)
    if archive_dir is not None:
        save_archive(payload, archive_dir)
    return payload


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive-dir", required=True)
    parser.add_argument("--import-archive", action="append", default=[],
                        help="Validate and copy a genuine classified daily JSON archive; repeatable")
    parser.add_argument("--start", type=date.fromisoformat)
    parser.add_argument("--end", type=date.fromisoformat)
    args = parser.parse_args(argv)
    if args.import_archive:
        if args.start or args.end:
            parser.error("--import-archive cannot be combined with live collection dates")
        for path in args.import_archive:
            payload = load_archive(path)
            save_archive(payload, args.archive_dir)
            print(json.dumps({"news_date": payload["news_date"], "status": payload["status"]}))
        return 0
    if args.end and not args.start:
        parser.error("--end requires --start")
    start = args.start or previous_completed_utc_day()
    end = args.end or start
    if end < start:
        parser.error("--end must be on or after --start")
    day, failed = start, False
    while day <= end:
        payload = collect_day(day, archive_dir=args.archive_dir)
        print(json.dumps({"news_date": payload["news_date"], "status": payload["status"],
                          "article_count": payload["article_count"], "error": payload["error"]}))
        failed |= payload["status"] != "complete"
        day += timedelta(days=1)
        if day <= end:
            time.sleep(5)
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
