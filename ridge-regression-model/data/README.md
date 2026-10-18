# Cleaned market and GDELT data

Prepared 8 October 2026. **The available data is cleaned, but the requested ten-year collection is incomplete.** No exploration or predictive analysis was performed.

## Canonical files

Use these four CSV files, each with a different grain. Do not concatenate daily scores with their underlying document/event evidence.

- `market_observations.csv`: one row per date and series; all eight market source CSVs combined, retaining futures open/high/low, volume, percentage change and quote provenance.
- `gdelt_documents.csv`: one row per UTC indexing date and exact document URL, with mean tone, topic tags and count of source indexing records.
- `gdelt_matched_events.csv`: one row per UTC indexing date and event ID, restricted to exact same-day matches to tagged document URLs. Different events sharing a URL remain separate.
- `gdelt_daily_scores.csv`: all 3,653 requested dates, with daily means, supporting counts and explicit coverage status.

All files use UTF-8, comma separators, quoted fields when needed, LF newlines, snake_case headers, ISO dates, UTC timestamps with Z, plain decimal numbers and empty fields for missing data. Dates are ascending. Monthly bunker-sales dates are the first day of the represented month, not an event date. `change_pct` uses percentage points, so 1.18 means 1.18%, not 0.0118. Zero remains zero; no interpolation, filling, unit conversion or outlier deletion was applied.

## Coverage and limits

Requested window: 6 October 2016 to 6 October 2026 inclusive. Full original MPA history is retained, including observations before this window; filter explicitly when needed. Monthly observations are not converted to daily values. Weekends, holidays and irregular source reporting are not classified as failed downloads solely because no observation exists.

| Source | Rows | First date | Last date | Missing values |
|---|---:|---|---|---:|
| brent_fred.csv | 2,604 | 2016-10-06 | 2026-09-29 | 73 |
| dubai_crude_investing.csv | 2,513 | 2016-10-06 | 2026-10-05 | 0 |
| sg_bunker_sales_mpa.csv | 6,080 | 1995-01-01 | 2026-08-01 | 0 |
| sg_gasoil_investing.csv | 2,510 | 2016-10-06 | 2026-10-05 | 0 |
| sg_hsfo_themaritime.csv | 255 | 2020-03-13 | 2026-10-06 | 0 |
| sg_mgo_themaritime.csv | 253 | 2020-03-13 | 2026-10-06 | 0 |
| sg_vlsfo_themaritime.csv | 253 | 2020-03-13 | 2026-10-06 | 0 |
| usd_index_fred.csv | 2,607 | 2016-10-06 | 2026-10-02 | 115 |

GDELT coverage: {"collected_available_archives": 100, "events_only": 16, "not_collected": 3537}. The trackers contain 100 unique GKG news days and 116 Events days, with no recorded download failures. The daily score release incorporates only the available evidence; a calendar row is not proof of collection. Source archive gaps remain possible even for `collected_available_archives` dates.

MGO starts in March 2020 and has only 253 irregular observations. It is not a ten-year daily series. Brent ends on 29 September 2026; the USD index ends on 2 October; both futures series end on 5 October; bunker sales end in August. Missing source values remain explicitly blank. The USD index is FRED's broad trade-weighted index, not ICE DXY.

## What was removed and retained

Market duplicate rows removed: 0. Repeated within-day news indexing records collapsed into document records: 4,712. Duplicate Event-ID records removed from scanned sources: 0. Conflicting keys cause cleanup to stop; none are silently discarded. Identical values on different dates and zero bunker sales are retained.

Exact duplicate file groups found: 4. Redundant byte copies moved to reversible quarantine: 3; paths and retained copies are recorded in `quality_audit.json`. Source captures (HTML/JSON), full GKG fields, compact extractions, monthly inputs, trackers and caches have different provenance or recovery roles. They remain outside this distribution rather than being treated as duplicate observations. Temporary downloads and diagnostic source-defect archives are not included.

## Interpretation and units

Document tone is a news-language measure, not oil-price direction. Goldstein is a political-stability event-type score, not oil severity. Daily document tone averages each URL equally after averaging its available indexing tones. Daily Goldstein averages distinct matched event IDs equally, excluding blank scores. URLs are matched exactly; no rewriting of query strings, trailing slashes or case was performed. Different URLs can describe the same real-world event. The eight broad topic tags identify candidates, not independently verified oil/shipping relevance.

Values remain in their source units. Definition checks on 8 October 2026 establish bunker quotes in USD/metric tonne, Brent and the named futures products in USD/barrel, the USD index as January 2006=100, and MPA sales in thousand tonnes. MPA’s original workbook resolves a conflicting catalogue label; no numeric conversion was made. Exact futures roll construction, volume units, MGO grade details and historical availability times remain unverified. See [DATA_DICTIONARY.md](DATA_DICTIONARY.md) for all 23 market series, the two daily GDELT scores, every release column, sources and comparability decisions. Historical numeric values have not been comprehensively revalidated against providers.

## Verification and reproducibility

`manifest.json` gives row counts, date bounds, key counts and SHA-256 hashes for each CSV. `quality_audit.json` records source hashes, tracker coverage, source-level missingness and duplicate decisions. Verification checks date validity, key uniqueness, tone/Goldstein bounds and high/low consistency. Completed GKG and Events files were compared with their tracker checksums; Events gzip/schema/date/row counts were scanned. Document references were refreshed through the existing checksum-verifying summarizer. Full GKG record parsing was not independently repeated in this cleanup; preserved acquisition audits cover that layer.

Rebuild: run `scripts/summarize_gdelt.py`, then `scripts/clean_distribution.py`, then `scripts/finalize_distribution.py`, and finally `scripts/build_data_dictionary.py` from the workspace. Sources and release are separate. The accompanying audit notebook exposes the checks without performing exploratory analysis.
