# Sprint 4 recommendations: branch status and testing

Updated: 11 October 2026. Branch: `rae/sprint-4-recommendations`.

## Where this branch is now

The purchase-plan, recommendations and cost-impact frontend is implemented, and the normal signed-in app is connected to the feature backend. The backend API and cost calculations are working under automated and local fixture tests, but meaningful end-to-end testing is still limited: real ML outputs and an approved recommendation policy are not connected yet.

| Area | Current status |
| --- | --- |
| Purchase plans | Create, read, edit and delete one saved plan per authenticated user; backend-derived days remaining use the active historical scenario |
| Feature backend | Authenticated recommendation and cost-impact endpoints, ownership/context validation and cost calculations implemented |
| Normal app | Uses real HTTP adapters and Clerk tokens; returns explicit unavailable results when no provider is connected |
| Recommendation UI preview | Available through `/preview.html` with clearly labelled mock guidance and cost estimates; only the frontend needs to run |
| Backend cost fixture | Optional synthetic prices for checking API wiring/calculations; recommendations still unavailable |
| Next sprint | Real ML integration and support for multiple purchase plans |

This handoff accompanies the API integration changes built on `11572b7` and `8b1f1fb`. Teammates should use the latest `rae/sprint-4-recommendations` branch after the integration commit is pushed; the two earlier commits alone do not include the new backend wiring.

## 1. Preview recommendations now: frontend only

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

Open the address printed by Vite with `/preview.html` appended, normally:

```text
http://127.0.0.1:5173/preview.html
```

No backend, real Clerk login or database is required for this isolated preview. It starts with the ready recommendation example. The address may change to `/purchase-plans/recommendation` after loading; that is expected. To restart the mock preview after a browser refresh, reopen `/preview.html` explicitly. Refreshing the app route loads the normal Clerk app instead.

Open **Demo controls** and select a **Starting state**:

| Example | What to check |
| --- | --- |
| Recommendation - ready | Guidance, cost cards and visible synthetic-data labels |
| Recommendation - loading | Loading placeholders before results arrive |
| Recommendation - fails once | Recommendation error and successful retry |
| Recommendation - unavailable | Cost estimates remain available without guidance |
| Recommendation - missing forecast | Explicit unavailable messages rather than invented prices |
| Recommendation - unsupported context | Unsupported saved inputs/scenario are explained |
| Recommendation - no saved plan | Link back to creating a plan |

The ready mock uses **100 MT**, deadline **30 October 2025**, and scenario **24 October 2025**. It displays illustrative guidance to consider purchasing on **29 October**, reference cost **USD 70,000**, forecast cost **USD 67,000-70,000**, and potential savings **USD 0-3,000**. This wording is a fixed UI example, not an implemented recommendation algorithm or real ML result.

Also check that **Price basis and uncertainty** starts collapsed and opens with keyboard/mouse input. Use **Toggle demo scenario** to check that obsolete guidance clears, and **Reset example** to restore the configured inputs. Mock changes are temporary and do not save to the database.

## 2. Test the normal app and backend

Use two terminals. The following backend commands use **Bash/WSL/Git Bash**, matching the team's `source .env.local` workflow.

Backend terminal, starting from the repository root:

```bash
cd backend
set -a
source .env.local
set +a
./mvnw spring-boot:run
```

The local environment file must contain the existing backend connection settings. Do not commit credentials. See [backend setup](../backend/README.md) for required variables. `source` does not work in PowerShell; in PowerShell, configure the environment variables as described in backend setup and run `.\mvnw.cmd spring-boot:run`.

Frontend terminal, starting from the repository root:

```bash
cd frontend
npm run dev
```

For the normal app, configure `frontend/.env.local` with the team's Clerk settings and `VITE_API_URL` pointing to the local backend, normally `http://127.0.0.1:8000`. Open the Vite root URL, sign in, create/save a plan, and click **View recommendation**.

**Expected without ML:** the plan saves and loads, but recommendation and cost impact report unavailable. This is intentional. No deadline entered in the normal app enables the mock recommendation; use `/preview.html` to preview guidance.

Real Clerk/Supabase two-account persistence and ownership testing remains a deployment acceptance check. Passing the isolated preview or stubbed backend tests does not establish that those live services are configured correctly.

### Optional: exercise backend cost calculations with synthetic prices

Stop the backend, then run from the same Bash backend terminal with its environment loaded:

```bash
export SPRING_PROFILES_ACTIVE=analysis-fixture
export MGO_ANALYSIS_FIXTURE_ENABLED=true
export MGO_SCENARIO_DATE=2025-10-24
./mvnw spring-boot:run
```

Both fixture settings are required. In the normal signed-in app, save **100 MT** with deadline **15 November 2025**, then open **View recommendation**.

Expected results:

- **22 days remaining**.
- **No recommendation available**: this fixture does not supply guidance.
- Forecast target **30 October 2025**, not an assumed purchase deadline.
- Reference total **USD 70,000**; forecast total **USD 68,000-74,000**.
- Difference **USD -2,000 to +4,000**; central estimate **USD 71,000**.
- Visible **Synthetic demo data** label.

The backend fixture intentionally uses different values from the browser preview. It verifies HTTP integration and backend arithmetic, not real predictions. Other scenario dates have no configured fixture prices.

After testing, stop the backend and clear the fixture settings before restarting normally:

```bash
unset SPRING_PROFILES_ACTIVE MGO_ANALYSIS_FIXTURE_ENABLED
./mvnw spring-boot:run
```

## 3. Automated checks

Run each block from the repository root; development servers are not required:

```bash
cd frontend
npm test
npm run build
```

```bash
cd backend
./mvnw clean test
```

On PowerShell use `npm.cmd test`, `npm.cmd run build` and `.\mvnw.cmd clean test`.

Last verified on this branch: **87 frontend tests**, **28 backend tests**, and TypeScript/Vite production build passed. The existing dashboard prop mismatch is fixed; a bundle-size warning remains.

Backend HTTP tests start an actual local Spring server with deterministic fixture prices, but stub token decoding and database repositories. Frontend integration tests exercise the real adapters with mocked HTTP responses and Clerk hooks. These checks cover calculations, ownership/context handling, unavailable/error states, independent retries and stale-response protection; they are not actual ML verification.

## Next sprint

- **ML integration:** Wunna connects normalized model/reference outputs through `PlanAnalysisProvider`; agree production source, horizon, units and uncertainty semantics. Recommendation generation also needs an approved policy before genuine guidance can be shown.
- **Multiple purchase plans:** extend the current one-plan-per-user design, including API, ownership rules, persistence constraints and frontend selection. This branch still supports only one saved plan per user; multiple-plan behavior is not implemented here.

No shared database migration was required or applied for the current analysis integration. For endpoint details and the ML handoff, see the [purchase-plan analysis API contract](sprint-4-purchase-plan-api-contract.md).
