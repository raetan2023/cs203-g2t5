# MGO database schema

Updated: 2026-09-26. Local schema and candidate migrations only; shared database has not been verified or changed.

See the [HTML diagrams and schema notes](mgo_forecasting_database_schema.html) and [product requirements](PRD.md).

## Current sprint: dashboard and purchase-plan CRUD

| Table | Fields | Rules |
| --- | --- | --- |
| `USERS` | `user_id` UUID PK; `clerk_user_id` text unique; `email` string unique | Clerk account mapping uses the text ID (e.g. `user_abc123`); purchase plans retain the internal UUID owner. Clerk ID is nullable during migration/backfill. Provisioning and ownership integration remain pending; no local password storage. |
| `PURCHASE_PLANS` | `plan_id` UUID PK; `user_id` UUID FK unique; `quantity_mt` numeric; `purchase_deadline` date; `scenario_as_of_date` date | Required owner and inputs; quantity > 0. At most one plan per user. Users can create, view, edit, and delete their own plan. Urgency is derived from the scenario date and deadline; thresholds/calendar rules remain TBC. |
| `MARKET_SERIES` | `series_id` UUID PK; `series_key` string unique; `source_name`, `source_url`, `currency_code`, `unit`, `price_definition`, `contract_description` strings | Series key and source name required. Monetary series use USD. Currency is null for non-monetary indicators. Unverified unit/price/contract metadata remains null and is displayed as TBC, rather than guessed. Contract description need not apply to non-futures series. |
| `MARKET_OBSERVATIONS` | `observation_id` UUID PK; `series_id` UUID FK; `observation_date` date; `value` numeric; `value_type` string; `availability_timestamp` timestamp | Series, date, value, and value type required. Composite unique key `(series_id, observation_date)`. Value type distinguishes observed, estimated, and imputed values. Availability may be null when unknown; observation date does not establish publication time. |

The observation key assumes one value per series per date. Different price measures or contracts need distinct series keys. If source revisions or intraday data are later required, revisit this key. Use decimal numeric types for prices, quantities, and costs; precision/scale remains an implementation decision. Timestamp fields should be timezone-aware when implemented.

### Gasoil CSV import

- Parse `Date` as `MM/DD/YYYY` and store it as a database date.
- Map `Price` to `MARKET_OBSERVATIONS.value` under the Gasoil series. Preserve the source label `Price`; do not call it closing or settlement price without verification.
- Currency is confirmed USD. Physical unit and contract/continuous-series definition remain TBC. Unknown units block unit-dependent spreads, conversions, and cost calculations.
- Keep the original CSV. Open, High, Low, Volume, and Change % are not imported for this basic dashboard schema. The sample has 585 rows, four with differing OHLC values and two with populated volume; these columns are not uniformly redundant. Missing volume is unknown, not zero.
- Imported source quotes are observed values; forward-filled/interpolated values must not be relabelled observed.
- Load only series used by displayed features. Brent, Dubai, USD index, sales, and news are not mandatory imports merely because they are candidate modelling inputs. No separate table per commodity is needed.

## Later: forecasts and the purchase-decision flow

| Table | Fields | Rules |
| --- | --- | --- |
| `MODEL_VERSIONS` | `model_version_id` UUID PK; `model_name`, `target_commodity` strings; `training_cutoff_date` date | Retains the original minimal placeholder. Extended model tracking is TBC and is not a current-sprint implementation requirement. |
| `FORECASTS` | `forecast_id` UUID PK; `model_version_id` UUID FK; `target_commodity` string; `scenario_as_of_date`, `forecast_target_date` dates; `currency_code`, `unit` strings; `lower_bound`, `upper_bound` numeric; `forecast_method`, `validation_status`, `uncertainty_method` strings; `source_gasoil_forecast_id` UUID self-FK; `gasoil_origin_observation_id`, `mgo_anchor_observation_id` UUID FKs | Origin and target date required; target > origin; lower bound <= upper bound. Monetary forecasts use USD and a verified unit. Method, validation status, and uncertainty method describe the output without implying validated confidence. Lineage FKs are nullable for methods that do not use percentage mapping. |
| `PURCHASE_ANALYSES` | `analysis_id` UUID PK; `plan_id`, `forecast_id`, `reference_price_observation_id` UUID FKs; `quantity_mt` numeric; `purchase_deadline`, `scenario_as_of_date` dates; `reference_price` numeric; `currency_code`, `price_unit` strings; `created_at` timestamp | Required fields. Immutable snapshot of the plan inputs and the actual reference price used. Quantity > 0. Reference and forecast must be comparable MGO prices in USD/MT for the currently specified cost calculation. |
| `PURCHASE_IMPACT_CALCULATIONS` | `impact_id` UUID PK; `analysis_id` UUID FK unique; `reference_cost`, `forecast_cost_low`, `forecast_cost_high`, `diff_low`, `diff_high` numeric | At most one saved impact per analysis. Required values, derived from that analysis snapshot and its immutable forecast; monetary results are in the analysis currency. |
| `RECOMMENDATIONS` | `recommendation_id` UUID PK; `analysis_id` UUID FK; `recommended_action`, `explanation_text` strings; `created_at` timestamp | Required fields. Saved recommendations are immutable; a new recommendation receives a new ID. Forecast and model lineage are reached through the analysis, avoiding duplicated model FKs. Rules/actions remain TBC. |
| `USER_DECISIONS` | `decision_id` UUID PK; `recommendation_id` UUID FK unique; `user_id` UUID FK; `decision` string; `decided_at` timestamp | Required fields. At most one recorded response per recommendation. Accept/reject supported; explicit ignore versus no-response semantics and changing a response remain TBC. The user must own the recommendation's plan. |

