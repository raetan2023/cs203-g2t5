# Purchase-plan executed Ridge and experimental news bounds

The authenticated purchase page calls `/api/v1/purchase-plans/forecast?horizon_days=7|14|30`. `PurchaseForecastService` executes the repository's original `src.predict.predict` through `RidgeInference`, a private Python subprocess. It loads the existing `ridge_*d.joblib` StandardScaler + RidgeCV pipeline, metadata, and compatible `quantile_*d.joblib`. It does not read a published result, substitute `daily_model.py`, train another model, or fall back to the last quote. The dashboard still uses its existing `/api/v1/forecast` publication path.

## Data and honest dates

The model uses its existing audited `ridge-regression-model/data/market_observations.csv` (or the existing `MGO_DATA_DIR` override), its original feature order and publication lags, and its original gamma shrinkage. No news enters Ridge inference. Model/data/code hashes identify the serving snapshot. Files changing during inference cause rejection.

This is a **dated model scenario**, not a live market forecast. The original trained convention anchors each horizon at an observed MGO quote. Target = model quote date + horizon, never application date + horizon. The application date remains the actual current Singapore date; the news day is the previous completed UTC day. Expired model targets remain unavailable. Do not backdate the app, carry inputs beyond the existing seven-day limit, or relabel these horizons.

Verified on 26 October 2026: bundled model inputs end with MGO on 6 October; the original 7- and 14-day targets have expired. The supported 30-day result targets **5 November**, central **USD 1,278.50/MT**. The saved gamma is zero, so this executed Ridge result numerically equals its anchor. Invocation tests observe `Pipeline.predict`; artifact hashes establish identity independently of the number. Supporting current 7/14-day results requires genuine newer, compatible model inputs. Stored gasoil/Dubai rows currently declare `source-defined` units and no currency; they are not silently fed into USD/barrel spread features. The unimplemented original Supabase loader is not presented as working.

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

Final validation on 26 October: 77 backend tests including the opt-in real-data integration, 157 frontend tests and production build, 13 targeted Python prediction/feature/adapter tests, and six launcher checks passed. The normal signed-in Helium browser at `http://127.0.0.1:5174` was also verified with the existing 2,000 MT plan: 30-day model target 5 November, central USD 1,278.50/MT, bounds USD 1,185.25–1,743.70/MT, total USD 2.37m–3.49m. Its disclosure shows artifact `6ba92d4257ca…`, the 6 October anchor and 25 October UTC news. Expired seven-day inference displays unavailable. No market observations, forecasts or saved plans were created by the validation.
