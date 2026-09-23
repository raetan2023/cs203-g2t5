# Team responsibility overview


Based on the [PRD](PRD.md), [database schema](database-schema.md), supplied sprint screenshot, and the working split agreed in our discussion. This is a planning guide, not a claim that these components are already implemented. Wunna has started backend work, as reported by Rae; its implementation has not been reviewed here. The checkout includes a SQL schema script whose application to a database has not been verified.


## Current stage

Localhost only with mock application data. Demo scope is the PRD's current MVP flow, including historical MGO prices. The larger forecasting/analysis design is outside this sprint. These are two design scopes in the schema docs; separate physical database instances are not specified. Database integration is included this sprint, limited to USERS, PURCHASE_PLANS, MARKET_SERIES, and MARKET_OBSERVATIONS. Frontend/backend contributors can inject their own clearly labelled mock fixtures while Rae prepares this smaller database. They then connect their features to it before sprint completion; real historical sourcing remains deferred. See [backend conventions and checkpoints](backend-conventions.md).

The agreed frontend split is: Luck owns UI design, shared frontend infrastructure/navigation, and authentication screens; Rae owns purchase-plan screens; Anjali owns market context frontend and backend. Nelson implements the authentication/provider/session logic called by Luck's screens. Wunna verifies authentication in Spring Boot. Authentication provider selection is Supabase Auth.

Luck's mockups are expected under `docs/ui-mockups/`; receipt and review are not yet verified. Designs are not completed frontend code. Each feature owner connects and tests their own feature with the relevant backend owner; Luck maintains visual consistency and shared routing.

## At a glance

| Person | Working responsibility | Main deliverable |
| --- | --- | --- |
| Rae (TR) | Database setup/migrations and purchase-plan frontend | Database handoff plus working plan CRUD screens connected to the API |
| Anjali (AS) | Market-context feature, frontend and backend | A dashboard that displays historical data retrieved through her Spring Boot API |
| Luck (HL) | UI design, shared frontend, and authentication screens | Shared components/layout/navigation and login/register/reset UI calling Nelson's auth logic |
| Nelson (NT) | Authentication logic, provider integration, and sessions | Registration/login/reset/logout functions, session handling, and access-token handoff for frontend consumers |
| Wunna (WA) | Shared Spring Boot foundation, API security, and overall integration | A backend that supports feature contributions and a working end-to-end application; owner of purchase-plan APIs |
| Yash (YA) | Release planning and velocity baseline | Agreed sprint/demo scope, progress tracking, and clear ownership for remaining work |


## Rae (TR): database and purchase-plan frontend

**Work**

- Provision/configure the development database and give backend contributors the access they need through a private channel.
- Maintain repeatable migrations for the current schema: minimal user ownership record, purchase plans, market series, and market observations.
- Enforce required fields, foreign keys, positive plan quantities, one plan per user, and unique series/date observations.
- Verify the minimal signup-to-user-ID linkage with Nelson and Wunna so purchase plans reference the authenticated owner. The existing SQL automatically synchronizes auth.users to public.users; verify this when integrating the database. Separate profile creation/editing is outside this sprint; do not add duplicate password storage.
- Document database initialization and configuration-variable names.
- Implement purchase-plan empty state, create/edit form, saved summary, and delete interaction using Luck's mockups/shared components.
- Display quantity, deadline, scenario date, and derived time remaining/urgency under the agreed rules.
- Connect plan screens to Wunna's APIs; handle Save/Cancel, loading, empty, validation, and server-error states.
- Test plan interactions and persistence with Wunna; use agreed mock responses while the database is being prepared, then verify database-backed persistence this sprint, including after backend restart.

**Needs from others:** Luck's mockups, shared components, and routing conventions; Wunna's plan API contract/request helper and database connection requirements; Nelson's identity/session interface; Anjali's market-data needs.

