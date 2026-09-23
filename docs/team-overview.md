# Team responsibility overview

Updated: 23 September 2026. Untracked working reference for TR.

Based on the [PRD](PRD.md), [database schema](database-schema.md), supplied sprint screenshot, and the working split agreed in our discussion. This is a planning guide, not a claim that these components are already implemented. The repo currently contains documentation and schema designs, not a working application.

## Current stage

Localhost only with mock application data. Demo scope is the PRD's current MVP flow, including historical MGO prices. Wunna's database integration and historical sourcing follow later; they are not blockers for mock integration. See [backend conventions and checkpoints](backend-conventions.md).

Nelson's exact scope is being reconfirmed: the authentication-screen/session ownership below is the recommended split, not a finalized assignment. Luck owns the shared/remaining frontend; Anjali owns market context frontend and backend. If Luck implements authentication components, agree that explicitly and have Nelson supply their auth logic.

## At a glance

| Person | Working responsibility | Main deliverable |
| --- | --- | --- |
| Wunna (WA) | Database setup and migrations | A usable development database with the agreed tables and constraints |
| Anjali (AS) | Market-context feature, frontend and backend | A dashboard that displays historical data retrieved through her Spring Boot API |
| Luck (HL) | UI design across the app; frontend except market-context and authentication implementation | Shared layout/navigation and purchase-plan screens; designs for Anjali and Nelson |
| Nelson (NT) | Authentication feature and frontend session handling | Working registration, login, password reset, logout, and access-token handoff |
| TR | Shared Spring Boot foundation, API security, and overall integration | A backend that supports feature contributions and a working end-to-end application; proposed owner of purchase-plan APIs |
| YA | Release planning and velocity baseline | Agreed sprint/demo scope, progress tracking, and clear ownership for remaining work |

Purchase-plan backend ownership is proposed for TR and should be confirmed with the team. Supabase Auth is the working integration approach described below, but the PRD still records provider selection as tentative.

## Wunna (WA): database

**Work**

- Provision/configure the development database and give backend contributors the access they need through a private channel.
- Maintain repeatable migrations for the current schema: user/profile ownership record, purchase plans, market series, and market observations.
- Enforce required fields, foreign keys, positive plan quantities, one plan per user, and unique series/date observations.
- Agree the identity/profile structure with Nelson and TR. If Supabase Auth is adopted, link the application profile to the provider-managed user; do not add application password storage.
- Document database initialization and configuration-variable names.

**Needs from others:** Nelson's identity/profile requirements; TR's connection requirements; Anjali's market-series and observation needs.

**Hands off:** a working database, migrations, schema details, and setup instructions. TR and Anjali write their own feature's backend database-access code against it.

**Boundary to confirm:** historical data sourcing and import are not automatically included in database ownership. Assign an import owner explicitly; Wunna can own loading while Anjali specifies the required data if the team agrees.

## Anjali (AS): market context, end to end

**Work**

- Implement the historical dashboard using Luck's design.
- Implement its Spring Boot controller, service, and database queries inside the shared backend project.
- Serve clearly labelled mock historical MGO/Gasoil prices and indicators now; later read from `MARKET_SERIES` and `MARKET_OBSERVATIONS`.
- Return and display the scenario date, observation dates, sources, currency, units, and observed/estimated/imputed labels.
- Handle loading, empty, unavailable, and error states without inventing observations or metadata.
- Connect her page to her API and verify that labelled mock data appears correctly; repeat with database-backed data later.

**Needs from others:** Luck's design/shared layout; TR's backend foundation, API conventions, and security setup; mock fixtures initially (real database/source data later); Nelson's shared session/token interface.

**Hands off:** a working market-context page and API, response examples, and tested behaviour for the supported historical scenario(s).

**Boundary:** forecasting, AI training, cost impacts, and recommendations are later work. The current feature is historical market context. Selected indicators and supported scenario dates still need agreement.

## Luck (HL): UI design and remaining frontend

**Work**

- Design the screens and shared visual elements for the MVP, including authentication and market context.
- Implement the shared frontend layout, routing, and sidebar: Dashboard, My purchase plan, and Log out.
- Implement the purchase-plan empty state, create/edit form, summary, and delete interaction.
- Display quantity in metric tonnes, purchase deadline, scenario date, and derived time remaining/urgency under the agreed rules.
- Work with TR to connect purchase-plan screens to the API and display validation, loading, success, and failure states.
- Integrate Anjali's dashboard and Nelson's authentication screens into the shared app.

**Needs from others:** TR's API examples and shared request helper; Anjali's page; Nelson's authentication screens, session state, and logout function; team decisions on deadline and urgency presentation.

**Hands off:** runnable frontend screens and navigation, with designs that Anjali and Nelson can implement consistently.

