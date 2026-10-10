# Sprint 4 purchase-plan analysis contract draft

Date: 10 October 2026. Status: provisional frontend handoff; no Wunna/ML sample or backend agreement received. No endpoint, SQL migration, calculation engine or screen is implemented by this document.

## Decisions and sources

| Decision | Status / source |
| --- | --- |
| One saved plan per user; existing CRUD stays intact | Existing implementation and Rae's Sprint 4 scope |
| Numeric `days_remaining`, calculated by backend; no urgency column/category | Rae's Task 2 decision, 10 October |
| Use the active historical scenario date from backend, not device time | Rae's Task 2 decision, 10 October; backend behavior must be aligned |
| Saving a plan does not require forecasts; analysis loads separately | Rae accepted this direction in Task 2 discussion; transport pending Wunna |
| Display zero or one current recommendation; edits invalidate old results | Rae's Task 2 decision; does not settle database cardinality or retention |
| USD totals; comparable USD/MT input prices; difference = forecast minus reference | Personal implementation plan and PRD section 7 |
| New field names, availability reasons, combined analysis response shape below | Frontend proposal only; map actual transport to these types later |

## Existing API: preserve

Inspected `PurchasePlanController.java`, `PurchasePlanRequest.java`, `PurchasePlan.java`, and frontend `apiService.ts`. These are source-code observations, not deployed API verification. The owner is resolved from the authenticated Clerk token; clients do not supply `user_id`.

| Method / path | Request | Success |
| --- | --- | --- |
| GET `/api/v1/purchase-plan` | Bearer token; no body | 200 `{ "plan": null }` or `{ "plan": { ... } }` |
| POST `/api/v1/purchase-plan` | Bearer token; input below | 201 `{ "plan": { ... } }`; existing plan gives 409 |
| PUT `/api/v1/purchase-plan` | Bearer token; input below | 200 `{ "plan": { ... } }`; absent plan gives 404 |
| DELETE `/api/v1/purchase-plan` | Bearer token; no body | 204 with no body; absent plan gives 404 |
| GET `/api/v1/config` | Existing adapter sends configured `X-API-Key` | `scenario_as_of_date` supplies the historical context before a plan exists |

Create/update input (unchanged):

```json
{ "quantity_mt": 100, "purchase_deadline": "2025-11-15" }
```

Existing plan response fields (example is synthetic):

```json
{
  "plan": {
    "plan_id": "8a9d4260-9070-4bb1-b5af-a71f458a3f47",
    "quantity_mt": 100,
    "purchase_deadline": "2025-11-15",
    "scenario_as_of_date": "2025-10-24",
    "days_remaining": 22
  }
}
```

Existing errors use `detail` with optional `field_errors` keyed by `quantity_mt` and `purchase_deadline`. Validation errors use 422; authentication failures can give 401. Network failures remain request errors, not unavailable forecasts. Example:

```json
{
  "detail": "Please check your inputs.",
  "field_errors": { "quantity_mt": "Quantity must be greater than zero." }
}
```

Quantity must be finite and positive; fractional MT is allowed. Dates are valid `YYYY-MM-DD` calendar dates. Same-day deadlines are allowed and past deadlines rejected on writes. Preserve inputs on rejected saves.

**Current scenario gap:** create/update uses backend configuration, but GET derives days from the stored plan date. Rae's desired behavior is to return context/days for the active historical scenario even for previously saved plans. Wunna must specify whether stored scenario dates are updated or treated as creation/edit context. Do not add browser production urgency calculations to mask this gap. Existing overdue saved plans can still be read; changing scenario alone must not delete a plan.

## Proposed separate analysis read

Keep analysis out of CRUD writes. Propose one authenticated read returning reference/forecast/cost/recommendation sections; splitting it into multiple backend reads is also compatible with the frontend model. **URL, method, request keys, response transport and status codes are not agreed; no new URL is wired.**

The logical request context is `PlanResultContext`: plan ID, saved quantity, saved deadline, and active historical scenario date. Backend must verify ownership and use authoritative saved inputs/configuration rather than trust supplied quantity or dates. A response must identify the inputs/scenario it actually analyzed. Whether that is conveyed as query fields, response context, or a revision token is for Wunna to confirm.

