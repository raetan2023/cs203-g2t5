"""Daily batch: validated snapshots/news -> weekly training -> atomic Supabase publication.

python -m src.daily_pipeline --work-dir PATH [--retrain] [--apply]
Without --apply this writes only local evidence. No live training occurs in HTTP requests.
"""
import argparse
from datetime import date, datetime, timezone
import hashlib
import importlib
import io
import json
import os
from pathlib import Path
import sys
import uuid
from zoneinfo import ZoneInfo
import joblib
import pandas as pd
import requests
from news.daily_features import (FEATURE_NAMES, collect_latest, load_archive,
                                 archive_name, latest_available, save_archive)
from .daily_model import source_dates, train_horizon, predict_day

ROOT = Path(__file__).resolve().parents[2]
SOURCES = {"mgo_singapore": ("mgo", "sg_mgo_themaritime", "USD/MT"),
           "gasoil_singapore": ("gasoil", "sg_gasoil_investing", "USD/barrel"),
           "brent": ("brent", "brent_fred", "USD/barrel"),
           "dubai_crude": ("dubai", "dubai_crude_investing", "USD/barrel"),
           "usd_index": ("usd", "usd_index_fred", "index")}
BUCKET = "forecast-models"


class SupabaseError(RuntimeError):
    def __init__(self, status):
        self.status = status
        super().__init__(f"Supabase operation failed (HTTP {status})")


def encode(value):
    return json.dumps(value, sort_keys=True, allow_nan=False, separators=(",", ":")).encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def feature_version(news):
    version = f"{news['version']}:{news['classification_version']}:{news['classifier_id']}"
    if news.get("window_type") == "rolling_24h":
        version += ":rolling24h:" + news["end"]
    return version


class Supabase:
    """Server-only service credentials; errors never echo headers or remote bodies."""
    def __init__(self, url=None, key=None, session=None):
        self.url = (url or os.environ.get("SUPABASE_URL", "")).rstrip("/")
        key = key or os.environ.get("SUPABASE_SECRET_KEY", "")
        if not self.url.startswith("https://") or not key:
            raise ValueError("SUPABASE_URL and server-only SUPABASE_SECRET_KEY are required")
        self.headers = {"apikey": key}
        if key.startswith("eyJ"):
            self.headers["Authorization"] = "Bearer " + key
        self.session = session or requests.Session()

    def request(self, method, path, **kwargs):
        try:
            response = self.session.request(method, self.url + path, timeout=60,
                headers={**self.headers, **kwargs.pop("headers", {})}, **kwargs)
        except requests.RequestException:
            raise RuntimeError("Supabase connection failed") from None
        if not response.ok:
            raise SupabaseError(response.status_code)
        return response

    def archives(self):
        result, offset = {}, 0
        while True:
            rows = self.request("GET", "/rest/v1/news_daily_features", params={
                "select": "payload", "order": "date.asc,version.asc", "offset": offset, "limit": 500}).json()
            for row in rows:
                payload = row["payload"]
                if payload.get("status") == "complete":
                    identity = archive_name(payload)
                    result[identity] = payload
            if len(rows) < 500:
                return result
            offset += len(rows)

    def archive(self, payload):
        name = f"news/{payload['news_date']}/{digest(encode(payload))}.json"
        self.upload(name, encode(payload), "application/json")
        self.request("POST", "/rest/v1/news_daily_features?on_conflict=date,version", json={
            "date": payload["news_date"], "version": feature_version(payload), "payload": payload},
            headers={"Prefer": "resolution=merge-duplicates"})

    def upload(self, name, content, content_type):
        # Immutable content-addressed assets. A duplicate is verified, not replaced.
        path = f"/storage/v1/object/{BUCKET}/{name}"
        try:
            self.request("POST", path, data=content, headers={"Content-Type": content_type, "x-upsert": "false"})
        except RuntimeError:
            if self.request("GET", path).content != content:
                raise RuntimeError("Immutable artifact upload conflict") from None

    def save_bundle(self, bundle):
        data = io.BytesIO(); joblib.dump(bundle, data)
        content = data.getvalue()
        name = f"models/{bundle['id']}/bundle.joblib"
        self.upload(name, content, "application/octet-stream")
        self.upload(f"models/{bundle['id']}/evaluation.json", encode(bundle["reports"]), "application/json")
        # Manifest is append-only; candidates without any validated horizon are never loaded.
        manifest = {"id": bundle["id"], "created_at": bundle["created_at"],
                    "path": name, "sha256": digest(content), "code_revision": bundle["code_revision"],
                    "has_validated_horizon": bool(bundle["horizons"])}
        self.upload(f"models/{bundle['id']}/manifest.json", encode(manifest), "application/json")
        return manifest

    def latest_bundle(self):
        candidates, offset = [], 0
        while True:
            rows = self.request("POST", f"/storage/v1/object/list/{BUCKET}", json={
                "prefix": "models", "limit": 500, "offset": offset,
                "sortBy": {"column": "name", "order": "desc"}}).json()
            candidates.extend(row["name"] for row in rows if row.get("name"))
            if len(rows) < 500:
                break
            offset += len(rows)
        manifests = []
        for identifier in candidates:
            try:
                manifest = self.request("GET", f"/storage/v1/object/{BUCKET}/models/{identifier}/manifest.json").json()
            except SupabaseError as exc:
                if exc.status == 404:
                    continue  # interrupted immutable upload: manifest is written last
                raise
            if manifest.get("has_validated_horizon"):
                manifests.append(manifest)
        if not manifests:
            raise ValueError("No validated weekly model bundle exists; run manual retraining after backfill")
        manifest = max(manifests, key=lambda item: item["created_at"])
        content = self.request("GET", f"/storage/v1/object/{BUCKET}/{manifest['path']}").content
        if digest(content) != manifest["sha256"]:
            raise ValueError("Model bundle checksum mismatch")
        # Only trusted private workflow artifacts are deserialized.
        return joblib.load(io.BytesIO(content))

    def publish(self, run, forecasts):
        self.request("POST", "/rest/v1/rpc/publish_forecast_run", json={
            "run_json": run, "forecasts_json": forecasts})


