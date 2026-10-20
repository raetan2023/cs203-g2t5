# All market sources: local integration

Work remains on `market-data-integration`. These changes are local until explicitly authorized for commit/push. No shared database import is run automatically by opening the dashboard.

## Sources and schema mapping

| API dataset | Supabase series key(s) | Treatment |
|---|---|---|
| `brent` | `BRENT_CRUDE` | USD/barrel |
| `mgo_singapore` | `SGP_MGO_OBSERVED` | Actual public quote observations, USD/MT; sparse dates remain sparse |
| `gasoil_singapore` | `SGP_GASOIL_FUT` | Manual futures snapshot; retain `source-defined` unit if unresolved |
| `dubai_crude` | `DUBAI_CRUDE` | Manual futures snapshot; retain unresolved unit |
| `usd_index` | `USD_INDEX` | Broad trade-weighted USD index, not currency conversion or ICE DXY |
| `bunker_sales` | `MPA_BUNKER_SALES_<CATEGORY>` | One series per fuel category; preserve published thousand-tonne units and zeros |
| `gdelt` | `GDELT_ARTICLE_COUNT`, `GDELT_AVERAGE_TONE` | Separate numeric daily aggregates; missing tone remains missing; current day may be partial |

These numeric observations fit the existing UUID schema and unique `(series_id, observation_date)` index. No new tables or migrations are needed. This does not import raw GDELT documents/events or store full source metadata. Observation collection timestamps are never substituted for unknown historical publication timestamps.

## Preview first

```sh
python3 data-ingestion/import_market.py --source all
python3 data-ingestion/import_market.py --source mgo_singapore usd_index
python3 -m unittest discover -s data-ingestion -p 'test_*.py'
```

The default is snapshot mode with no writes. All selected responses are fetched and validated before any writes. If even one selected source fails, nothing is written. Rows preserve decimal strings, source units, and the actual row provider (including `Investing.com manual export`). Upserts are batched; later write failures can leave earlier batches saved. Rerun safely after fixing the problem. A result reaching the API's 25,000-record limit is rejected to avoid silently importing truncated history; if that happens, use bounded date-window imports before scheduling.

The existing `import_brent.py` interface remains compatible. To write selected sources using the new importer, configure the same server-only Supabase secrets and add `--apply` deliberately. Review existing series keys before applying so a differently named existing series is not duplicated. `SGP_MGO_OBSERVED` deliberately differs from the legacy `SGP_MGO_DERIVED` proxy label.

## API verification on 2026-10-20

All seven full snapshot previews passed without writing to Supabase:

| Dataset | Numeric rows | Latest observation |
|---|---:|---|
| Brent | 6,487 | 2026-10-14 |
| MGO | 265 | 2026-10-18 |
| Gasoil | 2,961 | 2026-10-16 |
| Dubai | 3,135 | 2026-10-16 |
| USD index | 5,212 | 2026-10-16 |
| Bunker sales | 6,080 across 16 fuel categories | 2026-08-01 |
| GDELT | 154 count/tone rows | 2026-10-20 |

Counts describe the available API responses, not guaranteed complete market history. Gasoil and Dubai notes explicitly require manual upstream refresh. Repeated snapshot synchronization does not make those feeds live.

## Read-only dashboard

`GET /api/v1/market/stored` reads up to 60 observed values per imported series from the actual Supabase UUID tables. The existing market API key filter protects it. The response lists stored series, their individual observation dates/units, recent histories, missing source labels, and database read time. A database failure returns 503 without using API or example values.

The Market dashboard now renders this response, replacing its former external/mock fallback view. It polls once per minute, retains clearly marked previous data on refresh failure, and offers manual refresh. It shows price/index cards, monthly fuel-category sales, separate GDELT aggregates, and selectable stored history. No forecast, gasoil conversion, crack spread or guessed sales total is manufactured. Until other series are actually imported, only Brent may appear; missing sources are listed explicitly. Existing historical services remain in the repository for compatibility, but this page no longer calls them.

The original `/api/v1/market/brent` endpoint remains compatible. The existing `BRENT_SERIES_KEY` backend override is honored for Brent; the all-source importer uses the keys in the table above.

## Workflow (not enabled or pushed by this change)

New file `.github/workflows/import-market.yml` runs a snapshot preview on relevant branch pushes **after publication**. It reuses repository secrets `SUPABASE_URL` and `SUPABASE_SECRET_KEY` but uses separate, default-off variables:

- `MARKET_TEST_IMPORT_ENABLED=true`: permit test-branch writes on push/re-run.
- `MARKET_DAILY_IMPORT_ENABLED=true`: permit scheduled writes only when the workflow exists on the default branch.

Leave these unset/false until intentionally testing imports. Old `BRENT_*` switches never authorize all-source writes. The old Brent workflow remains compatible; keep its write switches off if using the all-source workflow, avoiding redundant imports. Both workflows share a concurrency group to prevent overlapping jobs.

Manual dispatch selects one source or `all`, with `apply` unchecked by default. As with the old workflow, dispatch/scheduled use requires default-branch publication; branch pushes allow preview before merging. Nothing in this local work changes `main`, repository secrets/variables, or the remote workflows.
