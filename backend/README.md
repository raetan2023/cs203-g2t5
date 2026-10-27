# Backend (Spring Boot)

The team's shared Spring Boot application. It exposes the historical market data
the dashboard needs, and is the project other backend features are built in.

Purchase plans, Clerk user mappings, and shared market-data routes use Supabase PostgreSQL.
The historical data API and backend homepage read imported observations from
`public.market_series` and `public.market_observations`; no bundled JSON files are required.
Forecasts and cost impact read immutable daily publications from Supabase. Missing, stale or failed publications are explicitly unavailable; database failures return 503. No mock forecast is substituted.

## Run

Requires Java 21+. The Maven wrapper downloads Maven on first use.

The app needs the Supabase connection details before it will start. Get them from
the Supabase project: **Connect → ORM / Direct connection** (use the **Session pooler**
string instead if your network blocks the direct port). Set them in your shell:

```bash
export SUPABASE_DB_URL='jdbc:postgresql://HOST:PORT/postgres'
export SUPABASE_DB_USER='postgres.xxxxxxxx'
export SUPABASE_DB_PASSWORD='your-database-password'
```

Supabase gives the URL as `postgresql://user:password@host:port/postgres`. For Java,
put `jdbc:` in front and leave the user and password out of the URL itself:
`jdbc:postgresql://HOST:PORT/postgres`.

Never commit these values. Keep them in your shell profile or a local file git ignores.

```bash
cd backend
./mvnw spring-boot:run
```

On startup the log reports which database it reached and the tables it found. If it
says `Could not reach the database`, stored-data routes and the homepage return
`503` until the connection is restored. `/health` remains a service-liveness check;
it does not prove the database is reachable.

If the app fails to start with `'url' must start with "jdbc"`, the `SUPABASE_*`
variables are not set in that shell.

Open http://127.0.0.1:8000. Swagger UI is at `/docs`.

```bash
curl -H 'X-API-Key: mgo_public_demo_2026' 'http://127.0.0.1:8000/api/v1/data/brent?limit=10'
```

## API

`/`, `/health` and `/docs` are public.

Market-data routes, including the dashboard, carry an `X-API-Key` header; the
development key is `mgo_public_demo_2026`. Purchase-plan routes are per-user and
take the signed-in user's session token instead:

```
Authorization: Bearer <session token>
```

Tokens are verified against the identity provider's published signing keys, set
by `CLERK_ISSUER_URI`. The backend has no login, logout or password endpoints:
the provider owns credentials, and this service only checks the token it is
given. A missing, malformed or expired token returns 401.

| Endpoint | Returns |
| --- | --- |
| `GET /health` | Service status, for uptime checks |
| `GET /api/v1/config` | Settings the frontend needs before it has data, currently the scenario date |
| `GET /api/v1/sources` | Known sources with provider/unit labels and current Supabase observation counts/date ranges |
| `GET /api/v1/data/{sourceId}` | Imported observations for one source, in chronological order |
| `GET /api/v1/market/stored` | Latest imported observations and bounded histories for the current React dashboard |
| `GET /api/v1/market/dashboard` | Everything the historical dashboard shows for one scenario date |
| `GET/POST /api/v1/purchase-plans` | List the caller's plans / create another plan |
| `GET/PUT/DELETE /api/v1/purchase-plans/{planId}` | Read, edit or delete one owned plan |

`/api/v1/data/{sourceId}` accepts `start`, `end` (ISO dates), `series` (for
sources holding several sub-series, such as bunker sales), `limit` (1–25000,
default 5000, keeps the most recent rows), and `format` (`json` or `csv`).
Date boundaries are inclusive; a reversed date range returns `422`. On equal dates,
rows sort by series name, so limiting multi-series bunker data is deterministic.

The current React dashboard uses `/api/v1/market/stored` and reads Supabase directly
through the backend. The older scenario dashboard endpoint described below remains
separate.

Errors are returned as `{"detail": "..."}`, with `field_errors` added when a
submitted field is rejected.

Browsers may call `/api/` from the origins listed in `FRONTEND_ORIGINS`, which
defaults to the Vite dev server on both `127.0.0.1:5173` and `localhost:5173`
(browsers treat those as different origins). Requests from anywhere else are
refused. Add deployed origins to that variable rather than the code.

`GET /api/v1/config` returns the current Singapore date (the legacy key remains for compatibility), to show days remaining before a plan is saved:

```json
{ "scenario_as_of_date": "2026-10-26" }
```

### Market dashboard

`GET /api/v1/market/dashboard?scenarioDate=2025-10-24` returns the scenario date,
ticker cards, chart points and indicator rows in one payload. The date defaults to
the configured scenario date. When no data can be assembled it answers `204 No
Content` rather than an empty payload.

It takes its data from the first source that can supply it:

