# Backend (Spring Boot)

The team's shared Spring Boot application. It exposes the historical market data
the dashboard needs, and is the project other backend features are built in.

No database is wired up yet. Observations are read at startup from the JSON
snapshots in `data/snapshots`, so the API works on a fresh checkout with no setup.
Once the current-sprint schema is applied (see
[docs/database-schema.md](../docs/database-schema.md)), those snapshots become
import data for `MARKET_SERIES` / `MARKET_OBSERVATIONS` and `SnapshotStore` is
replaced by database queries. Endpoints and response shapes stay the same.

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
says `Could not reach the database`, the market-data endpoints still work — only
database-backed features are affected.

If the app fails to start with `'url' must start with "jdbc"`, the `SUPABASE_*`
variables are not set in that shell.

Open http://127.0.0.1:8000. Swagger UI is at `/docs`.

```bash
curl -H 'X-API-Key: mgo_public_demo_2026' 'http://127.0.0.1:8000/api/v1/data/brent?limit=10'
```

## API

`/`, `/health` and `/docs` are public. Every `/api/` route requires an
`X-API-Key` header; the development key is `mgo_public_demo_2026`.

| Endpoint | Returns |
| --- | --- |
| `GET /health` | Service status, for uptime checks |
| `GET /api/v1/sources` | Every series with its provider, unit, record count, and date range |
| `GET /api/v1/data/{sourceId}` | Dated observations for one series |

`/api/v1/data/{sourceId}` accepts `start`, `end` (ISO dates), `series` (for
sources holding several sub-series, such as bunker sales), `limit` (1–25000,
default 5000, keeps the most recent rows), and `format` (`json` or `csv`).

## Available data

| Source ID | Series | Records | Range |
| --- | --- | --- | --- |
| `mgo_singapore` | Singapore MGO prices (USD/MT) | 233 | 2020-03 – 2026-09 |
| `brent` | Brent crude (USD/barrel) | 6,773 | 2000-01 – 2026-09 |
| `usd_index` | Broad USD index | 5,188 | 2006-01 – 2026-09 |
| `bunker_sales` | Singapore bunker sales, 16 fuel types | 6,080 | 1995-01 – 2026-08 |
| `gdelt` | Oil and shipping news counts | 1 | 2026-09-13 |
| `gasoil_singapore` | Singapore Gasoil futures | — | not yet sourced |
| `dubai_crude` | Dubai Crude Oil futures | — | not yet sourced |

MGO quotes are sparse (roughly 2–3 per month) and are observed values only at
their own dates. Gasoil and Dubai crude are login-gated at source and have no
data yet; those endpoints return an empty list rather than failing.

## Test

```bash
./mvnw test
```

## Configuration

| Environment variable | Default |
| --- | --- |
| `PORT` | `8000` |
| `MGO_API_KEY` | `mgo_public_demo_2026` |
| `MGO_SNAPSHOT_DIR` | `data/snapshots` (relative to the working directory) |
| `SUPABASE_DB_URL` | none — required |
| `SUPABASE_DB_USER` | none — required |
| `SUPABASE_DB_PASSWORD` | none — required |
| `SUPABASE_DB_POOL_SIZE` | `5` (the free tier allows 60 connections in total) |
