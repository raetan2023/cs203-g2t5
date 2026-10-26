# Purchase-plan experimental news ranges

The signed-in purchase recommendation page uses `GET /api/v1/purchase-plans/forecast?horizon_days=7|14|30`. This endpoint, the recommendation endpoint, and cost impact use the same `PurchaseForecastService`. The dashboard keeps its existing `/api/v1/forecast` endpoint and state.

The feature requires only the app's existing database and Clerk configuration. There is no new migration, scheduler, Python server, OpenAI request, or user setup step. It reads the existing `market_series` / `market_observations` tables on each request. The page revalidates every minute in the foreground and on tab visibility changes. Singapore midnight refreshes the application date. The browser never receives database credentials.

## Range calculation

An available current published model forecast with the correct completed UTC news window remains preferred and unchanged. When none is available, the explicitly experimental fallback:

1. Uses the latest completed **UTC** GDELT day, paired article count and average tone. It never fills a missing day or tone with zero. Before 08:00 Singapore, this is two Singapore calendar dates earlier; its exact window is displayed.
2. Compares `log(1 + article_count)` and `abs(average_tone)` with paired observations in the preceding 90 calendar days. At least 14 prior paired days are required. Each rank is the proportion of prior values strictly below yesterday's value.
3. Sets `multiplier = 1 + (activity_rank + absolute_tone_rank) / 2`, bounded from 1 to 2. This is an explicit heuristic. More activity or more extreme absolute tone expands the range; these proxies do not directly measure global uncertainty.
4. Computes empirical q10/q90 log returns using exact-date observed MGO pairs from the last 400 days. At least 20 pairs are required. The return span is the selected horizon **plus the age of the reference quote**, because the forecast target is today plus the selected horizon. No target prices are interpolated.
5. Uses `q10_deviation = min(q10, 0)` and `q90_deviation = max(q90, 0)`, then `lower = reference × exp(q10_deviation × multiplier)` and `upper = reference × exp(q90_deviation × multiplier)`. The fallback point is persistence, equal to the last quote, and does not move when news changes. This is labelled explicitly; it is not a new Ridge prediction.

These expanded empirical bounds are **not measured conditional quantiles, calibrated confidence, or guaranteed 80% coverage**. Experimental responses set nominal/empirical coverage to null and evaluation rows to zero. The purchase-only display does not render the dashboard confidence card. Historical return-pair counts are labelled as historical pairs, not out-of-sample coverage observations.

## Synchronization and safeguards

- A deterministic run ID fingerprints the current origin, calculation version, and observed database inputs. It is stable across horizons and changes when source observations change.
- Recommendation and impact requests carry both selected horizon and run ID. A source revision between requests returns 409; old values clear and the shared page refresh/retry loads the new inputs.
- Cost totals use backend decimal multiplication of the same bounds by the selected saved plan's quantity. Plans remain authenticated and ownership/context checks remain in the existing controller.
- The fallback reads only MGO in verified USD/MT and GDELT counts/tone. It does not guess units for gasoil or Dubai and does not change the dashboard's central model.
- Reference quotes up to 30 days old can support an explicitly dated experimental scenario. Quotes older than seven days carry a visible stale-price warning and guidance to compare against a current supplier quote. Beyond 30 days, no fallback range is served.
- Overdue plans and targets beyond the purchase deadline receive explicit guidance. No advice promises a purchasing advantage or treats an old observed price as a live supplier offer.
- Missing previous-day news, missing MGO, incompatible provenance/units, duplicate observations, nonfinite values and insufficient history remain unavailable. Database errors are 503; unsupported horizons are 422. The endpoint requires Clerk authentication and uses `Cache-Control: no-store`.

## Verification

Automated service tests cover news-driven widening with a fixed central point, horizon/run identity, changed-news conflicts, exact-day news, UTC/Singapore rollover, stale quote policy, preserved published forecasts, and quantity multiplication. Authenticated controller tests cover the separate endpoint. Frontend tests cover the normal Clerk adapters, separated dashboard/purchase URLs, horizon synchronization, experimental labels, and rejection of confidence claims in experimental responses.

A read-only smoke test against the actual connected database returned ready ranges, cost impact and recommendation for 7/14/30 days using GDELT through 25 October 2026 and the actual 18 October MGO quote. The original dashboard endpoint stayed unavailable, demonstrating that the experimental fallback does not publish to or replace dashboard forecasts. This verifies integration, not forecasting accuracy.
