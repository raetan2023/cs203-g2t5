"""Preview/import Brent API observations into the supplied UUID Supabase schema.

Preview is the default. Only --apply writes to Supabase. Python standard library only.
"""
import argparse
from datetime import date
from decimal import Decimal, InvalidOperation
import json
import os
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from uuid import UUID

DEFAULT_API = "https://mgo-data-api.vercel.app"


def request_json(url, method="GET", headers=None, payload=None):
    body = json.dumps(payload, allow_nan=False).encode() if payload is not None else None
    request = Request(url, data=body, method=method, headers=headers or {})
    try:
        with urlopen(request, timeout=45) as response:
            result = response.read()
            return json.loads(result) if result else None
    except HTTPError as error:
        # Do not echo request headers, credentials or arbitrary remote response bodies.
        raise RuntimeError(f"{method} {urlsplit(url).path}: HTTP {error.code}") from None
    except (URLError, TimeoutError):
        raise RuntimeError(f"{method} {urlsplit(url).path}: connection failed or timed out") from None


def validate_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError("Expected an API response object")
    source = payload.get("source", {})
    if source.get("id") != "brent" or source.get("provider") != "FRED":
        raise ValueError("Expected the Brent series from FRED")
    if source.get("unit") != "USD/barrel":
        raise ValueError("Unexpected Brent units; do not convert or guess")
    raw = payload.get("data")
    if not isinstance(raw, list) or not raw:
        raise ValueError("API returned no observations")
    rows = {}
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("Invalid observation object")
        if item.get("series") != "brent" or item.get("unit") != "USD/barrel" or item.get("source") != "FRED":
            raise ValueError("Mixed or unexpected observation series, unit or source")
        observed_date = item.get("date")
        if not isinstance(observed_date, str) or date.fromisoformat(observed_date).isoformat() != observed_date:
            raise ValueError("Observation date must be YYYY-MM-DD")
        raw_value = item.get("value")
        if isinstance(raw_value, bool) or raw_value is None:
            raise ValueError("Missing or invalid observation value")
        try:
            value = Decimal(str(raw_value))
        except InvalidOperation:
            raise ValueError("Invalid numeric observation value") from None
        if not value.is_finite():
            raise ValueError("Observation values must be finite")
        if observed_date in rows:
            raise ValueError("Duplicate observation dates; resolve before importing")
        # PostgREST casts this decimal string to Postgres numeric, avoiding float rounding.
        rows[observed_date] = {"observation_date": observed_date, "value": format(value, "f"),
                               "value_type": "OBSERVED"}
        # retrieved_at describes collection time, NOT historical availability.
        # Never use it to invent availability_timestamp.
    return source, [rows[key] for key in sorted(rows)]


def supabase_settings():
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SECRET_KEY", "")
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.path not in ("", "/") or parsed.query or parsed.fragment or parsed.username:
        raise ValueError("Set SUPABASE_URL to your HTTPS project URL, without a path or credentials")
    if not key:
        raise ValueError("Set SUPABASE_SECRET_KEY in this terminal; never place it in frontend code")
    headers = {"apikey": key, "Content-Type": "application/json"}
    # Legacy service_role JWTs require Authorization; sb_secret keys use apikey only.
    if key.startswith("eyJ"):
        headers["Authorization"] = "Bearer " + key
    return url, headers


def check_supabase():
    url, headers = supabase_settings()
    # Read-only schema/permissions preflight before any write. Live UUID schema required.
    for table, columns in [
        ("market_series", "series_id,series_key,source_name,source_url,currency_code,unit,price_definition"),
        ("market_observations", "observation_id,series_id,observation_date,value,value_type,availability_timestamp"),
    ]:
        request_json(f"{url}/rest/v1/{table}?" + urlencode({"select": columns, "limit": 1}), headers=headers)
    return url, headers


def apply_rows(source, rows, series_key, batch_size=500):
    url, headers = check_supabase()
    series = {"series_key": series_key, "source_name": source["provider"],
              "source_url": source.get("source_url"), "currency_code": "USD", "unit": source["unit"],
              "price_definition": "FRED DCOILBRENTEU Brent-Europe spot benchmark"}
    saved = request_json(url + "/rest/v1/market_series?on_conflict=series_key", method="POST",
                         headers={**headers, "Prefer": "resolution=merge-duplicates,return=representation"}, payload=series)
    if not isinstance(saved, list) or len(saved) != 1:
        raise RuntimeError("Expected one saved market series")
    series_id = str(UUID(saved[0]["series_id"]))
    count = 0
    for offset in range(0, len(rows), batch_size):
        batch = [{**row, "series_id": series_id} for row in rows[offset:offset + batch_size]]
        request_json(url + "/rest/v1/market_observations?on_conflict=series_id,observation_date", method="POST",
                     headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"}, payload=batch)
        count += len(batch)
        print(f"Upserted {count}/{len(rows)} observations")
    return count


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="Use an existing JSON response instead of calling the API")
    parser.add_argument("--mode", choices=["snapshot", "live", "auto"], default="live")
    parser.add_argument("--start", type=date.fromisoformat)
    parser.add_argument("--end", type=date.fromisoformat)
    parser.add_argument("--limit", type=int, default=25000)
    parser.add_argument("--series-key", default="BRENT_CRUDE", help="Use the existing Supabase Brent series key")
    parser.add_argument("--apply", action="store_true", help="Write to Supabase; default is preview only")
    parser.add_argument("--check-supabase", action="store_true", help="Check database access/schema without writing")
    args = parser.parse_args(argv)
    if not 1 <= args.limit <= 25000:
        parser.error("--limit must be between 1 and 25000")
    if args.start and args.end and args.start > args.end:
        parser.error("--start must be on or before --end")
    if not args.series_key.strip():
        parser.error("--series-key must not be empty")
    query = {"mode": args.mode, "limit": args.limit}
    for key in ["start", "end"]:
        if getattr(args, key):
            query[key] = getattr(args, key).isoformat()
    payload = json.loads(args.input.read_text()) if args.input else request_json(DEFAULT_API + "/api/v1/data/brent?" + urlencode(query))
    source, rows = validate_payload(payload)
    served = payload.get("meta", {}).get("served_from", "unknown")
    print(json.dumps({"action": "APPLY" if args.apply else "PREVIEW: no database writes",
                      "series_key": args.series_key, "rows": len(rows), "first_date": rows[0]["observation_date"],
                      "last_date": rows[-1]["observation_date"], "served_from": served,
                      "availability_timestamp": "not supplied: collection time is not publication time"}, indent=2))
    if served != "live":
        print("NOTICE: response is not confirmed live; importing it does not establish current prices.")
    if len(rows) >= args.limit and not args.input:
        print("NOTICE: request limit reached; use explicit date windows to check complete coverage.")
    if args.check_supabase and not args.apply:
        check_supabase()
        print("Supabase access and expected columns verified; no database writes.")
    if args.apply:
        try:
            apply_rows(source, rows, args.series_key)
        except Exception:
            print("Import stopped. Earlier batches may already be saved. Fix the cause and rerun; upserts are repeatable.", file=sys.stderr)
            raise


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, KeyError, OSError) as error:
        print(f"Import failed: {error}", file=sys.stderr)
        sys.exit(1)