### Frontend field inventory

Canonical TypeScript definitions: `frontend/src/features/purchase-plan/types.ts`. All additions below are provisional frontend view models, not guaranteed backend JSON. Existing `PurchasePlan` and `PlanInput` are unchanged.

| Type / fields | Meaning and source |
| --- | --- |
| `PlanResultContext.plan_id`, `quantity_mt`, `purchase_deadline`, `scenario_as_of_date` | Echo of analyzed saved inputs and active date; proposed for stale-result detection. Existing plan fields supply the values. |
| `PriceBasis.commodity`, `currency`, `unit` | Exact target and price denominator; proposal pending ML sample. A basis of USD + MT means USD/MT, not total USD. Commodity identity must include enough market/grade/location detail for comparability in the real contract. |
| `ReferencePrice.price`, `observation_date`, `basis` | Dated reference available at the historical scenario; backend selects source and acceptable age. Selection/source semantics pending team agreement. |
| `PlanForecast.prices.lower/upper`, `target_date`, `basis`, `range_description` | Forecast price bounds and target date, with source-supplied range meaning. Do not label a heuristic range as a calibrated confidence interval. Actual horizon/metadata pending ML sample. |
| `PlanCostImpact.currency`, `reference_total`, `forecast_total.lower/upper`, `difference_total.lower/upper` | Display-ready backend totals. Currency is USD for this scope; no calculations inside display components. Field names provisional, sign/unit convention from PRD/plan. |
| `CurrentRecommendation.recommendation_id`, `action`, `explanation` | Source-supplied current guidance, not generated from price bounds in the browser. Action remains text until an agreed action vocabulary exists. IDs in fixtures are synthetic, not FK targets. |
| `AvailableResult.status`, `value` or `reason/message` | Ready value or explicit unavailable section. No dummy zero totals. Proposed reason vocabulary: missing forecast/reference, unsupported horizon, incompatible basis, invalid bounds, recommendation unavailable. |
| `PlanAnalysis.source`, `context`, `reference`, `forecast`, `cost_impact`, `recommendation` | Proposed aggregate. `source` is adapter-assigned provenance (`mock`/`api`), not a required server field. API provenance alone does not prove real-model output; retain any backend fixture/model labels during integration. |
| `PlanAnalysisState.status`, `context`, `analysis`, `message`, `previous` | Local no-plan/loading/error/loaded/stale states. These are not HTTP payloads. `previous` is explicitly obsolete data, never current output. |

Independent availability lets predictions exist without a recommendation, or a forecast exist without comparable reference data. Backend/adapters must reject non-finite numbers, reversed bounds, unknown basis and incompatible currencies/units/commodities before exposing ready cost impact. Types alone do not validate network data. Define the real target identifiers, reference source/date policy and supported horizons with Wunna/ML before integration.

### Context and invalidation proposal

- Use the backend-configured active historical date consistently across header, form validation, urgency and analysis. No device-clock substitution or new date-selection UI in Task 2.
- Read analysis for saved inputs, not unsaved form values. On successful create/update/delete, invalidate dependent analysis; failed edits retain the last saved context and draft input separately.
- On active-date changes, clear or mark old results stale, refresh backend-derived plan days, and request analysis for the new context. When the scenario/config is refreshed is an integration detail still to agree; no polling is introduced here.
- Match responses against plan ID + saved quantity + deadline + active date. Also use a local request generation and current user/session when later implementing reads, so a superseded request cannot win even after an A → B → A change. Reset on logout/account switch. A backend revision token may replace the input tuple if agreed; no revision column is required by this draft.
- Error/retry must never silently substitute mock data. Unsupported/missing results are explicit successful availability states, distinct from failed HTTP requests.

## Deterministic synthetic examples

