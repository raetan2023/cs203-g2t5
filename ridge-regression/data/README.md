# Data Directory

This directory manages datasets and metadata for **2.5 MGO Price Forecasting**:

## Directory Structure
- `raw/`: Canonical market observations and external sources.
  - `market_observations.csv`: Daily/monthly market series including target MGO bunker indications (`sg_mgo_themaritime`), continuous NYMEX Singapore Gasoil futures (`sg_gasoil_investing`), Brent spot (`brent_fred`), Dubai futures (`dubai_crude_investing`), USD index (`usd_index_fred`), VLSFO, and HSFO.
  - `gdelt_daily_scores.csv`: 3,653 calendar days of GDELT sentiment/Goldstein scores.
  - `gdelt_documents.csv` & `gdelt_matched_events.csv`: Raw news and event tables (>2 GB combined; excluded from Git tracking via `.gitignore`).
- `metadata/`: Release provenance, manifests, and data dictionaries.
  - `DATA_DICTIONARY.md`: Full specification of units, series definitions, and conventions.
  - `context.md`: Contextual limitations (e.g. MGO and GDELT non-overlap).
  - `manifest.json`: Checksums (SHA-256) and row counts.
  - `quality_audit.json`: Data quality audits and duplicate analysis.
  - `series_dictionary.csv` / `.json`: Field definitions per market series.
  - `supporting_evidence/`: Preserved reference documents (e.g., MPA sales workbooks).
- `processed/`: Point-in-time aligned feature matrices.
  - `mgo_aligned_features.csv`: 251 rows of chronological paired observations with strictly lagged features ($t-1$), returns, crack spreads, volatility, anchor quote age, and target returns/prices. No lookahead data leakage.
