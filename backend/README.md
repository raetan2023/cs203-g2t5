# Backend (Spring Boot)

The team's shared Spring Boot application. It exposes the historical market data
the dashboard needs, and is the project other backend features are built in.

Purchase plans, Clerk user mappings, and shared market-data routes use Supabase PostgreSQL.
The historical data API and backend homepage read imported observations from
`public.market_series` and `public.market_observations`; no bundled JSON files are required.
Analysis uses a separate provider boundary and reports unavailable by default until
normalized ML inputs are connected.

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
| `GET/POST/PUT/DELETE /api/v1/purchase-plan` | The caller's single saved purchase plan |

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

`GET /api/v1/config` exists because screens need the scenario date before a plan
is saved, to show days remaining while a deadline is being chosen:

```json
{ "scenario_as_of_date": "2025-10-24" }
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

### Purchase plan

One plan per user, stored in `purchase_plans`. The backend supplies
`scenario_as_of_date` from `MGO_SCENARIO_DATE` and derives `days_remaining` as
calendar days from that date to the deadline.

The owner comes from the verified token, never from anything the caller sends,
so a signed-in user can only reach their own plan. The token's subject is matched
against `users.clerk_user_id`, and the row is created on that account's first
request, so signing up needs no extra step. `email` is stored only when the
provider includes it in the token.

Every call below needs the one header:

```
Authorization: Bearer <session token>
```

**Read — `GET /api/v1/purchase-plan`** → `200`

```json
{
  "plan": {
    "plan_id": "8a9d4260-9070-4bb1-b5af-a71f458a3f47",
    "quantity_mt": 500,
    "purchase_deadline": "2025-11-15",
    "scenario_as_of_date": "2025-10-24",
    "days_remaining": 22
  }
}
```

With no saved plan, still `200`:

```json
{ "plan": null }
```

**Create — `POST /api/v1/purchase-plan`** → `201`, body as above

```json
{ "quantity_mt": 500, "purchase_deadline": "2025-11-15" }
```

**Edit — `PUT /api/v1/purchase-plan`** → `200`, with `days_remaining` recalculated

```json
{ "quantity_mt": 600, "purchase_deadline": "2025-11-20" }
```

**Delete — `DELETE /api/v1/purchase-plan`** → `204`, no body

#### Errors

| Case | Status | Body |
| --- | --- | --- |
| Quantity of zero or less, or a missing or invalid field | `422` | `{"detail": "Please check your inputs.", "field_errors": {"quantity_mt": "Quantity must be greater than zero."}}` |
| Deadline earlier than the scenario date | `422` | `{"detail": "Please check your inputs.", "field_errors": {"purchase_deadline": "Purchase deadline cannot be before 2025-10-24."}}` |
| Missing or unknown caller | `401` | `{"detail": "Please sign in again."}` |
| Creating a second plan | `409` | `{"detail": "You already have a saved plan. Edit or delete it first."}` |
| Editing or deleting a plan that does not exist | `404` | `{"detail": "No saved purchase plan was found."}` |

#### Try it

Copy a session token from the running frontend, then:

```bash
curl -s localhost:8000/api/v1/purchase-plan -H "Authorization: Bearer $TOKEN"
```

```bash
curl -s -X POST localhost:8000/api/v1/purchase-plan \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"quantity_mt": 500, "purchase_deadline": "2025-11-15"}'
```

`/docs` has the same endpoints with a **Try it out** button: click **Authorize**
and paste either the API key or a session token, depending on the route.

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
| `MGO_SCENARIO_DATE` | `2025-10-24` — the historical date every feature treats as "today" |
| `SUPABASE_DB_URL` | none — required |
| `SUPABASE_DB_USER` | none — required |
| `SUPABASE_DB_PASSWORD` | none — required |
| `SUPABASE_DB_POOL_SIZE` | `5` (the free tier allows 60 connections in total) |


### Sprint 4 analysis integration

Authenticated GET `/api/v1/purchase-plan/recommendation` and `/api/v1/purchase-plan/cost-impact` now expose independent guidance and cost availability. Both require saved-context query preconditions; see [the complete API/provider contract](../docs/sprint-4-purchase-plan-api-contract.md). Ownership uses the existing verified Clerk subject mapping. Saved-plan GET derives days from the active configured scenario, including previously saved/overdue plans, without updating stored rows.

`PlanAnalysisProvider` is Wunna's normalized ML boundary. Default output is explicitly unavailable; no policy or model adapter is implemented. Register a real provider bean when ready. To test synthetic cost calculations locally, both profile `analysis-fixture` and property `mgo.analysis.fixture-enabled=true` are required. All fixture responses are labelled and authentication remains enabled. Do not enable this profile for real-model output. Forecasts exist independently of plans; calculations are on demand, with no persisted totals or recommendation FK/table changes.

Run `./mvnw clean test` (`.\mvnw.cmd clean test` on Windows). `PlanAnalysisHttpTests` starts a real local HTTP server on a random port, while stubbing identity decoding and database repositories. It verifies fixture costs, authentication requirements, two-owner isolation, conflicts and active-scenario reads. Unit tests cover signed/fractional calculations, missing inputs, incompatible basis, invalid ranges, provider failure/context checks and fixture opt-in isolation. No shared database credentials or writes are needed by these tests; real Clerk/DB/ML deployment checks remain pending.