### Forecast method and lineage

`forecast_method` replaces `is_proxy_estimate`; `validation_status` separately records whether validation is pending/experimental or supported by evaluation. For example, `gasoil_percentage_transfer` describes a proposed method, not a confirmed or validated relationship. Allowed method/status values and evaluation gates remain TBC.

If percentage transfer is selected, require all three lineage references for the mapped MGO forecast:

1. The Gasoil forecast supplying the predicted movement.
2. The Gasoil observation at the forecast origin, supplying the return denominator.
3. The dated MGO anchor supplying the absolute MGO price level.

For an aligned-origin baseline, `M_h = M_0 * (G_h / G_0)`. Gasoil origin price must be positive. Source forecast and mapped forecast must have aligned origins/targets; the Gasoil observation must use a comparable contract and unit. Old-anchor bridging is not implicitly approved. Mapped Gasoil bounds alone do not establish calibrated MGO uncertainty. The conversion formula, anchor freshness policy, uncertainty treatment, and exact horizon/calendar remain TBC.

### Snapshot and deletion behaviour

- Editing a plan updates the same `PURCHASE_PLANS` row. Existing analyses retain their snapshotted quantity, deadline, scenario date, reference price, currency, and unit. New calculations create new analyses from the edited plan.
- Forecasts and observations referenced by saved analyses must not be overwritten in place. Corrections require an explicit version/replacement policy before implementing historical data updates; that policy remains TBC.
- Deleting a plan cascades to its analyses. Deleting those analyses cascades to their impacts and recommendations; deleting those recommendations cascades to their decisions.
- Shared users, market series/observations, forecasts, and model versions are not deleted by deleting a plan. References from analyses and forecasts to shared data use restrictive deletion behaviour rather than cascades from shared records.
- Enforce ownership in application/API authorization or database policies on every private-record read/write. Foreign keys alone do not establish ownership. Account deletion policy is outside this decision.

For snapshot quantity `Q`, reference price `P0`, and forecast bounds `[L,U]`, save reference cost `Q*P0`, forecast cost bounds `[Q*L,Q*U]`, and difference bounds `[Q*(L-P0),Q*(U-P0)]`. Preserve negative differences. Rounding remains TBC.

## Deferred decisions

Extended model tracking, dataset-cutoff storage, model selection, exact forecast horizon/calendar, Gasoil physical units and price/contract definition, mapping validation, and Clerk provisioning/ownership enforcement remain TBC. This design does not require importing training datasets into the application database or implementing later tables in the current sprint.

## Clerk mapping and UI review (26 September 2026)

This review covers only the smaller MVP schema: USERS, PURCHASE_PLANS, MARKET_SERIES, and MARKET_OBSERVATIONS. The larger forecasting/decision design above is deferred and is not an MVP gap list.

The fresh schema generates internal UUID user IDs and stores a unique text `clerk_user_id`. It has no dependency on an authentication provider's database tables, signup triggers, or identity functions. Existing UUIDs and purchase-plan foreign keys stay unchanged. Clerk IDs remain nullable during verified backfill; new Clerk-backed users must be provisioned with their verified Clerk ID. PostgreSQL uniqueness rejects duplicate non-NULL IDs while allowing unmapped rows.

For existing databases, apply the candidate Clerk ID migration followed by `migrations/20260926_remove_legacy_auth.sql` through reviewed migration history. The cleanup removes the old authentication FK, trigger/function, and eight policies, and adds a UUID default. Shared Supabase has not been changed. Supabase may still host PostgreSQL; Clerk handles authentication.

RLS remains enabled with no client-facing policies: ordinary client roles have no row access. The intended access path is the trusted Spring backend using a server-only database role with appropriate table privileges and RLS bypass. It must verify Clerk authentication and enforce ownership itself; removing the old policies does not implement that API work.

### Remaining MVP integration work

- **API identity:** `PurchasePlanController` currently accepts `X-User-Id`, a UUID supplied by the caller, and checks only whether that user exists. That identifies a row but does not prove who is calling. Verify the Clerk login token, take its authenticated Clerk ID, look up `users.clerk_user_id`, and use the resulting internal UUID for every plan operation. The shared API key does not establish a user's identity. API code has not been changed in this schema task.
- **Provisioning:** create/link the application user from verified Clerk identity and synchronize the required unique email. Do not link accounts based solely on client-submitted email or IDs.
- **Names:** there is no separate profile table. The signup/home name display can use Clerk user data; no additional database table or name field is required by this schema change. Password handling belongs to Clerk.

### Updated purchase-plan mockups

Rechecked `purchase-plans-empty.png`, `purchase-plans-editing.png`, and `purchase-plans-saved.png` in `docs/ui-mockups`. Their one-plan limit, quantity in MT, single purchase deadline, and read-only historical scenario date match the MVP schema. Time remaining is calculated from the two dates, so it needs no stored column. Deadline windows and preferred location are not MVP requirements. Forecasts, recommendations, and decision history are outside this review. The saved-state phrase “matching live predictions” is a copy issue for a historical MVP, not a missing database feature.

Verification scope: local SQL/document review and mockup inspection only. No live database export or Clerk configuration was inspected, and the candidate migrations have not been executed against PostgreSQL in this session.