1. the database tables `MARKET_SERIES` / `MARKET_OBSERVATIONS` / `MARKET_INDICATORS`,
   when those repositories are available and hold records for the date;
2. otherwise `https://mgo-data-api.vercel.app`, an external deployment outside this
   repository.

Be aware of what that means when checking your work: the dashboard can show data
while the database path is broken, and the frontend falls back to that same external
service when this backend is unreachable. Seeing numbers on the page is therefore not
by itself evidence that this backend, or the database, is working. The browser console
logs a message when the frontend falls back.

### Purchase plans

Apply the database migration in `migrations/20261021_multiple_purchase_plans.sql`
if the unique constraint on `purchase_plans.user_id` has not already been removed.
Existing rows are preserved. The backend does not run this migration automatically.

Every route requires `Authorization: Bearer <session token>`. The owner comes
from the verified token, never a client-supplied user ID.

| Method and route | Response |
| --- | --- |
| `GET /api/v1/purchase-plans` | `200 {"plans": [...]}`; empty accounts receive `{"plans": []}` |
| `POST /api/v1/purchase-plans` | `201 {"plan": {...}}`; each call creates a new plan |
| `GET /api/v1/purchase-plans/{planId}` | `200 {"plan": {...}}` |
| `PUT /api/v1/purchase-plans/{planId}` | `200 {"plan": {...}}`; changes only this owned plan |
| `DELETE /api/v1/purchase-plans/{planId}` | `204`, no body |

POST and PUT accept `{"quantity_mt": 500, "purchase_deadline": "2025-11-15"}`.
Plan responses contain `plan_id`, `quantity_mt`, `purchase_deadline`,
`scenario_as_of_date` and derived `days_remaining`. Lists are ordered by deadline,
then plan ID. Scenario-date behavior is unchanged.

Missing plans and other users' plans both return `404`. Missing or invalid tokens
return `401`. Invalid quantities and deadlines return `422` with `field_errors`.
There is no conflict merely because a user already has a plan.

This replaces the singular `/api/v1/purchase-plan` endpoints. Frontend callers
use the plural collection, read `plans` as an array, and supply the
selected `plan_id` when reading, editing or deleting an individual plan. The old
ID-less PUT/DELETE routes are intentionally unavailable to prevent changes to
all of a user's plans. The frontend lists all plans and carries the selected plan ID into recommendations.

## Available data

The daily importer populates the UUID Supabase tables. See
[market synchronization](../data-ingestion/MARKET_SYNC.md) for setup and schedules.
All seven source IDs are supported:

| Source ID | Stored series key(s) |
| --- | --- |
| `mgo_singapore` | `SGP_MGO_OBSERVED` |
| `gasoil_singapore` | `SGP_GASOIL_FUT` |
| `dubai_crude` | `DUBAI_CRUDE` |
| `brent` | `BRENT_CRUDE` (overridable with `BRENT_SERIES_KEY`) |
| `usd_index` | `USD_INDEX` |
| `bunker_sales` | `MPA_BUNKER_SALES_*` |
| `gdelt` | `GDELT_ARTICLE_COUNT`, paired with `GDELT_AVERAGE_TONE` |

Counts and date ranges are queried on each request, rather than copied into this
README. Only `value_type = 'OBSERVED'` is included. A source with no imported rows
reports `available: false`, `records: 0`, and null dates; its data endpoint returns
`count: 0` and `data: []`. Database errors return `503` with a generic message,
without silently substituting local files or external API values.

Data responses keep `source_id`, `count`, and `data`, with row fields `date`,
`value`, `series`, `source`, and `unit`. Public series names are preserved, e.g.
`brent` and `bunker_sales_marine_diesel_oil`. GDELT returns article counts with the
same-date stored tone in `metadata.average_tone`, or null if absent. Tone is not
counted as an extra article observation. CSV exports contain the five core fields.
Other original snapshot metadata and `retrieved_at` were not stored by the importer
and are not reconstructed. Source/provider/unit fields on individual rows come
from the database; `/sources` retains the registry's descriptive labels. No unit
conversion or inferred publication timestamp is applied.

The backend no longer loads `data/snapshots`, and `MGO_SNAPSHOT_DIR` is removed.
Model training datasets and the upstream API's snapshot mode are separate and
remain unchanged. The importer still fetches that external API; it must not be
pointed at this backend, which reads the import destination.

## Test

```bash
./mvnw test
```

The suite uses mocked identity/database boundaries for HTTP checks and an isolated
in-memory database in PostgreSQL mode for historical-query tests. No shared
Supabase credentials or writes are needed.

## Configuration

