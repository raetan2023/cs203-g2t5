"""Import the seven numeric API datasets. Preview by default; --apply writes to Supabase."""
import argparse
from datetime import date
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlencode

import import_brent as db

# API/source units are preserved, including unresolved futures units. No conversions.
SOURCES = {
    "brent": ("BRENT_CRUDE", "FRED", {"USD/barrel"}, "USD"),
    "mgo_singapore": ("SGP_MGO_OBSERVED", "The Maritime", {"USD/MT"}, "USD"),
    "gasoil_singapore": ("SGP_GASOIL_FUT", "Investing.com", {"source-defined", "USD/barrel"}, None),
    "dubai_crude": ("DUBAI_CRUDE", "Investing.com", {"source-defined", "USD/barrel"}, None),
    "usd_index": ("USD_INDEX", "FRED", {"index"}, None),
    "bunker_sales": (None, "data.gov.sg / MPA", {"thousand tonnes (as published)", "thousand tonnes"}, None),
    "gdelt": (None, "GDELT", {"articles"}, None),
}


def numeric(value):
    if value is None or isinstance(value, bool):
        raise ValueError("Missing/invalid numeric value")
    try:
        number = Decimal(str(value))
    except InvalidOperation:
        raise ValueError("Invalid numeric value") from None
    if not number.is_finite():
        raise ValueError("Numeric values must be finite")
    return number


def normalize(payload, source_id):
    key, provider, allowed_units, currency = SOURCES[source_id]
    source = payload.get("source", {})
    if source.get("id") != source_id or source.get("provider") != provider:
        raise ValueError(f"Unexpected source metadata for {source_id}")
    raw = payload.get("data")
    if not isinstance(raw, list) or not raw:
        raise ValueError(f"No observations for {source_id}")
    grouped = {}

    def append(series_key, label, observed_date, value, unit, row_source, row_currency):
        meta = {"series_key": series_key, "source_name": row_source,
                "source_url": source.get("source_url"), "currency_code": row_currency,
                "unit": unit, "price_definition": label,
                "contract_description": source.get("notes") or None}
        if series_key not in grouped:
            grouped[series_key] = {"metadata": meta, "rows": {}}
        group = grouped[series_key]
        if group["metadata"] != meta:
            raise ValueError(f"Inconsistent units/provenance within {series_key}")
        if observed_date in group["rows"]:
            raise ValueError(f"Duplicate series/date in {series_key}")
        group["rows"][observed_date] = {"observation_date": observed_date,
            "value": format(value, "f"), "value_type": "OBSERVED"}

    for row in raw:
        observed = row.get("date")
        if not isinstance(observed, str) or date.fromisoformat(observed).isoformat() != observed:
            raise ValueError("Expected ISO observation date")
        unit = row.get("unit")
        if unit not in allowed_units:
            raise ValueError(f"Unexpected unit for {source_id}: {unit}")
        row_source = row.get("source")
        allowed_providers = {provider}
        if provider == "Investing.com":
            allowed_providers.add("Investing.com manual export")
        if row_source not in allowed_providers:
            raise ValueError(f"Unexpected row provenance for {source_id}")
        value = numeric(row.get("value"))
        label = source.get("name", source_id)
        series = row.get("series", "")
        if source_id == "bunker_sales":
            if not re.fullmatch(r"bunker_sales_[a-z0-9_]+", series):
                raise ValueError("Unknown bunker-sales series")
            if date.fromisoformat(observed).day != 1 or value < 0:
                raise ValueError("Bunker sales require first-of-month labels and nonnegative values")
            series_key = "MPA_" + series.upper()
            label = f"Monthly bunker sales: {series.removeprefix('bunker_sales_').replace('_', ' ')}"
        elif source_id == "gdelt":
            if series != "gdelt_article_count" or value < 0 or value != value.to_integral_value():
                raise ValueError("Expected nonnegative GDELT article count")
            series_key = "GDELT_ARTICLE_COUNT"
            label = "GDELT daily matched article count; current day may be partial"
        else:
            if series != source_id:
                raise ValueError(f"Unexpected series within {source_id}")
            series_key = key
        row_currency = currency
        if unit == "USD/barrel":
            row_currency = "USD"
        append(series_key, label, observed, value, unit, row_source, row_currency)
        if source_id == "gdelt":
            tone = row.get("metadata", {}).get("average_tone")
            if tone is not None:
                append("GDELT_AVERAGE_TONE", "GDELT daily average tone; not price direction",
                       observed, numeric(tone), "tone", row_source, None)
    return [{"metadata": group["metadata"], "rows": [group["rows"][d] for d in sorted(group["rows"])]}
            for _, group in sorted(grouped.items())]


def run(source_ids, mode="snapshot", input_dir=None, apply=False, check=False, limit=25000):
    prepared, reports = [], []
    failures = []
    # Fetch and validate ALL selected responses before the first database write.
    for source_id in source_ids:
        try:
            payload = json.loads((Path(input_dir) / f"{source_id}.json").read_text()) if input_dir else db.request_json(
                f"{db.DEFAULT_API}/api/v1/data/{source_id}?" + urlencode({"mode": mode, "limit": limit}))
            groups = normalize(payload, source_id)
            served = payload.get("meta", {}).get("served_from", "unknown")
            if len(payload["data"]) >= limit and not input_dir:
                raise ValueError("Response limit reached; use dated source windows before applying full history")
            prepared.extend(groups)
            reports.append({"source": source_id, "served_from": served, "series": [
                {"key": group["metadata"]["series_key"], "unit": group["metadata"]["unit"],
                 "rows": len(group["rows"]), "first": group["rows"][0]["observation_date"],
                 "latest": group["rows"][-1]["observation_date"]} for group in groups]})
        except (ValueError, RuntimeError, OSError, KeyError, TypeError) as error:
            failures.append({"source": source_id, "error": str(error)})
    print(json.dumps({"action": "APPLY" if apply else "PREVIEW: no writes", "sources": reports,
                      "failures": failures, "notice": "Observation dates are not publication dates. Snapshot imports are not live collection."}, indent=2))
    if failures:
        raise ValueError("At least one source failed validation; no database writes performed")
    if check or apply:
        url, headers = db.check_supabase()
        print("Supabase schema/access check passed")
    if apply:
        print("Writing selected series; earlier batches may remain if a later write fails.")
        for group in prepared:
            print("Series:", group["metadata"]["series_key"])
            db.write_series(group["metadata"], group["rows"], url, headers)
    return prepared


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", nargs="+", choices=["all", *SOURCES], default=["all"])
    parser.add_argument("--mode", choices=["snapshot", "live", "auto"], default="snapshot")
    parser.add_argument("--input-dir", type=Path)
    parser.add_argument("--check-supabase", action="store_true")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        run(list(SOURCES) if "all" in args.source else list(dict.fromkeys(args.source)),
            args.mode, args.input_dir, args.apply, args.check_supabase)
    except (ValueError, RuntimeError, OSError, KeyError, TypeError) as error:
        print(f"Import stopped: {error}. Rerun safely after resolving the cause.", file=sys.stderr)
        sys.exit(1)