**Hands off:** working purchase-plan screens plus the smaller current-sprint database, migrations, schema details, and setup instructions. Wunna and Anjali write their own feature's backend database-access code against it.

**Boundary to confirm:** historical data sourcing and import are not automatically included in database ownership. Assign an import owner explicitly; TR can own loading while Anjali specifies the required data if the team agrees.

## Anjali (AS): market context, end to end

**Work**

- Implement the historical dashboard using Luck's design.
- Implement its Spring Boot controller, service, and database queries inside the shared backend project.
- Serve clearly labelled mock historical MGO/Gasoil prices and indicators during development; connect to mock records in `MARKET_SERIES` and `MARKET_OBSERVATIONS` this sprint.
- Return and display the scenario date, observation dates, sources, currency, units, and observed/estimated/imputed labels.
- Handle loading, empty, unavailable, and error states without inventing observations or metadata.
- Connect her page to her API and verify that labelled mock data appears correctly; repeat with database-backed mock data before sprint completion.

**Needs from others:** Luck's design/shared layout; Wunna's backend foundation, API conventions, and security setup; self-supplied mock fixtures initially, then Rae's smaller database this sprint (real source data later); Nelson's shared session/token interface.

**Hands off:** a working market-context page and API, response examples, and tested behaviour for the supported historical scenario(s).

**Boundary:** forecasting, AI training, cost impacts, and recommendations are later work. The current feature is historical market context. Selected indicators and supported scenario dates still need agreement.

## Luck (HL): UI design, shared frontend, and authentication screens

**Work**

- Maintain UI mockups and design consistency across the MVP.
- Set up the frontend project, shared components/styles, layout, routing, and sidebar.
- Implement registration, login, and password-reset screens with required fields and loading/error/success states.
- Wire those screens to Nelson's authentication functions; invoke his logout function from the sidebar.
- Integrate Rae's purchase-plan page and Anjali's market-context page into shared navigation; review visual consistency while feature owners fix their own page issues.

**Needs from others:** Nelson's auth functions/session state and error contract; Rae's plan page; Anjali's dashboard; Wunna's shared API helper/configuration.

**Hands off:** runnable shared frontend and authentication screens. Luck does not implement Rae's purchase-plan page or Anjali's market-context page.

## Nelson (NT): authentication logic and frontend sessions

**Work**

- Implement registration/login/password-reset/logout functions using the agreed provider, for Luck's screens to call.
- Agree function inputs, results, and errors with Luck: registration uses email/display name/password; login uses email/password.
- Handle session restoration, token refresh as supported by the provider, and session state/current-token access for other contributors.
- Supply the authenticated user ID to Wunna and coordinate signup with Rae's minimal user-record linkage. Separate profile creation/editing is deferred; no profile screen or standalone profile API is required. Registration still includes the PRD's display name field, whose storage can use the agreed authentication mechanism.
- Help verify authentication, expired sessions, logout, and test-account behaviour with Luck and Wunna.

**Needs from others:** Luck's screen/input requirements; the team's provider decision and project configuration; Rae's minimal user-record linkage; Wunna's API authentication contract.

**Hands off:** authentication functions and session/error interfaces to Luck; current-token access and verification/identity details to Wunna and other frontend consumers.

**Boundary:** Luck implements the authentication screens; Nelson implements the logic behind them. Wunna configures Spring Boot token verification and backend authorization. If Supabase Auth is adopted, credential management belongs to the provider; this split does not require Nelson to implement duplicate Java login/password endpoints.

## Wunna (WA): backend foundation and integration

**Work**

