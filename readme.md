# Bunker Buddy

CS203 Group 2 Team 5's historical Marine Gas Oil (MGO) purchase-planning project at Singapore Management University. Bunker Buddy brings dated market context and a user's fuel purchase plan into one app, with analysis interfaces for experimental forecasts, cost impact and advisory recommendations.

The app uses **React + TypeScript + Vite**, a **Java Spring Boot API**, **Clerk authentication**, and **Supabase-hosted PostgreSQL**. Python modelling experiments live separately in this repository.

## Current functionality

- Clerk sign-in, signup, session handling and logout.
- A historical market dashboard with prices, charts and indicators.
- One saved purchase plan per user: create, view, edit and delete a quantity in metric tonnes and a purchase deadline.
- Days remaining calculated from the configured **historical scenario date**, rather than today's date.
- Authenticated recommendation and cost-impact interfaces with independent loading, error and unavailable states.
- Standalone linear regression, CatBoost and Random Forest experiments, with a [model comparison](modelcomparison.md).

The normal app uses the backend analysis API, whose default provider reports unavailable forecasts and guidance. The Python models are **not connected to the app**. Synthetic preview/fixture outputs are explicitly labelled and do not establish real model performance.

## Repository map

| Path | Purpose |
| --- | --- |
| [`frontend/`](frontend/README.md) | Main React app: authentication, navigation, dashboard, purchase plans and analysis UI |
| [`backend/`](backend/README.md) | Shared Spring Boot API, Supabase market data, token verification and PostgreSQL-backed purchase plans |
| [`historical-market-dashboard/`](historical-market-dashboard/README.md) | Separate standalone market dashboard; has its own setup and ports |
| [`models/linear-regression/`](models/linear-regression/README.md) | Gasoil regression and experimental gasoil-to-MGO mapping |
| [`models/ridge-regression/`](models/ridge-regression/README.md) | Ridge MGO return forecasting and walk-forward evaluation |
| [`models/catboost-mgo/`](models/catboost-mgo/README.md) | CatBoost MGO regression experiment |
| [`models/random-forest-mgo/`](models/random-forest-mgo/README.md) | Random Forest MGO regression and approximate intervals |
| [`docs/`](docs/PRD.md) | Product requirements, database design, release planning and feature contracts |

## Run the main app locally

Requires **Node.js 22.12+**, **Java 21+**, access to the team's PostgreSQL database, and a Clerk publishable key. The backend includes Maven wrappers; a separate Maven installation is not needed. First-time dependency installation needs internet access.

```bash
git clone https://github.com/raetan2023/cs203-g2t5.git
cd cs203-g2t5
```

### 1. Start the backend

Set database credentials in the terminal that will run Spring Boot. Replace the placeholders with the team's connection details:

```bash
export SUPABASE_DB_URL='jdbc:postgresql://HOST:PORT/postgres'
export SUPABASE_DB_USER='your-database-user'
export SUPABASE_DB_PASSWORD='your-database-password'
export CLERK_ISSUER_URI='https://YOUR-CLERK-INSTANCE.clerk.accounts.dev'

cd backend
./mvnw spring-boot:run
```

Use a JDBC URL without embedded credentials; put the username and password in their separate variables. The Clerk issuer must match the frontend's Clerk instance. Database credentials must be configured for startup, and saved plans require a reachable database with the expected schema. See the [backend guide](backend/README.md) for Supabase connection options and troubleshooting.

The default API URL is **http://127.0.0.1:8000**. Interactive API documentation is at **http://127.0.0.1:8000/docs**.

### 2. Start the frontend

In another terminal, from the repository root:

```bash
cd frontend
npm ci
cp .env.example .env.local
```

