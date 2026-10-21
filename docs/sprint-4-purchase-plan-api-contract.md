> Multiple-plan update (21 October 2026): CRUD now uses `GET/POST /api/v1/purchase-plans`
> and `GET/PUT/DELETE /api/v1/purchase-plans/{planId}`. Collection GET returns
> `{"plans": [...]}`. Analysis uses the plural paths below and selects the owned
> plan by the existing `plan_id` query parameter. Missing/foreign plans return
> 404; stale inputs or a plan changed during analysis return 409. This supersedes
> the single-plan CRUD assumptions below. The frontend now uses this contract, including selected-plan recommendation links.

# Sprint 4 purchase-plan analysis API contract

Updated: 11 October 2026. Feature HTTP contract implemented on `rae/sprint-4-recommendations`. Rae owns these endpoints and calculations; Wunna owns the real ML provider. Recommendation policy and production source semantics remain unapproved. No model integration or shared database migration is claimed.

## Authentication and existing CRUD

All `/api/v1/purchase-plan` routes require a verified Clerk Bearer token. The backend resolves its subject through `UserAccounts` and queries `PurchasePlanRepository.findByUser`; caller-supplied owner IDs are never used. Existing POST/PUT/DELETE and one-plan-per-user storage remain intact. Plans save without forecasts.

| Method/path | Request | Success |
| --- | --- | --- |
| GET `/api/v1/purchase-plan` | Bearer token | `{ "plan": null }` or `{ "plan": { ... } }` |
| POST `/api/v1/purchase-plan` | `quantity_mt`, `purchase_deadline` | 201 `{ "plan": { ... } }`; existing plan: 409 |
| PUT `/api/v1/purchase-plan` | Same input | 200 `{ "plan": { ... } }`; absent plan: 404 |
| DELETE `/api/v1/purchase-plan` | No body | 204; absent plan: 404 |
| GET `/api/v1/config` | Existing `X-API-Key` | `{ "scenario_as_of_date": "2025-10-24" }` |

Quantity is positive decimal MT. Same-day deadlines are allowed; writes before the active scenario date receive 422 field errors. Existing overdue plans remain readable. Dates are ISO calendar dates, never device time.

GET now returns the active configured `mgo.scenario-date` and derives numeric `days_remaining` from it and the saved deadline. Stored `scenario_as_of_date` records the last write context; reading under a different active scenario does not mutate it. No urgency column or category is added. Scenario configuration is process configuration: changes require restarting the backend. Frontend configuration loads on login/account change; analysis conflict recovery refreshes configuration and saved inputs. A page reload also refreshes it; no polling is added.

## Independent authenticated analysis reads

- GET `/api/v1/purchase-plans/recommendation`
- GET `/api/v1/purchase-plans/cost-impact`

Both require all four query parameters: `plan_id` (UUID), `quantity_mt` (decimal), `purchase_deadline` and `scenario_as_of_date` (ISO dates). These are preconditions, not analysis inputs trusted from the browser. The server resolves the caller's saved plan, checks the tuple against saved inputs and active configuration, then computes only from that authoritative context. Decimal scale is ignored when comparing quantity (`100` equals `100.00`).

Each response echoes the authoritative tuple as `context`. Responses use `Cache-Control: no-store`. A second owned-plan read after provider completion rejects edits/deletion during a slow analysis. No result cache or persisted analysis revision is introduced.

| Status | Meaning/recovery |
| --- | --- |
| 200 | Valid response; each section independently ready or unavailable |
| 401 | Missing, expired or invalid session; sign in again |
| 404 | Caller has no saved plan; reload saved plan |
| 409 | Saved context changed, including plan ID, quantity, deadline or scenario; reload configuration and saved plan |
| 400/422 | Missing or malformed query parameters |
| 503 | Provider failed or returned a malformed/mismatched envelope; retry the affected section |

Errors use `detail` (existing CRUD validation also uses `field_errors`). HTTP errors never fall back to browser mocks or synthetic results.

Both reads use this envelope, mapped by the frontend to `PlanAnalysis`:

```json
{
  "provenance": "unavailable",
  "context": {
    "plan_id": "8a9d4260-9070-4bb1-b5af-a71f458a3f47",
    "quantity_mt": 100,
    "purchase_deadline": "2025-11-15",
    "scenario_as_of_date": "2025-10-24"
  },
  "reference": { "status": "unavailable", "reason": "missing_reference", "message": "No normalized reference price is available." },
  "forecast": { "status": "unavailable", "reason": "missing_forecast", "message": "No forecast provider is connected for this scenario." },
  "cost_impact": { "status": "unavailable", "reason": "missing_forecast", "message": "No forecast provider is connected for this scenario." },
  "recommendation": { "status": "unavailable", "reason": "recommendation_unavailable", "message": "Recommendations are loaded separately." }
}
```

Unused result fields may serialize as null. A ready result is `{ "status": "ready", "value": ... }`. The recommendation endpoint calls only the guidance provider method; its reference/forecast/cost sections say they are loaded separately. The cost endpoint calls only the independent prices provider method; its recommendation says it is loaded separately. This preserves independent latency, availability, errors and retries.

`provenance` is required: `unavailable`, `fixture`, or `model`. The frontend assigns `source: 'api'` to HTTP responses and preserves provenance; `api` alone does not imply real ML. Fixture labels appear visibly in both sections, outside the collapsed price disclosure.