- Set up the shared Spring Boot project, run instructions, environment-based configuration, and basic health endpoint.
- Agree API naming, request/response formats, dates, validation errors, and shared conventions with feature owners.
- Connect the backend to TR's database and configure shared authentication verification with Nelson.
- Configure allowed frontend origins where needed and maintain the shared frontend API helper, consuming Nelson's token interface.
- Provide the structure Anjali uses for her backend feature; she owns its implementation and page-level integration.
- Implement purchase-plan create/read/update/delete APIs, validation, persistence, owner checks, and scenario-relative derived values.
- Own the shared mock scenario date/configuration and coordinate supported dates with Anjali and Rae so both pages use the same date.
- Work with Rae to connect plan screens; coordinate shared frontend configuration with Luck and resolve application integration issues with feature owners.
- Test the complete flow across login, dashboard, plan management, and logout, including two-account isolation.

**Needs from others:** Rae's database and plan screens; Nelson's auth logic; Anjali's market-context feature; Luck's shared frontend/auth screens; YA's agreed demo scope.

**Hands off:** shared backend/request infrastructure, documented API behaviour, purchase-plan endpoints, and evidence that the integrated journey works.

**Boundary:** coordinating the backend does not require writing Anjali's feature, Rae's plan screens, or Luck's authentication screens. Feature owners should deliver functioning integrations; Wunna checks that they work together.

## Yash: release planning

**Work**

- Maintain the Release 1 plan and velocity baseline represented by the planning task.
- Coordinate confirmation of demo scope, acceptance criteria, estimates, and feature dependencies.
- Help make unresolved ownership visible, including later data import and any future deployment.
- Arrange integration checkpoints so the team has time to test the combined application.

**Needs from others:** realistic estimates, actual progress, blockers, and demonstrable completion from each owner.

**Hands off:** an agreed delivery plan and a clear list of what the demo must show. These coordination details are suggested ways to carry out the planning responsibility; no detailed Jira description was available.

## Main handoffs

| From -> to | What passes between them |
| --- | --- |
| Luck -> Rae and Anjali | Designs, shared components, layout/routing conventions |
| Nelson <-> Luck | Authentication functions, form inputs/results/errors, session state, and logout wiring |
| Rae -> Wunna and Anjali | Database access, migrations, table/field definitions |
| Nelson -> Wunna | Authentication configuration and identity/token agreement |
| Nelson -> frontend contributors | Session state, current token access, and logout function |
| Wunna -> Anjali | Shared Spring Boot structure, security, and API conventions |
| Anjali -> shared app | Working market-context page and backend feature |
| Wunna <-> Rae | Purchase-plan API contract, request wiring, validation/error display |
| Wunna <-> Luck | Shared API helper/configuration and application routing integration |
| Everyone -> Yash | Progress, estimates, dependencies, blockers, and completion evidence |

## Working sequence

1. Agree contracts and outstanding rules; Luck can design while Wunna, Rae, and Nelson establish the shared foundations.
2. Anjali builds market context; Rae builds plan screens and prepares the database; Luck builds shared frontend/auth screens; Nelson supplies auth/session logic. Wunna builds shared integration and plan APIs.
3. Frontend/backend contributors can inject mock data to progress in parallel with Rae's database setup. Agree compatible fixtures and who loads them, then replace temporary stores with the smaller database this sprint. Real historical sourcing stays deferred.
4. Verify login -> historical dashboard -> create/view/edit/delete plan -> logout against the integrated smaller database with mock data, including persistence after backend restart and ownership checks.

## Sprint boundaries and remaining decisions

- Confirm authentication provider; separate profile creation/editing is outside this sprint. Minimal signup identity linkage remains necessary for plan ownership.
- Wunna owns the shared scenario-date configuration; agree the actual mock date and supported-date behaviour with Anjali and Rae. Anjali coordinates displayed mock series. Historical source-data collection/import remains deferred.
- Agree deadline meaning, date validation, calendar versus trading days, and urgency presentation/thresholds. Always derive time remaining from the historical scenario date, not today.
- Current demo environment confirmed as localhost; deployment is deferred.

Separate profile creation/editing, the larger forecasting schema, model evaluation, purchase-cost impacts, recommendations, and decisions remain later work. This overview does not assign their implementation now.
