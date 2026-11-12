"""Build display-only news selections from the retained publication evidence."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent


def build():
    research = json.loads((ROOT / 'news-research-2026-11-05-to-11.json').read_text())
    retained = json.loads((ROOT / 'news-curated-2026-11-11.json').read_text())
    days = {}
    urls = set()
    for article in research:
        quote = article['publication_evidence']
        if quote.endswith(' EST'):
            published = datetime.strptime(quote, '%B %d, %Y %I:%M %p EST')
            published = published.replace(tzinfo=timezone(timedelta(hours=-5))).astimezone(timezone.utc)
            day = published.date().isoformat()
            stamp = published.isoformat().replace('+00:00', 'Z')
            basis = 'publisher timestamp with explicit EST offset'
        else:
            day = article['publication_date']
            stamp = day + 'T00:00:00Z'
            basis = 'publisher calendar date placeholder; exact ordering not established'
        assert '2026-11-05' <= day <= '2026-11-11', day
        url = article['url']
        assert urlparse(url).scheme == 'https' and urlparse(url).hostname
        assert url not in urls, url
        assert article['reference'] and quote and article['title'].strip()
        urls.add(url)
        record = dict(article, seen_at=stamp, seen_at_basis=basis,
                      domain=urlparse(url).hostname, collection_method='chat_web_search',
                      classification={'valid': True, 'category': article['category'],
                                      'market_bias': 'unclear', 'method': 'editorial topic only'})
        days.setdefault(day, []).append(record)
    for record in retained['records']:
        if record['url'] not in urls:
            record['classification']['category'] = (
                'economy_inflation' if record['domain'] == 'apnews.com' else
                'geopolitics' if record['domain'] == 'www.axios.com' else
                'monetary_policy' if record['title'].startswith('Dollar') else 'geopolitics')
            days.setdefault('2026-11-11', []).append(record)
            urls.add(record['url'])
    assert len(days) == 7
    output = []
    for day, records in sorted(days.items()):
        end = (datetime.fromisoformat(day) + timedelta(days=1)).date().isoformat()
        output.append({'date': day, 'version': 'curated:chat-web-search:v1', 'payload': {
            'status': 'curated', 'news_date': day, 'start': day + 'T00:00:00Z',
            'end': end + 'T00:00:00Z', 'retrieved_at': datetime.now(timezone.utc).isoformat(),
            'collection_method': 'chat_web_search',
            'coverage': 'Selected publisher stories across multiple topics. Not an exhaustive archive or a complete GDELT window. Display only; excluded from forecasts and spike analytics.',
            'records': sorted(records, key=lambda r: (r['seen_at'], r['url']), reverse=True)}})
    return output


if __name__ == '__main__':
    selections = build()
    (ROOT / 'news-curated-2026-11-05-to-11.json').write_text(json.dumps(selections, indent=2) + '\n')
    print(json.dumps({row['date']: len(row['payload']['records']) for row in selections}, indent=2))