**Boundary:** Nelson implements authentication screens and behaviour using Luck's design. Anjali implements market context using Luck's design. Luck's sidebar invokes Nelson's logout flow rather than implementing a second one.

## Nelson (NT): authentication and frontend sessions

**Work**

- Implement registration, login, password-reset, and related authentication screens using Luck's design.
- Connect registration/login/reset/logout to the agreed authentication provider.
- Collect email, display name, and password for registration; use email/password for login.
- Implement session restoration, token refresh as supported by the provider, and clear authentication errors.
- Provide one shared way for frontend code to obtain session state and the current access token.
- Coordinate profile creation and display-name storage with Wunna and TR.
- Supply two test accounts and help test logout, expired sessions, and account isolation.

**Needs from others:** Luck's designs; the team's provider decision and project configuration; Wunna's identity/profile schema; TR's API authentication contract.

**Hands off to TR:** a working login, token-access interface, provider verification configuration, agreed user-ID mapping, and test accounts.

**Boundary with TR:** Nelson gets the user authenticated and manages the browser session. TR configures Spring Boot to verify tokens and identify the caller. Each backend feature enforces its own applicable access rules using that verified identity. If Supabase Auth is adopted, password storage and verification belong to Supabase Auth, not a duplicate Spring Boot login system.

## Rae: backend foundation and integration

**Work**

- Set up the shared Spring Boot project, run instructions, environment-based configuration, and basic health endpoint.
- Agree API naming, request/response formats, dates, validation errors, and shared conventions with feature owners.
- Connect the backend to Wunna's database and configure shared authentication verification with Nelson.
- Configure allowed frontend origins where needed and maintain the shared frontend API helper, consuming Nelson's token interface.
- Provide the structure Anjali uses for her backend feature; she owns its implementation and page-level integration.
- Proposed: implement purchase-plan create/read/update/delete APIs, validation, persistence, owner checks, and scenario-relative derived values.
- Work with Luck to connect plan screens and resolve integration problems across the application.
- Test the complete flow across login, dashboard, plan management, and logout, including two-account isolation.

**Needs from others:** Wunna's database; Nelson's working authentication; Anjali's market-context feature; Luck's runnable frontend; YA's agreed demo scope.

**Hands off:** shared backend/request infrastructure, documented API behaviour, proposed purchase-plan endpoints, and evidence that the integrated journey works.

**Boundary:** coordinating the backend does not require writing Anjali's feature or Nelson's authentication screens. Feature owners should deliver functioning integrations; TR checks that they work together.

## Yash: release planning

**Work**

- Maintain the Release 1 plan and velocity baseline represented by the planning task.
- Coordinate confirmation of demo scope, acceptance criteria, estimates, and feature dependencies.
- Help make unresolved ownership visible, including purchase-plan APIs, data import, and deployment.
- Arrange integration checkpoints so the team has time to test the combined application.

**Needs from others:** realistic estimates, actual progress, blockers, and demonstrable completion from each owner.

**Hands off:** an agreed delivery plan and a clear list of what the demo must show. These coordination details are suggested ways to carry out the planning responsibility; no detailed Jira description was available.

## Main handoffs

| From -> to | What passes between them |
| --- | --- |
| Luck -> Anjali and Nelson | Designs, shared components, layout/routing conventions |
| Wunna -> TR and Anjali | Database access, migrations, table/field definitions |
| Nelson -> TR | Authentication configuration and identity/token agreement |
| Nelson -> frontend contributors | Session state, current token access, and logout function |
| TR -> Anjali | Shared Spring Boot structure, security, and API conventions |
| Anjali -> shared app | Working market-context page and backend feature |
| TR <-> Luck | Purchase-plan API contract, request wiring, validation/error display |
| Everyone -> YA | Progress, estimates, dependencies, blockers, and completion evidence |

## Working sequence

1. Agree contracts and outstanding rules; Luck can design while TR, Wunna, and Nelson establish the shared foundations.
2. Anjali builds market context, Nelson builds authentication, and Luck builds the remaining frontend. TR builds shared integration and, if confirmed, plan APIs.
3. Use clearly labelled mock fixtures through actual backend endpoints for the current local demo. Integrate Wunna's database and real data later.
4. Verify login -> historical dashboard -> create/view/edit/delete plan -> logout, with persistence and ownership checks.

## Remaining team decisions

- Confirm TR as purchase-plan backend owner and its sprint allocation.
- Confirm authentication provider and the profile-creation mechanism.
- Agree mock displayed series and scenario dates now; defer historical source-data collection/import until database integration.
- Agree deadline meaning, date validation, calendar versus trading days, and urgency presentation/thresholds. Always derive time remaining from the historical scenario date, not today.
- Current demo environment confirmed as localhost; deployment is deferred.

Forecasting, model evaluation, purchase-cost impacts, recommendations, and decisions remain later work. This overview does not assign their implementation now.
