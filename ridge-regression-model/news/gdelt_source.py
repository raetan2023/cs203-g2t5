"""Where the news comes from.

LIVE: GDELT DOC 2.0 API (ArtList) gives real headlines. It officially covers only about the last 3 months and
asks for at most one request per 5 seconds.
OFFLINE DEMO: the downloaded gdelt_documents.csv has NO headline text (only url, tags, tone), and covers
Oct 2016 - Jan 2017. slug_headline() recovers rough text from the URL; use it for demos only."""
import re
import time
from datetime import date, datetime, timedelta
from urllib.parse import urlparse, unquote
from typing import Optional
import requests
from . import config
from .types import NewsItem

DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc"


def fetch_headlines(query=None, timespan=None, max_records=75, target_date: Optional[date] = None,
                    get=requests.get, sleep=time.sleep, retries=3):
    params = {"query": query or config.GDELT_QUERY, "mode": "ArtList", "format": "json", "sort": "DateDesc",
              "maxrecords": min(int(max_records), 250)}
    if target_date is None:
        params["timespan"] = timespan or config.GDELT_TIMESPAN
    else:
        next_day = target_date + timedelta(days=1)
        params["startdatetime"] = target_date.strftime("%Y%m%d") + "000000"
        params["enddatetime"] = next_day.strftime("%Y%m%d") + "000000"
    for attempt in range(retries):
        r = get(DOC_URL, params=params, timeout=30)
        if r.status_code == 429:
            sleep(6); continue
        r.raise_for_status()
        try:
            arts = r.json().get("articles", [])
        except ValueError:
            return []                        # GDELT sometimes returns an empty/plain-text body
        seen, items = set(), []
        for a in arts:
            title = " ".join(str(a.get("title", "")).split())
            key = re.sub(r"\W+", " ", title.lower()).strip()
            if not title or key in seen:
                continue
            seen.add(key)
            try:
                d = datetime.strptime(a["seendate"][:8], "%Y%m%d").date()
            except Exception:
                continue
            if target_date is not None and d != target_date:
                continue
            items.append(NewsItem(title, a.get("url", ""), d, a.get("domain", ""), a.get("language", ""), a.get("sourcecountry", "")))
        return items
    return []


def slug_headline(url: str) -> str:
    """Rough headline from a URL path, e.g. .../army-corps-budges-but-obstacles-remain.html -> 'army corps budges ...'."""
    parts = [p for p in unquote(urlparse(url).path).split("/") if p]
    slug = max(parts, key=lambda p: p.count("-") + p.count("_"), default="")
    slug = re.sub(r"\.(html?|php|aspx?)$", "", slug)
    words = [w for w in re.split(r"[-_]+", slug) if w and not w.isdigit() and not re.fullmatch(r"[0-9a-f]{8,}", w)]
    return " ".join(words) if len(words) >= 4 else ""