def ingestion_module():
    path = str(ROOT / "data-ingestion")
    if path not in sys.path:
        sys.path.insert(0, path)
    return importlib.import_module("import_market")


def market_snapshot(directory, fetch=True):
    """Reuse importer identity validation; reject unresolved units for modelling."""
    importer = ingestion_module()
    directory = Path(directory); directory.mkdir(parents=True, exist_ok=True)
    columns = {}
    for source, (short, _, required_unit) in SOURCES.items():
        path = directory / f"{source}.json"
        if fetch:
            payload = importer.db.request_json(f"{importer.db.DEFAULT_API}/api/v1/data/{source}?mode=snapshot&limit=25000")
            path.write_bytes(encode(payload))
        else:
            payload = json.loads(path.read_text())
        if len(payload.get("data", [])) >= 25000:
            raise ValueError("Market snapshot limit reached; bounded export required")
        groups = importer.normalize(payload, source)
        if len(groups) != 1 or groups[0]["metadata"]["unit"] != required_unit:
            raise ValueError(f"Unresolved or incompatible units for {source}; no conversions guessed")
        rows = groups[0]["rows"]
        series = pd.Series({pd.Timestamp(row["observation_date"]): float(row["value"]) for row in rows})
        if not ((series > 0) & (series < float("inf"))).all():
            raise ValueError(f"Invalid prices/index for {source}")
        columns[short] = series
    return pd.DataFrame(columns).sort_index()


def read_archives(directory):
    archives = {}
    for path in sorted(Path(directory).glob("*.json")):
        payload = load_archive(path)
        if payload["status"] == "complete" and payload.get("window_type") != "rolling_24h":
            archives[payload["news_date"]] = payload
    return archives


