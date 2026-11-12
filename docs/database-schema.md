# MGO database schema

Updated: 2026-11-09. Checked against the shared database. The full definition is in [mgo_current_sprint_schema.sql](mgo_current_sprint_schema.sql).

See the [HTML diagrams and schema notes](mgo_forecasting_database_schema.html) and [product requirements](PRD.md).

## Current tables

| Table | Fields | Rules |
| --- | --- | --- |
| `USERS` | `user_id` UUID PK; `clerk_user_id` text unique, required; `email` string unique, nullable; `display_name` text nullable | Clerk account mapping uses the text ID (e.g. `user_abc123`); purchase plans retain the internal UUID owner. Email can be empty because Clerk accounts may not have one. `display_name` is the name from Clerk; the app shows it where available and falls back to the email. No local password storage. |
| `PURCHASE_PLANS` | `plan_id` UUID PK; `user_id` UUID FK; `quantity_mt` numeric; `purchase_deadline` date; `scenario_as_of_date` date; `clerk_org_id` text nullable; `status` text; `submitted_at` timestamp nullable; `previous_plan_id` UUID nullable | A user can have many plans. Quantity > 0. Status is `draft`, `submitted`, `approved`, `rejected`, `withdrawn`, `purchased` or `closed` (approved but never bought: not bought by the purchase deadline, or the officer stopped being an officer). `closed_reason` (`deadline_passed` or `role_change`) and `closed_at` say why and when. `submitted_at` is empty only for drafts. `previous_plan_id` links a revision to the plan it replaces, for the same owner and organisation. Urgency is derived, not stored. |
| `MARKET_SERIES` | `series_id` UUID PK; `series_key` string unique; `source_name`, `source_url`, `currency_code`, `unit`, `price_definition`, `contract_description` strings | Series key and source name required. Monetary series use USD. Currency is null for non-monetary indicators. Unverified unit/price/contract metadata remains null and is displayed as TBC, rather than guessed. Contract description need not apply to non-futures series. |
| `MARKET_OBSERVATIONS` | `observation_id` UUID PK; `series_id` UUID FK; `observation_date` date; `value` numeric; `value_type` string; `availability_timestamp` timestamp | Series, date, value, and value type required. Composite unique key `(series_id, observation_date)`. Value type distinguishes observed, estimated, and imputed values. Availability may be null when unknown; observation date does not establish publication time. |

The observation key assumes one value per series per date. Different price measures or contracts need distinct series keys. If source revisions or intraday data are later required, revisit this key. Use decimal numeric types for prices, quantities, and costs; precision/scale remains an implementation decision. Timestamp fields should be timezone-aware when implemented.

### Organisation members and PM assignments

| Table | Fields | Rules |
| --- | --- | --- |
| `ORGANISATION_MEMBERS` | `user_id` UUID FK; `clerk_org_id` text; `role` text; `updated_at` timestamp | Primary key `(user_id, clerk_org_id)`. Role is `org:officer`, `org:manager` or `org:admin`. A copy of Clerk's membership; authorisation still uses the verified token. |
| `PM_ASSIGNMENTS` | `po_user_id` UUID; `clerk_org_id` text; `pm_user_id` UUID; `assigned_by_user_id` UUID FK nullable; `assigned_at` timestamp | Primary key `(po_user_id, clerk_org_id)`, so a PO has one PM per organisation. PO and PM must be different people and members of that organisation; leaving removes the assignment. |

See [PM and PO assignment](pm-po-assignment.md). The 8 November 2026 migrations for these tables are in `backend/migrations`.

### Approval and purchase records