| Environment variable | Default |
| --- | --- |
| `PORT` | `8000` |
| `MGO_API_KEY` | `mgo_public_demo_2026` |
| `FRONTEND_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` — browser origins allowed to call the API |
| `CLERK_ISSUER_URI` | the team's development tenant — the identity provider whose tokens are accepted |
| `MGO_SCENARIO_DATE` | Retired for operational plans/config. Runtime `OperationalDate` uses Asia/Singapore; setting this variable no longer freezes plan dates. |
| `SUPABASE_DB_URL` | none — required |
| `SUPABASE_DB_USER` | none — required |
| `SUPABASE_DB_PASSWORD` | none — required |
| `SUPABASE_DB_POOL_SIZE` | `5` (the free tier allows 60 connections in total) |


### Sprint 4 analysis integration

Authenticated GET `/api/v1/purchase-plans/recommendation` and `/api/v1/purchase-plans/cost-impact` now expose independent guidance and cost availability. Both select an owned plan using the `plan_id` query parameter and require saved-context query preconditions; see [the complete API/provider contract](../docs/sprint-4-purchase-plan-api-contract.md). Ownership uses the existing verified Clerk subject mapping. Saved-plan GET derives days from the current Singapore date, including previously saved/overdue plans, without updating stored rows.

`PlanAnalysisProvider` uses `PublishedForecastAnalysisProvider` in normal mode. It reads the same run/horizon as the forecast widget; no recommendation policy is implemented, so guidance remains unavailable. To test synthetic cost calculations locally, both profile `analysis-fixture` and property `mgo.analysis.fixture-enabled=true` are required. All fixture responses are labelled and authentication remains enabled. Do not enable this profile for real-model output. Forecasts exist independently of plans; calculations are on demand, with no persisted totals or recommendation FK/table changes.

Run `./mvnw clean test` (`.\mvnw.cmd clean test` on Windows). `PlanAnalysisHttpTests` starts a real local HTTP server on a random port, while stubbing identity decoding and database repositories. It verifies fixture costs, authentication requirements, two-owner isolation, conflicts and active-scenario reads. Unit tests cover signed/fractional calculations, missing inputs, incompatible basis, invalid ranges, provider failure/context checks and fixture opt-in isolation. No shared database credentials or writes are needed by these tests; real Clerk/DB/ML deployment checks remain pending.


### Daily forecast publications

Authenticated `GET /api/v1/forecast?horizon_days=7` accepts 7, 14 or 30 and needs
only `Authorization: Bearer <Clerk token>`, not `X-API-Key`. Ready responses contain
the published prices, independent point estimate, nominal/measured interval
coverage and paired baseline results, exact target/origin/news dates, source dates,
history, drivers, run ID, model version and publication time. Responses have
`Cache-Control: no-store`. Unknown horizons return 422.

A ready run must originate today in Singapore, use yesterday's completed UTC news
window and source observations no more than seven days old, with at least 40
chronologically evaluated news-eligible interval rows. Nominal coverage is a target,
not a guarantee. Points may lie outside independent quantile intervals. Missing,
stale and failed inputs return `{status:"unavailable",reason,message,last_successful_run?}`
without prices. A previous good run is identified only as historical metadata.
Missing tables/database failures return 503 rather than synthetic data.

The cost-impact query accepts `horizon_days` (default 7) and optional `run_id`.
Supplying the forecast widget's run ID prevents publication changes from mixing
price/cost snapshots: a changed/unavailable run returns 409. The backend multiplies
both bounds and the independent point by the owned plan quantity. Forecasts do
not constitute a purchasing recommendation and are not silently aligned to the
plan deadline.

Apply the reviewed [publication migration](../docs/migrations/20261026_published_forecasts.sql)
through the agreed database process before enabling the publisher. This service
only reads the four publication tables; its server-only JDBC role needs SELECT
and RLS bypass. The trusted Python publisher writes through the atomic publication
function. Browser clients get no direct Supabase access. The private
`forecast-models` storage bucket holds versioned archives/artifacts.

`ForecastServiceTests` cover typed contract serialization, source/news freshness,
invalid bounds/evidence, failed-run behavior, shared-run cost consistency and
unsupported horizons. MockMvc tests verify Clerk authentication and no-store.
`TimeConfigurationTests` verify current Singapore time and isolated historical
fixture mode. The SQL smoke test verifies atomic rollback and publication order
on disposable PostgreSQL/PGlite. These checks do not claim shared deployment.
## Operational date update (prototype, 2026-10-26)

`GET /api/v1/config` retains `scenario_as_of_date` for compatibility but returns the runtime
Singapore calendar date. Purchase-plan reads, validation and analysis context use the same
`OperationalDate` service, read per request. Old plans remain readable with negative days remaining;
create/edit reject past deadlines. Analysis crossing midnight is rejected as a stale context.
Tests inject a fixed date/clock; production no longer reads `MGO_SCENARIO_DATE`.

The active `/api/v1/market/stored` endpoint still returns actual observation dates from the latest
imported data. `fetchedAt` is retrieval time, not the observation date. Monthly data does not become
current daily data when plans move to today. Legacy scenario dashboard endpoints remain historical.