def training_bundle(wide, archives, origin, revision, now):
    result = {"id": str(uuid.uuid4()), "version": 1, "created_at": now.isoformat(),
              "code_revision": revision, "horizons": {}, "reports": {},
              "market_sha256": digest(wide.to_csv().encode()),
              "news_sha256": digest(encode(archives))}
    for h in (7, 14, 30):
        try:
            bundle, evaluated = train_horizon(wide, archives, FEATURE_NAMES, h, origin)
            result["horizons"][h] = bundle
            result["reports"][str(h)] = bundle["evaluation"]
        except ValueError as exc:
            result["reports"][str(h)] = {"status": "unavailable", "reason": str(exc)}
    return result


def unavailable(horizon, reason, message):
    return {"status": "unavailable", "horizon_days": horizon, "reason": reason, "message": message}


def run(work_dir, *, apply=False, retrain=False, fetch=True, now=None, client=None, read_published=False):
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("Run timestamp must be timezone-aware")
    now = now.astimezone(timezone.utc)
    origin = now.astimezone(ZoneInfo("Asia/Singapore")).date()
    work = Path(work_dir); work.mkdir(parents=True, exist_ok=True)
    news_dir = work / "news"; news_dir.mkdir(exist_ok=True)
    store = client or (Supabase() if apply else None)
    reader = store or (Supabase() if read_published else None)
    run_id = str(uuid.uuid4())
    metadata = {"run_started_at": now.isoformat(), "code_revision": os.environ.get("GITHUB_SHA", "local"),
                "forecast_origin_date": origin.isoformat(), "as_of_date": origin.isoformat()}
    run_record = {"id": run_id, "origin_date": origin.isoformat(), "model_version": "unavailable", "payload": metadata}
    forecasts = [unavailable(h, "pipeline_incomplete", "The daily forecast run did not complete.") for h in (7, 14, 30)]
    failure = None
    try:
        remote_archives = reader.archives() if reader else {}
        if reader:
            for payload in remote_archives.values():
                path = news_dir / f"{archive_name(payload)}.json"
                if not path.exists() or load_archive(path)["status"] != "complete":
                    save_archive(payload, news_dir)
        if fetch:
            attempted = collect_latest(now=now, archive_dir=news_dir)
            if store:
                store.archive(attempted)
        candidates = [load_archive(path) for path in news_dir.glob("*.json")]
        news = latest_available(candidates, now=now)
        if not news:
            failed = attempted if fetch else max(candidates, key=lambda p: p["retrieved_at"], default={})
            detail = f" Latest collection: {failed['error'].split(': ', 1)[-1]}" if failed.get("error") else ""
            raise ValueError("No complete latest GDELT window is available within the last 7 days." + detail)
        if store:
            store.archive(news)
        metadata.update(news_window_start=news["start"], news_window_end=news["end"],
                        news_feature_version=feature_version(news),
                        news_age_hours=(now-datetime.fromisoformat(news["end"].replace("Z", "+00:00"))).total_seconds()/3600)
        archives = read_archives(news_dir)
        # Daily historical windows remain point-in-time; rolling live windows must
        # never overwrite them or become future-informed historical training rows.
        archives = {d: a for d, a in archives.items() if
                    (a["classification_version"], a["classifier_id"]) ==
                    (news["classification_version"], news["classifier_id"])}
        if store:
            for archived in archives.values():
                remote = remote_archives.get(archived["news_date"])
                if not remote or digest(encode(remote)) != digest(encode(archived)):
                    store.archive(archived)
        wide = market_snapshot(work / "market", fetch=fetch)
        metadata["source_dates"] = source_dates(wide, origin)
        metadata["market_sha256"] = digest(wide.to_csv().encode())
        metadata["news_sha256"] = news["records_sha256"]
        if apply:
            ingestion_module().run(list(SOURCES), input_dir=work / "market", apply=True)
        local_model = work / "daily_bundle.joblib"
        # Weekly retraining is explicit; inference never silently retrains.
        if retrain or origin.weekday() == 0:
            candidate = training_bundle(wide, archives, origin, metadata["code_revision"], now)
            (work / "evaluation.json").write_bytes(encode(candidate["reports"]))
            if store:
                store.save_bundle(candidate)
            if candidate["horizons"]:
                model = candidate
                joblib.dump(model, local_model)
            else:
                metadata["retraining_status"] = "rejected_insufficient_evidence"
                metadata["rejected_candidate_id"] = candidate["id"]
                # Keep a previously validated version consistently on every weekday.
                if reader:
                    model = reader.latest_bundle()
                elif local_model.exists():
                    model = joblib.load(local_model)
                else:
                    raise ValueError("No validated model: historical GDELT overlap/evaluation is insufficient")
        elif local_model.exists() and not store:
            model = joblib.load(local_model)
        elif reader:
            model = reader.latest_bundle()
        else:
            raise ValueError("No weekly model bundle; run --retrain explicitly")
        if (now - datetime.fromisoformat(model["created_at"].replace("Z", "+00:00"))).total_seconds() > 14 * 86400:
            raise ValueError("Last validated uncertainty model is older than 14 days; successful retraining required")
        run_record["model_version"] = model["id"]
        metadata["model_trained_at"] = model["created_at"]
        forecasts = []
        for h in (7, 14, 30):
            try:
                if h not in model["horizons"]:
                    raise ValueError(model["reports"].get(str(h), {}).get("reason", "Insufficient validated historical news evidence"))
                forecast = predict_day(model["horizons"][h], wide, news, origin, now=now)
                forecast.update(metadata)
                forecast.update(model_version=model["id"], run_id=run_id,
                    history=[{"date": str(d.date()), "price": float(p)} for d, p in wide.mgo.dropna().items() if d.date() < origin][-20:])
                forecasts.append(forecast)
            except ValueError as exc:
                forecasts.append(unavailable(h, "insufficient_or_incompatible_evidence", str(exc)))
    except (ValueError, RuntimeError, OSError, KeyError) as exc:
        # Exception messages from our adapters are deliberately sanitized.
        failure = str(exc) if not isinstance(exc, KeyError) else "Required source metadata is missing"
        forecasts = [unavailable(h, "daily_inputs_unavailable", failure) for h in (7, 14, 30)]
    metadata.update(completed_at=datetime.now(timezone.utc).isoformat(),
                    status="ready" if all(f["status"] == "ready" for f in forecasts) else "unavailable")
    (work / "run.json").write_bytes(encode(run_record))
    (work / "forecasts.json").write_bytes(encode(forecasts))
    if store:
        store.publish(run_record, forecasts)
    summary = {"run_id": run_id, "origin_date": origin.isoformat(), "published": bool(store),
               "horizons": [{"horizon_days": f["horizon_days"], "status": f["status"],
                             "reason": f.get("reason"), "message": f.get("message")} for f in forecasts]}
    print(json.dumps(summary, indent=2))
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a") as output:
            output.write("### Daily news-informed forecasts\n\n```json\n" + json.dumps(summary, indent=2) + "\n```\n")
    return run_record, forecasts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--retrain", action="store_true")
    parser.add_argument("--offline", action="store_true", help="Use archived market/news inputs, no source calls")
    parser.add_argument("--read-published", action="store_true", help="Read existing private model/archive history without publishing")
    parser.add_argument("--archive-only", action="store_true", help="Validate and upload imported complete news archives, no forecast/training")
    args = parser.parse_args()
    if args.archive_only:
        if not args.apply:
            parser.error("--archive-only requires --apply to publish validated historical archives")
        archives = read_archives(args.work_dir / "news")
        if not archives:
            parser.error("No complete validated news archives to import")
        store = Supabase()
        for news in archives.values():
            store.archive(news)
        print(f"Archived {len(archives)} complete news days; no forecasts published")
        return
    _, forecasts = run(args.work_dir, apply=args.apply, retrain=args.retrain,
                       fetch=not args.offline, read_published=args.read_published)
    if any(f.get("reason") == "daily_inputs_unavailable" for f in forecasts):
        raise SystemExit(2)


if __name__ == "__main__":
    main()
