# Purchase-plan executed Ridge and experimental news bounds

The authenticated purchase page calls `/api/v1/purchase-plans/forecast?horizon_days=7|14|30`. `PurchaseForecastService` executes the repository's original `src.predict.predict` through `RidgeInference`, a private Python subprocess. It loads the existing `ridge_*d.joblib` StandardScaler + RidgeCV pipeline, metadata, and compatible `quantile_*d.joblib`. It does not read a published result, substitute `daily_model.py`, train another model, or fall back to the last quote. The dashboard still uses its existing `/api/v1/forecast` publication path.

## Data and honest dates

The purchase adapter uses the current Supabase observations supplied in memory by Spring, with the original feature order, publication lags and gamma shrinkage. There is no CSV fallback in the purchase subprocess. No news enters Ridge inference. Model/data/code hashes identify the serving snapshot; files changing during inference cause rejection. The separate legacy FastAPI predictor still reads its configured CSV.

This is a **dated model scenario**, not a live market forecast. The original trained convention anchors each horizon at an observed MGO quote. Target = model quote date + horizon, never application date + horizon. The application date remains the actual current Singapore date; the news day is the previous completed UTC day. Expired model targets remain unavailable. Do not backdate the app, carry inputs beyond the existing seven-day limit, or relabel these horizons.

The Supabase loader validates provider, exact product URL, units, currency, positive finite values, duplicates and observation dates before building the original wide feature table. Futures marked `source-defined` are accepted only when their exact product URL matches a repository dictionary entry verified as USD/barrel. No numeric conversion or database metadata rewrite is performed. Same-day observed MGO quotes are permitted; future market observations and incomplete UTC news days are excluded. Missing/stale features and expired targets fail closed.

The saved Ridge gamma can be zero, so executed inference can numerically equal the observed anchor. Invocation tests observe `Pipeline.predict`; artifact hashes establish identity independently of the resulting number.

## Bounds only

1. Read actual stored `GDELT_ARTICLE_COUNT` and `GDELT_AVERAGE_TONE` for the previous completed UTC day. Missing, partial, duplicate, future or wrong-day data fails closed. Never invent a neutral day.
2. Compare `log1p(count)` and `abs(tone)` against paired days in the prior 90 days, requiring at least 14 pairs. Rank = fraction strictly below yesterday's value.
3. Set `multiplier = 1 + (activity_rank + absolute_tone_rank)/2`, between 1 and 2.
4. Take the original compatible calibrated quantile-artifact endpoints `L, U` and the executed Ridge central price `C`. Set `dL=min(0,log(L/C))`, `dU=max(0,log(U/C))`. Return `C*exp(multiplier*dL)` and `C*exp(multiplier*dU)`. This includes C if the independent quantile models put it outside their interval. It does not add quote-age scaling: the original horizon already runs from the quote anchor to the actual target.

These are **experimental q10/q90-based bounds**, not news-conditioned calibrated quantiles or guaranteed 80% confidence. Nominal/empirical conditional coverage is null; evaluation rows are zero. The original artifact evaluation does not establish coverage after news widening. No purchasing advantage is claimed.

## Synchronization and startup

The run ID fingerprints application date, calculation version, stored database observations and the full inference snapshot across horizons. News/source/artifact revisions invalidate previous run IDs. Recommendation and impact re-run the same provider and reject a mismatched requested ID with 409. Backend decimal multiplication uses the same bounds and saved quantity; controllers retain owner/context checks and no-store. Existing foreground/minute/date-rollover refresh, retries and obsolete-response protection remain.

Run `./run.command` from this checkout. In addition to existing ignored env files, install the Python runtime once:

```sh
python3 -m venv .venv
.venv/bin/pip install -r ridge-regression-model/requirements.txt
```

The launcher checks dependencies and sets absolute `MGO_RIDGE_ROOT` and `MGO_RIDGE_PYTHON`; both can be overridden. Direct Maven launches resolve defaults relative to `backend/`. No new listening service, port, OpenAI key, headline fetch or database migration is required. Alternative review ports: `PORT=8001 FRONTEND_PORT=5174 ./run.command`; ensure `VITE_API_URL` and `FRONTEND_ORIGINS` match these ports. Do not stop services belonging to another checkout.

## Verification

- Python real-artifact tests compare the adapter with standalone original inference, observe the Ridge estimator invocation, verify SHA-256 identity, exercise the actual subprocess and reject expired horizons.
- Backend unit tests cover unchanged central price under changed news, bounds widening, run revisions, missing/partial/future news, duplicates, UTC rollover, explicit inference failure and quantity costs.
- `RidgeLiveIntegrationTests` is opt-in (`RUN_RIDGE_LIVE=true ./mvnw -Dtest=RidgeLiveIntegrationTests test`, with the normal backend environment exported). It reads an existing saved plan and genuine market/news rows, executes actual Python artifacts through the normal Spring controllers, compares the standalone central price, provenance and costs, and checks recommendation availability. It changes news only in memory to prove invariance. Identity resolution/JWT verification alone are replaced in this test; it makes no database writes.
- Frontend tests validate anchor horizons with newer stored news/history, expired and falsely relabelled targets, experimental no-coverage claims, normal authenticated adapters, retries and stale-response handling. Production build is required.

The timing comparison reads 7/14/30-day estimates from one source snapshot and plots central prices with experimental bounds. It suggests the lowest central estimate within the saved deadline, breaks ties toward the earlier horizon, and flags overlapping ranges. Missing/stale forecasts do not support a timing choice. If all three dates miss the deadline, the page directs the buyer to purchase within their saved window using a current supplier quote. Selection and comparison reuse cached/in-flight reads and foreground refresh; mismatched source runs are rejected.

Latest frontend validation: 163 tests and production build passed. The normal signed-in browser showed all three prices/ranges and correctly recommended buying within five days for a plan due on 31 October, with all 7/14/30-day options marked after its deadline. Python adapter/database-loader checks passed (13 tests). No market observations, forecasts or saved plans were created by this validation.