Edit `frontend/.env.local` with the following settings:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_WITH_YOUR_CLERK_KEY
VITE_API_URL=http://127.0.0.1:8000
VITE_API_KEY=mgo_public_demo_2026
```

Then run:

```bash
npm run dev
```

Open **http://127.0.0.1:5173**, or the URL Vite prints, and sign in. Use the purchase-plan page to save a quantity and deadline, then open its recommendation page to inspect available analysis.

These commands use macOS/Linux shell syntax. On Windows, use `copy .env.example .env.local`, set environment variables in your shell, and run `mvnw.cmd` in place of `./mvnw`. For WSL, use `http://localhost:5173` and `VITE_API_URL=http://localhost:8000`; see the [frontend guide](frontend/README.md).

### Configuration and data behaviour

| Setting | Purpose / default |
| --- | --- |
| `PORT` | Backend port; `8000` |
| `MGO_SCENARIO_DATE` | Historical date treated as today; `2025-10-24` |
| `MGO_API_KEY` | Market-data API key; intentionally public academic demo value `mgo_public_demo_2026` |
| `FRONTEND_ORIGINS` | Allowed browser origins; `http://127.0.0.1:5173,http://localhost:5173` |
| `CLERK_ISSUER_URI` | Identity provider used to verify session tokens; match the frontend instance |
| `SUPABASE_DB_URL`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD` | Required database connection settings |

Market-data routes use `X-API-Key`; private purchase-plan and analysis routes use `Authorization: Bearer <Clerk session token>`. The backend resolves the authenticated user's ownership rather than trusting a user ID supplied by the browser.

Shared data routes (`/api/v1/data/{sourceId}`, `/api/v1/sources`) and the backend homepage read imported observations from Supabase. The current React dashboard uses `/api/v1/market/stored`, also backed by Supabase. No bundled backend JSON files are required. Empty sources return no observations; database failures return `503`. The legacy scenario dashboard has a separate database/external-service fallback path; see the [backend documentation](backend/README.md#market-dashboard).

Keep database credentials and session tokens out of Git. Frontend `VITE_*` values are exposed to the browser, so they must not contain server secrets. The demo API key above is intentionally public. Confirm database setup with the owner using the [schema documentation](docs/database-schema.md) and [migration notes](docs/migrations/README.md); migration scripts are not automatically applied at startup.

## Checks and isolated preview

Run frontend checks from `frontend/`:

```bash
npm test
npm run build
```

Run backend tests from `backend/`:

```bash
./mvnw clean test
```

For a synthetic recommendation preview without Clerk or the backend, start the frontend and open **http://127.0.0.1:5173/preview.html**. This entry provides mock scenarios; refreshing a normal app route returns to the Clerk entry.

Backend synthetic cost analysis requires both the `analysis-fixture` profile and `mgo.analysis.fixture-enabled=true`. Authentication remains required. See the [analysis contract](docs/sprint-4-purchase-plan-api-contract.md) for exact fixture commands and the [testing handoff](docs/sprint-4-recommendations-testing.md) for acceptance checks. Automated tests use mocked or stubbed dependencies and do not verify deployed Clerk, shared Supabase, or real ML integration.

## Modelling experiments

Each model folder has its own dependencies, input-data requirements and run instructions. Model datasets remain separate from the Supabase-backed data API; use the relevant model README to locate the required training data. [modelcomparison.md](modelcomparison.md) explains the evaluation differences and limitations.

Treat these results as research outputs. Sparse observed MGO quotes, publication timing and uncertainty calibration limit the evidence; the experiments do not establish validated purchasing recommendations.

## Further documentation

- [Product requirements and open decisions](docs/PRD.md)
- [Release planning](docs/release_planning.md)
- [Team overview](docs/team-overview.md)
- [Development process](docs/documentation_of_processes.md)
- [Detailed website running guide](website_running_guide.md)
- [Analysis API and provider contract](docs/sprint-4-purchase-plan-api-contract.md)

For changes, create a feature branch, keep the PR focused, run the relevant component checks, and update its documentation when behaviour or configuration changes. Product documents also contain planned scope and earlier decisions; consult the current component guides and source for implementation details.