### Ready values

| Section | Value fields |
| --- | --- |
| Reference | `price`, `observation_date`, `basis: { commodity, currency, unit }` |
| Forecast | `prices: { lower, upper }`, explicit `target_date`, `basis`, nonempty `range_description`; optional/null `central_estimate`, `horizon_description` |
| Cost impact | `currency: "USD"`, explicit `target_date`, `reference_total`, `forecast_total`, `difference_total`, `savings_total`; optional/null `central_total` |
| Recommendation | One `recommendation_id`, `action`, `explanation`, all nonempty source-supplied strings |

All ranges use `{ lower, upper }`. Prices must be nonnegative and finite for browser consumption; bounds ordered; central estimates inside bounds. Unknown/missing basis is rejected. Cost calculation requires exact matching normalized commodity identity, currency USD and denominator MT. Commodity identity must encode the relevant grade/location/market; the provider must not normalize different commodities into a generic matching name. No currency/unit conversion is inferred.

The reference observation must not follow the historical scenario. The forecast target must not precede it. Provider availability establishes the supported horizon; the feature does not select an optimal date, infer a target from the plan deadline, or force cost availability to depend on guidance. A target beyond a plan deadline remains explicitly labelled a forecast cost estimate, not a recommended purchase date. Production reference selection/age and historical publication availability rules still need Wunna/ML agreement.

Backend calculations use BigDecimal with no early rounding:

- Reference total = reference price times saved quantity.
- Forecast totals = each forecast bound times saved quantity.
- Difference bounds = each forecast total minus reference total.
- Potential savings bounds = reference total minus **upper**, then minus **lower**, forecast total.
- Optional central total = supplied central estimate times saved quantity.

Totals are USD, prices USD/MT. Negative difference means lower forecast cost. Potential savings are estimates, never realized savings. The frontend validates and formats supplied totals; it does not compute purchase costs.

Unavailable reasons: `missing_forecast`, `missing_reference`, `unsupported_horizon`, `incompatible_basis`, `invalid_bounds`, `recommendation_unavailable`. Malformed price details become unavailable sections; provider exceptions, invalid envelopes and wrong-context responses are 503 failures. Recommendations can be unavailable while cost impact is ready.

## Wunna's provider boundary

Implement one Spring bean of `PlanAnalysisProvider`; the default unavailable bean backs off when one is registered. Do not enable the fixture profile alongside a real provider.

- `prices(LocalDate scenarioDate)` returns `Prices(scenario_as_of_date, reference, forecast)`. It deliberately takes no plan ID or quantity: forecast existence/storage remains independent of plans. It must return normalized historical inputs with an explicit target, range meaning and exact basis.
- `recommendation(Context context)` returns `Recommendation(context, result)`. Context is the already-owned saved input tuple. The provider must echo the context it actually analyzed; source guidance is optional. If ML supplies predictions only, return `recommendation_unavailable` until an approved policy exists.
- `provenance()` identifies unavailable, fixture or model output. An unavailable provider cannot emit ready data. Throw for provider/network errors; do not disguise failures as synthetic success.

No adapter exists for a trained model. Real forecast horizon, reference source/age/publication availability, uncertainty meaning, commodity identity and guidance policy require Wunna/ML confirmation. No lowest-price-date rule is implemented. No source API, model-training or other branch work was replaced. Local/backend and remote-tracking refs were inspected; no overlapping analysis/provider implementation was found in this checkout. Unfetched/private teammate work remains unknown.

## Explicit development fixture

Both the `analysis-fixture` Spring profile and `mgo.analysis.fixture-enabled=true` are required. Neither is enabled by default. With existing local backend credentials/environment configured, PowerShell example:

```powershell
$env:SPRING_PROFILES_ACTIVE = 'analysis-fixture'
$env:MGO_ANALYSIS_FIXTURE_ENABLED = 'true'
.\mvnw.cmd spring-boot:run
```

Clear both variables after the development session. Clerk authentication and normal owned-plan CRUD are still required; this profile bypasses neither. Do not enable it for a real-model deployment.

For scenario 24 October 2025, the fixture supplies synthetic Singapore MGO reference USD 700/MT, forecast USD 680-740/MT, central USD 710/MT, target 30 October 2025. At 100 MT the backend returns reference USD 70,000, forecast USD 68,000-74,000, difference USD -2,000 to +4,000, savings USD -4,000 to +2,000 and central USD 71,000. Other scenarios return unavailable prices. Guidance remains unavailable even in fixture mode; the fixture is not an approved recommendation policy.

## Frontend lifecycle and persistence

`ClerkApp` injects `createApiRecommendationService`, retrieving a Clerk token for each request. No shared API key or privileged database credential is sent to analysis routes. Session changes remount private app state; independent analysis scopes discard late replies after context, account or route changes, including A to B to A. Successful edits are observed through a fresh saved-plan read on returning to the recommendation page. A 404/409 offers saved-plan/configuration reload; ordinary provider failures retry only that section.

The supplied schema and existing repository enforce one owned plan and positive quantity. No schema change is required by this implementation: there are no persisted calculated totals, new recommendation tables, foreign keys or snapshots. Existing forecasts are untouched. Actual shared Supabase schema/history and real two-account Clerk persistence still require deployment verification; local tests stub repositories and token decoding.
