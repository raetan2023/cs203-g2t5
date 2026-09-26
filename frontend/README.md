# Bunker Buddy frontend

React 19 + TypeScript + Vite, with Clerk authentication and a Spring Boot API. Includes sign-in, signup, session/logout handling, Home, shared header/sidebar/navigation and the purchase-plan feature. Clerk supplies email/password recovery and the configured Google and Microsoft login flows.

## Run and test during development

Requires Node.js 22.12+ (tested with 22.22.3).

```powershell
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

On macOS/Linux, use `cp .env.example .env.local` instead of `copy`. Put the Clerk publishable key and backend API key in `.env.local`, then open the printed localhost URL (normally http://127.0.0.1:5173). Keep Spring Boot running on the URL configured by `VITE_API_URL`.

Running on WSL (Windows): open the app at http://localhost:5173 and keep VITE_API_URL=http://localhost:8000. A Windows browser can reach localhost inside WSL but not 127.0.0.1 for the same port so using 127.0.0.1 makes the page load while every backend call fails with "Failed to fetch" (ERR_CONNECTION_REFUSED). Use localhost for both the app and the API URL.

Clerk handles sign-in, signup, email verification, password reset, social login, sessions and logout. The frontend requests a current Clerk session token for each protected purchase-plan request and sends it as `Authorization: Bearer <token>` to Spring Boot.

```powershell
npm test
npm run build
```

The normal development and production entries both use Clerk and the real backend API. The mock services remain available for automated tests and isolated component work, but are not mounted by `main.tsx`.

## Structure

```text
src/
  app/                     App orchestration, browser-history router, base styles
  components/              Header/sidebar shell, brand, icons, loading/error page
  features/
    auth/                  Sign-in/signup UI, auth service/session types, light-card styles
    home/                  Personalized welcome and purchase-plan link
    purchase-plan/         Existing CRUD page/components/styles/service contract
  preview/                 Test-only mock auth, fixture wiring and demo controls
```

`App` accepts `auth`, `createPlanService(user)`, `scenarioDate`, an optional real-auth page renderer, optional `mock` labelling, and an optional `MarketDashboard` component. The plan service is created once per signed-in user and reused across page navigation. Logout/expiry discards that service and page state.

Routing uses a small local History API wrapper (`app/router.tsx`): semantic anchor links, push/replace state and popstate subscription, without a routing dependency. Direct URLs and Back/Forward are supported. Vite serves app routes during development; a future host must serve index.html for app routes. Private route guards demonstrate UI behavior and are not backend authorization.

| Route | Behavior |
| --- | --- |
| `/` | Redirect to sign-in or Home based on session |
| `/login` | Sign-in form; signed-in users return to the app |
| `/signup` | Signup form; signed-in users return to the app |
| `/home` | Welcome and Go to purchase plans |
| `/purchase-plans` | Existing one-plan CRUD feature |
| `/market-dashboard` | Mount the supplied dashboard component, or show an explicit unavailable message |
| Other paths | Page-not-found with a working return link |

Market navigation is disabled until a component is supplied. Recommendation stays disabled/Coming soon and has no route. Password recovery is supplied by Clerk's sign-in flow.

## Clerk authentication

`main.tsx` mounts `ClerkProvider`, and `app/ClerkApp.tsx` maps the active Clerk user into the app's `SessionUser`. Clerk's prebuilt screens are mounted on `/login` and `/signup`, using hash routing internally so their multi-step and OAuth callback screens coexist with the small History API router.

`createApiPlanService` receives Clerk's `getToken` callback and retrieves a token for every protected request. Spring Boot verifies that token and maps its `sub` claim to `users.clerk_user_id`. Signing out clears Clerk's active session and returns to `/login`.

## Market dashboard handoff to Anjali

Supply a component to `App` with the signature `ComponentType<{ scenarioDate: string }>`. The shared shell renders its header/navigation once; the dashboard should render only its page content, with scoped styles. Keep networking/auth in the agreed service boundary. No dashboard data, charts or screen implementation was added.

## Purchase-plan integration

`PurchasePlanPage` remains independently exported from `features/purchase-plan/index.ts` and imports its own CSS. Pass `service` and explicit `scenarioDate`. `PurchasePlanService` exposes read/create/update/delete; adapters unwrap GET/POST/PUT responses as `{ plan }` and map DELETE 204 to void without parsing a body. Inputs contain only quantity_mt and purchase_deadline. General/field failures use `PlanError`.

The mock scenario is 24 October 2025; 500 MT / 15 November 2025 shows **22 days**. Dates remain YYYY-MM-DD and display in UTC. Saved days_remaining comes from the service. `apiService.ts` supplies `createApiPlanService` and `fetchScenarioDate` via GET `/api/v1/config`; preview tests still use explicit fixtures. The live app sends a fresh Clerk Bearer token with purchase-plan requests.

The backend remains responsible for rejecting invalid or expired tokens and enforcing ownership using the Clerk `sub` claim. Two-account isolation should be checked before release.

## Intentional visual differences

- Rae requested removal of the purchase-plan empty-state circle/plus; the top-right Create plan control remains.
- Auth hero copy describes currently available planning/market context, not a validated forecasting product. The decorative SVG is explicitly illustrative/mock data.
- Clerk renders the enabled Google and Microsoft providers, email/password flow, verification and password recovery.
- The local mock auth screens remain available only to tests and isolated preview work.
- Purchase plans use neutral copy, numeric days remaining, a native date picker and accessible error/focus states. Calendar input formatting follows the browser locale.
- The menu opens a modal drawer; background interaction is blocked by the native dialog and focus is trapped/restored. Navigation closes the drawer.
- On narrow layouts the auth hero is shortened and its decorative chart/badges are hidden to prioritize the form.

## Verification and resume checkpoint (26 September 2026)

- `npm test`: **30 tests passed** across 4 files (10 purchase-plan UI/mock tests, 12 merged API-adapter tests, 8 auth/shared-app tests), after incorporating the latest origin/main changes.
- `npm run build`: TypeScript and Vite production build passed. The development preview is excluded from the production entry.
- Automated coverage includes CRUD/cancel/validation/failures, auth validation and password visibility, signup/provider-field-error retry, session-load retry, duplicate-login prevention, navigation with a stable plan store, logout failure, drawer focus/Escape, expiry and private-route guards, popstate handling, unknown routes and dashboard mounting.
- Clerk `/login` and `/signup` were verified in a browser with Google, Microsoft and email/password options visible. Desktop/mobile visual comparison, native date picker, dialog inertness and real-browser Back/Forward remain **unverified**. jsdom provides minimal dialog method shims for interaction tests.
- Clerk sign-in and the protected backend smoke test succeeded with `200: {"plan":null}`. Provider redirects, email delivery and two-account ownership remain to be exercised manually.

**Completed checkpoint:** Clerk provider/session/logout integration, Clerk sign-in/signup screens, authenticated purchase-plan API wiring, shared shell/routes, Home and automated tests/build. Remaining team checks include provider redirects, email delivery, two-account ownership, responsive visual review and mounting Anjali's dashboard when supplied.