| Table | Fields | Rules |
| --- | --- | --- |
| `PLAN_RECOMMENDATION_DECISIONS` | `decision_id` UUID PK; `plan_id` UUID FK; `clerk_org_id`, `buyer_clerk_user_id`, `recommendation_id` text; `buyer_user_id` UUID FK; `run_id` UUID nullable; `action` text nullable; `decision`, `reason` text; `decided_at` timestamp | A buyer's response to a recommendation: `accept`, `reject` or `ignore`. A rejection needs a reason. Blocks deleting the plan while rows exist. |
| `PLAN_APPROVAL_NOTIFICATIONS` | `notification_id` UUID PK; `plan_id` UUID FK unique; `clerk_org_id` text; `buyer_user_id` UUID FK; `created_at` timestamp; `recommendation_snapshot` JSONB nullable | The manager inbox entry and the saved recommendation being reviewed. One per plan; deleted with the plan. |
| `PLAN_APPROVAL_DECISIONS` | `decision_id` UUID PK; `plan_id` UUID FK unique; `clerk_org_id`, `manager_clerk_user_id`, `manager_label`, `decision`, `decision_comment` text; `manager_user_id` UUID FK; `decided_at` timestamp | The final `approved` or `rejected` outcome. One per plan. A rejection needs a comment of up to 2000 characters. |
| `PLAN_DECISION_NOTIFICATIONS` | `notification_id` UUID PK; `plan_id` UUID FK unique; `clerk_org_id`, `decision` text; `buyer_user_id` UUID; `created_at` timestamp; `seen_at` timestamp nullable | Tells the buyer the outcome. |
| `PLAN_WITHDRAWALS` | `plan_id` UUID PK and FK; `clerk_org_id`, `reason` text; `buyer_user_id` UUID; `withdrawn_at` timestamp; `manager_user_id` UUID nullable | Records a buyer withdrawing a submitted request, or the app withdrawing it when the officer stops being an officer. In that case `manager_user_id` is the PM who was reviewing it, so they still see it as withdrawn. |
| `PURCHASE_RECORDS` | `purchase_id` UUID PK; `plan_id` UUID FK unique; `clerk_org_id`, `supplier`, `note` text; `buyer_user_id` UUID; `purchased_on` date; `quantity_mt`, `price_usd_per_mt` numeric; `recorded_at` timestamp | The actual purchase for an approved plan. One per plan. Quantity and price must be positive. The quantity is copied from the plan (the approved plan fixes it); older records may hold a quantity the officer entered. |

### Forecast publication

| Table | Fields | Rules |
| --- | --- | --- |
| `FORECAST_RUNS` | `id` UUID PK; `origin_date` date; `model_version` text; `published_at` timestamp; `payload` JSONB | One published forecast run. |
| `FORECAST_VALUES` | `run_id` UUID FK; `horizon_days` integer; `payload` JSONB | One result per run for each of 7, 14 and 30 days. |
| `FORECAST_ACTIVE` | `singleton` boolean PK; `run_id` UUID FK | A single row pointing at the current run. `publish_forecast_run` updates it. |
| `NEWS_DAILY_FEATURES` | `date` date; `version` text; `payload` JSONB | Daily news inputs used by the forecast, per feature version. |

See [daily forecast operations](daily-forecast-operations.md).

### Gasoil CSV import

- Parse `Date` as `MM/DD/YYYY` and store it as a database date.
- Map `Price` to `MARKET_OBSERVATIONS.value` under the Gasoil series. Preserve the source label `Price`; do not call it closing or settlement price without verification.
- Currency is confirmed USD. Physical unit and contract/continuous-series definition remain TBC. Unknown units block unit-dependent spreads, conversions, and cost calculations.
- Keep the original CSV. Open, High, Low, Volume, and Change % are not imported for this basic dashboard schema. The sample has 585 rows, four with differing OHLC values and two with populated volume; these columns are not uniformly redundant. Missing volume is unknown, not zero.
- Imported source quotes are observed values; forward-filled/interpolated values must not be relabelled observed.
- Load only series used by displayed features. Brent, Dubai, USD index, sales, and news are not mandatory imports merely because they are candidate modelling inputs. No separate table per commodity is needed.

## Earlier design, not built

The tables in this section are an earlier proposal and do not exist in the database. The features were built with the tables listed above instead.

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

Extended model tracking, dataset-cutoff storage, model selection, Gasoil physical units and price/contract definition, and mapping validation remain TBC. Training datasets are not imported into the application database.

## Authentication and access

Clerk handles sign-in, and no passwords are stored here. The backend verifies the Clerk token, finds or creates the `users` row for that Clerk ID, and uses its internal UUID for every plan operation. Organisation and role come from the verified token. There is no separate profile table.

Row Level Security is on for every table, with no browser policies. Only the backend, using a server-only database role, reads and writes these tables, and it enforces ownership itself. Supabase hosts PostgreSQL only.

Deleting a user's Clerk account removes their organisation memberships and PM assignments, and keeps their `users` row so their plans and decisions stay on record. See [PM and PO assignment](pm-po-assignment.md) for who can see and approve which plans.
