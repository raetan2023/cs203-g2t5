# Data dictionary and comparability guide

Verified 8 October 2026. Covers all 23 market series and both delivered daily GDELT scores. Numeric data was not changed.

## What is now established

- Singapore bunker indications: **USD per metric tonne**. They are benchmark indications, not completed transaction prices.
- Brent and the named Singapore gasoil / Dubai futures products: **USD per barrel**. The futures products cash-settle and are not physical MGO quotes.
- Broad USD index: **January 2006 = 100**, without a currency denomination. It cannot convert USD into SGD.
- MPA sales: **thousand tonnes**, not tonnes. The catalogue description conflicts with MPA’s original spreadsheet; all 320 category values checked for 2025–August 2026 match exactly.
- Exact futures roll method, volume units, historical availability times and exact MGO sulphur grade remain **unverified**.

## Series reference

| Series | Meaning | Unit / currency | Frequency | Local coverage | Definition evidence |
|---|---|---|---|---|---|
| `brent_fred` | EIA Brent-Europe crude spot benchmark distributed by FRED. | USD/barrel; USD | daily source observations; holidays may be blank | 2016-10-06 to 2026-09-29; 2,604 rows | [Source](https://fred.stlouisfed.org/series/DCOILBRENTEU) |
| `usd_index_fred` | Federal Reserve nominal broad US dollar index, distributed by FRED. | index points; January 2006=100; not applicable | daily source observations; holidays may be blank | 2016-10-06 to 2026-10-02; 2,607 rows | [Source](https://fred.stlouisfed.org/series/DTWEXBGS) |
| `sg_gasoil_investing` | Vendor futures closing-price series. CME product cash-settles against a monthly Singapore physical-gasoil assessment average. | USD/barrel; USD | daily trading-date observations | 2016-10-06 to 2026-10-05; 2,510 rows | [Source](https://www.investing.com/commodities/nymex-singapore-gasoil-platts-c1-futures-historical-data) |
| `dubai_crude_investing` | Vendor futures closing-price series. CME product cash-settles against a monthly Dubai prompt-month assessment average. | USD/barrel; USD | daily trading-date observations | 2016-10-06 to 2026-10-05; 2,513 rows | [Source](https://www.investing.com/commodities/dubai-crude-oil-platts-futures-historical-data) |
| `sg_mgo_themaritime` | Port-of-Singapore bunker price indication republished by The Maritime from Ship & Bunker and archived captures. | USD/metric tonne; USD | irregular observed quote dates; underlying provider publishes weekday indications | 2020-03-13 to 2026-10-06; 253 rows | Preserved HTML + [provider methodology](https://www.shipandbunker.com/about/about-sb-prices) |
| `sg_hsfo_themaritime` | Port-of-Singapore bunker price indication republished by The Maritime from Ship & Bunker and archived captures. | USD/metric tonne; USD | irregular observed quote dates; underlying provider publishes weekday indications | 2020-03-13 to 2026-10-06; 255 rows | Preserved HTML + [provider methodology](https://www.shipandbunker.com/about/about-sb-prices) |
| `sg_vlsfo_themaritime` | Port-of-Singapore bunker price indication republished by The Maritime from Ship & Bunker and archived captures. | USD/metric tonne; USD | irregular observed quote dates; underlying provider publishes weekday indications | 2020-03-13 to 2026-10-06; 253 rows | Preserved HTML + [provider methodology](https://www.shipandbunker.com/about/about-sb-prices) |
| `Marine Diesel Oil` | Monthly Singapore bunker sales volume for MPA category MDO. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `Bio-Blended Marine Diesel Oil` | Monthly Singapore bunker sales volume for MPA category Bio-blended MDO. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `Marine Gas Oil` | Monthly Singapore bunker sales volume for MPA category MGO. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `Bio-Blended Marine Gas Oil` | Monthly Singapore bunker sales volume for MPA category Bio-blended MGO. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `Low Sulphur Marine Gas Oil` | Monthly Singapore bunker sales volume for MPA category LSMGO. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `Bio-Blended Low Sulphur Marine Gas Oil` | Monthly Singapore bunker sales volume for MPA category Bio-blended LSMGO. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `Marine Fuel Oil` | Monthly Singapore bunker sales volume for MPA category MFO. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `Bio-Blended Marine Fuel Oil` | Monthly Singapore bunker sales volume for MPA category Bio-blended MFO. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `Low Sulphur Fuel Oil` | Monthly Singapore bunker sales volume for MPA category LSFO. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `Bio-Blended Low Sulphur Fuel Oil` | Monthly Singapore bunker sales volume for MPA category Bio-blended LSFO. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `Ultra Low Sulphur Fuel Oil` | Monthly Singapore bunker sales volume for MPA category ULSFO. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `Bio-Blended Ultra Low Sulphur Fuel Oil` | Monthly Singapore bunker sales volume for MPA category Bio-blended ULSFO. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `B100` | Monthly Singapore bunker sales volume for MPA category B100. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `LNG` | Monthly Singapore bunker sales volume for MPA category LNG. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `Methanol` | Monthly Singapore bunker sales volume for MPA category Methanol. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `Ammonia` | Monthly Singapore bunker sales volume for MPA category Ammonia. | thousand tonnes; not applicable | monthly | 1995-01-01 to 2026-08-01; 380 rows | [MPA original workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) |
| `mean_document_tone` | Equal-weight daily mean of per-URL mean GKG tones. The source tone measures positive minus negative language. | tone score [-100,100]; not applicable | daily UTC record date; only 100 dates populated | 100 populated days: 2016-10-06 to 2017-01-14 | [Source](https://data.gdeltproject.org/documentation/GDELT-Global_Knowledge_Graph_Codebook-V2.1.pdf) |
| `mean_goldstein` | Equal-weight daily mean of distinct matched event-type scores; source scores concern theoretical political stability. | Goldstein score [-10,10]; not applicable | daily UTC record date; only 100 dates populated | 100 populated days: 2016-10-06 to 2017-01-14 | [Source](https://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf) |

## Can these series be compared with MGO?

| Comparison | Decision | Reason / preparation required |
|---|---|---|
| MGO vs HSFO / VLSFO | Same quoted unit, different fuel products | Plot separately or compare co-movement; do not combine them into one MGO target. Grade, energy content and commercial terms differ. |
| MGO vs Singapore gasoil futures | Candidate feature; not an interchangeable price | Gasoil is USD/barrel, MGO USD/tonne; futures versus physical-indication basis. Units alone do not remove grade and market-basis differences. |
| MGO vs Brent / Dubai | Candidate crude-market features | Crude versus refined bunker fuel; Brent is spot while Dubai input is futures. Raw subtraction is not an economically defined spread. |
| MGO vs broad USD index | Candidate macro feature | Index points measure a different quantity; not a currency conversion rate. |
| MGO vs MPA sales | Candidate monthly demand context | Volume is not price. MGO and LSMGO sales are distinct categories; exact correspondence to quote grade is unverified. |
| MGO vs GDELT | Not currently testable | Supplied scores end 14 January 2017; MGO begins 13 March 2020. Zero date overlap. |

For price-level spreads, first choose a physically justified product-specific density conversion. A generic barrel-to-tonne factor is insufficient. For separately scaled or rebased plots, units may stay different if labels are explicit; rebasing does not make products equivalent. No conversion has been applied.

## Source-specific limitations

### Bunker price indications

The saved page states USD/MT and labels HSFO 3.5% sulphur and VLSFO 0.5%. MGO is only labelled Marine Gas Oil. Its precise sulphur and ISO grade are not established. All three CSVs retain Ship & Bunker / Internet Archive provenance. The underlying provider uses market indications and typical stem sizes; quote-day values may update later. [Provider methodology](https://www.shipandbunker.com/about/about-sb-prices).

### Futures inputs

The provider identifies SGBc1 and DBLc1 with daily closing-price tables and USD denomination. The named CME gasoil and Dubai products have 1,000-barrel cash-settled contracts, confirmed by [chapter 669](https://www.cmegroup.com/rulebook/NYMEX/6/669.pdf) and [chapter 511](https://www.cmegroup.com/rulebook/NYMEX/5/511.pdf). This establishes the named-product convention, not every historical vendor splice. The provider’s rollover and contract-detail fields are blank. Do not claim verified roll dates, back-adjustment, settlement-versus-close equality or unchanged historical grade rules.

### Sales scale and categories

The MPA original workbook heading reads "BUNKER SALES (in '000 tonnes)". For example, the August 2026 category sum is 4,772.68, representing 4,772,680 tonnes. The stored values remain in thousands of tonnes. Each of 16 categories has 380 monthly records; zeros are preserved without inferring that a product was available throughout history. The workbook identifies August as preliminary and allows subsequent revisions. Its notes distinguish LSMGO / ULSFO sulphur limits from LSFO and flag an LSFO definition difference before 2015. See [MPA workbook](https://www.mpa.gov.sg/api/media/9cd431ec-4e86-418b-951b-b96a09cd3991/bunker-sales_Aug-2026.xls) and the local reconciliation evidence.

### Date and publication-time rules

Market dates are observation/trading dates, not release timestamps. Monthly dates are first-of-month labels, not the date the sales total became known. Historical source availability and revision vintages are missing. A same-day match is therefore not proof that an input was available before an MGO quote. GDELT event_date comes from SQLDATE; indexed_at_utc comes from DATEADDED. GKG document timestamps follow the retained archive/record timestamps; webpage publication times were not independently validated. Daily scores require the full UTC day.

### GDELT meaning

GKG tone represents language sentiment; Goldstein reflects the theoretical stability effect of an event type. Neither measures oil-price impact. Local scores use exact same-day document-URL matches, exclude missing scores and retain counts. Broad topic selection does not establish relevance to Singapore bunker pricing. See [GKG codebook](https://data.gdeltproject.org/documentation/GDELT-Global_Knowledge_Graph_Codebook-V2.1.pdf) and [Events codebook](https://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf).

## Every delivered column

### gdelt_daily_scores.csv

| Column | Type | Definition |
|---|---|---|
| `date` | ISO date | Market source date, first day of represented sales month, or UTC GDELT record date; context depends on table. |
| `coverage_status` | category | collected_available_archives: both sources; events_only: Events without GKG scores; not_collected: neither. Available archives may still have source gaps. |
| `mean_document_tone` | decimal or blank | Tone score: per-URL mean in documents; equal-weight mean of those URL means in daily scores. |
| `mean_goldstein` | decimal or blank | Mean of nonmissing Goldstein scores from distinct same-day URL-matched event IDs. |
| `document_count` | integer or blank | Distinct exact URLs in that UTC day; blank on dates without GKG. |
| `documents_with_tone` | integer or blank | Document means entering the daily tone denominator. |
| `matched_event_count` | integer or blank | Number of same-day exact-URL-matched event IDs; not all worldwide events. |
| `events_with_goldstein` | integer or blank | Nonmissing matched-event Goldstein scores entering the denominator. |

### gdelt_documents.csv

| Column | Type | Definition |
|---|---|---|
| `date` | ISO date | Market source date, first day of represented sales month, or UTC GDELT record date; context depends on table. |
| `first_seen_utc` | UTC timestamp | Earliest retained GKG record timestamp for the exact URL that day; not independently verified webpage publication time. |
| `source` | string or blank | GKG source name for the retained URL group. |
| `url` | string | Exact document identifier / matched SOURCEURL; no URL canonicalisation. |
| `topic_tags` | semicolon-separated strings | Sorted union of matched candidate tags for the URL/day; no proof of economic relevance. |
| `mean_document_tone` | decimal or blank | Tone score: per-URL mean in documents; equal-weight mean of those URL means in daily scores. |
| `index_record_count` | integer | Count of source GKG records collapsed into that URL/day; not distinct events. |

### gdelt_matched_events.csv

| Column | Type | Definition |
|---|---|---|
| `date` | ISO date | Market source date, first day of represented sales month, or UTC GDELT record date; context depends on table. |
| `event_id` | identifier string | GDELT GlobalEventID; preserved as an identifier rather than a measurable numeric variable. |
| `event_date` | ISO date | Source SQLDATE occurrence date; not independently established and not used to assign release availability. |
| `indexed_at_utc` | UTC timestamp | Source Events DATEADDED timestamp; distinct from event_date. |
| `url` | string | Exact document identifier / matched SOURCEURL; no URL canonicalisation. |
| `goldstein` | decimal or blank | Event-type score [-10,10]; blank scores are excluded from daily averaging. |
| `average_tone` | decimal or blank | Events AvgTone [-100,100]; separate from GKG document tone and unused in the delivered daily tone. |

### market_observations.csv

| Column | Type | Definition |
|---|---|---|
| `date` | ISO date | Market source date, first day of represented sales month, or UTC GDELT record date; context depends on table. |
| `frequency` | category | Stored daily/monthly label; daily does not imply an observation on every day. |
| `series` | string | Exact identifier joining to series_dictionary.csv; MPA fuel labels are preserved. |
| `value` | decimal or blank | Series-specific unit; never combine different series without consulting their units. |
| `value_status` | category | observed or source_missing; observed means present in the source, not independently verified. |
| `source_file` | relative path | Original input path within the workspace. |
| `quote_source` | string or blank | Original bunker-provider attribution; applicable to The Maritime quote series. |
| `open` | decimal or blank | Vendor futures open; same unit as value; absent for other source types. |
| `high` | decimal or blank | Vendor futures high; same unit as value. Equal OHLC values do not establish intraday activity. |
| `low` | decimal or blank | Vendor futures low; same unit as value. |
| `volume` | decimal or blank | Vendor volume after K/M/B expansion; exact unit unverified; blank is not zero. |
| `change_pct` | percentage points or blank | Vendor percentage change, e.g. 1.18 means 1.18%, not 0.0118; not recomputed. |

## Files for handover

- `series_dictionary.csv` / `.json`: one definition per market series or daily score, with unit, currency, frequency, provenance, comparability, verification status and open attributes.
- `field_dictionary.csv`: every column in all four release CSVs.
- `definition_evidence.json`: source links, checks and fingerprints of the local evidence.
- `metadata/definitions/`: retained MPA workbook, extraction and 320-value reconciliation. These supporting files are also included inside the distribution ZIP.
- Existing data CSVs and their checksum manifest retain their original hashes.