`frontend/src/features/purchase-plan/fixtures.ts` retains existing CRUD fixtures and adds `ANALYSIS_DEMO_PLAN`, `DEMO_ANALYSIS`, `PLAN_ANALYSIS_FIXTURES`, and `CHANGED_SCENARIO_DEMO_PLAN`. No random IDs, clock reads, fetches or calculation engine are added. Consumers should clone before mutation. Display `ANALYSIS_MOCK_LABEL` whenever these examples are mounted in future previews; they are not mounted in the production app.

| Fixture | Expected meaning |
| --- | --- |
| `noPlan` | No saved plan; future page links to plan entry |
| `loading` | Saved context exists; analysis pending |
| `failedRequest` | Request failure with retry; no mock fallback |
| `ready` | Synthetic 100 MT × 700 USD/MT = USD 70,000 reference; 680–740 USD/MT = USD 68,000–74,000 forecast; differences USD −2,000 to +4,000 |
| `planWithoutForecast` | Plan/reference exist; forecast and cost impact unavailable |
| `predictionsOnly` | Forecast/cost available; recommendation unavailable |
| `unsupportedHorizon` | Deadline outside supported horizon; no forecast/cost/guidance |
| `incompatibleBasis` | Gasoil USD/bbl forecast and MGO USD/MT reference; cost unavailable, no conversion invented |
| `changedScenario` | Active date 1 November 2025, previous results dated 24 October explicitly stale; expected refreshed plan has 14 days to 15 November, versus 22 previously |

The ready recommendation wording is independently invented layout content, not a rule inferred from its numeric fixture. No advice is calculated in the frontend. Further signed-range and malformed-data cases belong with the Task 5 component/Task 7 adapter tests.

## Persistence boundary

Retain existing required user ownership, unique owner, positive quantity, deadline and scenario columns. Derived urgency and calculated totals require no new plan columns under these decisions. Zero or one recommendation displayed does not determine whether storage retains many historical recommendations. Do not introduce a recommendation FK until its real table/key, owner, optionality, cardinality and delete behavior are known. Enforce matching ownership if linking private recommendations; existence alone is insufficient. No SQL changes in Task 2.

## Coordination draft for Rae to send

Not sent by the agent. Wunna can coordinate the ML/storage parts with their owners:

> We are keeping one saved plan per user and existing CRUD. Plans can be saved without forecasts; we propose a separate authenticated analysis read for forecast/cost impact and zero or one current recommendation. Urgency is calculated numeric days, with no stored urgency/category. Saved plans should follow the backend's active historical scenario date, not the device clock; edits/date changes invalidate old analysis.
>
> Can you confirm who owns the recommendations endpoint and ML integration, and share proposed request/success/unavailable/error JSON? Please specify how active scenario changes refresh saved-plan days and how analysis responses identify their saved inputs/scenario (or revision).
>
> For persistence, what is the recommendation table/key/type, who owns it, and what relationship/ownership/delete behavior is intended? Can a plan have no recommendation, and are there overlapping DB changes?
>
> With the ML team, please confirm whether outputs are predictions only or recommendations too, and provide one representative output: scenario date, target date/horizon, target commodity/market, currency/unit, lower/upper prices and range meaning. Also confirm the reference price source/date policy. We propose calendar days, same-day deadlines allowed, past deadlines rejected on save, forecast-minus-reference cost differences, and USD display to two decimals without early rounding.

Until those answers arrive, the models/fixtures support UI development only; shared transport, database relationships and real-model comparability remain open.


## Latest mockup display additions (provisional)

Rae requested the updated recommendation screen, including independently available cost impact. The frontend mock now supplies separate `read` and optional `readImpact` operations; these do not prescribe endpoint paths or require separate backend endpoints. Each result identifies its saved inputs and scenario, and each section retries independently.

Optional view-model additions: `PlanForecast.central_estimate`; `PlanCostImpact.target_date`, `central_total`, and `savings_total` (source-supplied reference-minus-forecast range). The impact display requires an explicit target date matching the supplied forecast. Existing `difference_total` keeps its forecast-minus-reference convention. Positive potential savings are not realized savings. These are provisional display fields pending the shared API contract; the browser does not calculate totals or recommendation rules.
