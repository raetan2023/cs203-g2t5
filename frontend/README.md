# Bunker Buddy frontend

React 19 + TypeScript + Vite, with scoped plain CSS. Includes sign-in, signup, Home, shared header/sidebar/navigation and the existing purchase-plan feature. Market dashboard, Recommendation and password-reset screens are excluded. No extra runtime packages were added for this milestone.

## Run and test during development

Requires Node.js 22.12+ (tested with 22.22.3).

```powershell
cd frontend
npm install
npm run dev
```

Open the printed localhost URL (normally http://127.0.0.1:5173). Saved source changes update automatically. If PowerShell blocks `npm.ps1`, use `npm.cmd`. Keep the terminal open; Ctrl+C stops the server.

**Mock sign-in:** use `john@example.com` and any nonempty sample password. Any valid sample email works; this does not authenticate a real person. Signup uses the entered full name on Home but creates no real account. Do not enter real credentials. No passwords, tokens or mock account records are stored.

**Demo controls** at bottom right selects sign-in, signup, Home, slow Home loading, session/sign-in/signup/sign-out failures, and all previous purchase-plan examples. Failures happen once, then retry succeeds. Slow requests make pending states inspectable. Simulate session expiry returns to sign-in and clears private state.

The selected starting-state label describes the configured example, not your current route. Navigation keeps the session and saved plan in memory. Changing the example, toggling slow mode, or Reset example recreates the session and plan; refresh signs out and clears data. Navigating away from an unsaved form discards its draft. Expiry discards drafts with an explicit message; nothing is automatically submitted under another session.

```powershell
npm test
npm run build
```

**Production entry:** the mock preview is imported only in development. A production build deliberately shows an integration-not-configured message until the real auth and API adapters are mounted. It never falls back to simulated authentication. `npm run preview` therefore does not show the mock app; use `npm run dev` for the demo.

## Structure

```text
src/
  app/                     App orchestration, browser-history router, base styles
  components/              Header/sidebar shell, brand, icons, loading/error page
  features/
    auth/                  Sign-in/signup UI, auth service/session types, light-card styles
    home/                  Personalized welcome and purchase-plan link
    purchase-plan/         Existing CRUD page/components/styles/service contract
  preview/                 Development-only mock auth, fixture wiring, demo controls
```

`App` accepts `auth`, `createPlanService(user)`, `scenarioDate`, optional `mock` labelling, and optional `MarketDashboard` component. The plan service is created once per signed-in user and reused across page navigation. Logout/expiry discards that service and page state. A production adapter should retrieve persisted plans from the backend; mock session reset is not database deletion.

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

Market navigation is disabled until a component is supplied. Recommendation stays disabled/Coming soon and has no route. Password reset has no link, route or screen.

## Auth handoff to Nelson / Wunna

`features/auth/types.ts` defines the provisional `AuthService`: readSession, signIn, signUp, signOut and session-change subscription. Reuse/adapt Nelson's Clerk implementation when available; no Clerk frontend code or provider configuration was present in this checkout. Wire verified tokens through Wunna's API helper and enforce ownership on the backend.

Signup results can indicate a completed session or verification required. The latter currently shows a verification-pending message and sign-in link; a custom code/resend flow is **not implemented** until Nelson confirms his required provider flow. Mock signup completes immediately. Password validation requires a nonempty value; real password policy belongs to Clerk and should map errors through `AuthError(message, fields)`.

Social sign-in buttons are visibly disabled. Remember me is disabled until provider persistence is configured. Terms/Privacy links and agreement are omitted: Rae approved mock UI first with social providers unavailable and policy links wired later. No fabricated policies, dead reset links or local credential persistence were added.

Session loading does not flash private content. Session-read errors offer Retry. Sign-out failure retains the current session and offers another attempt. Expiry clears user-bound state and explains that unsaved changes were discarded. Confirm real expiry, account changes, provider signup verification, sign-out and return-route behavior during Clerk integration.

## Market dashboard handoff to Anjali

Supply a component to `App` with the signature `ComponentType<{ scenarioDate: string }>`. The shared shell renders its header/navigation once; the dashboard should render only its page content, with scoped styles. Keep networking/auth in the agreed service boundary. No dashboard data, charts or screen implementation was added.

## Purchase-plan integration

`PurchasePlanPage` remains independently exported from `features/purchase-plan/index.ts` and imports its own CSS. Pass `service` and explicit `scenarioDate`. `PurchasePlanService` exposes read/create/update/delete; adapters unwrap GET/POST/PUT responses as `{ plan }` and map DELETE 204 to void without parsing a body. Inputs contain only quantity_mt and purchase_deadline. General/field failures use `PlanError`.

The mock scenario is 24 October 2025; 500 MT / 15 November 2025 shows **22 days**. Dates remain YYYY-MM-DD and display in UTC. Saved days_remaining comes from the service. The merged `apiService.ts` supplies `createApiPlanService` and `fetchScenarioDate` via GET `/api/v1/config`; the preview still uses explicit fixtures. This adapter currently uses temporary caller headers and is not wired to Clerk or the app. No urgency threshold or decimal precision limit was invented.

Live 401/session handling and 404/409 recovery still need agreement with Wunna. Real persistence, ownership, user isolation and database integration are not established by these mock tests.

## Intentional visual differences

- Rae requested removal of the purchase-plan empty-state circle/plus; the top-right Create plan control remains.
- Auth hero copy describes currently available planning/market context, not a validated forecasting product. The decorative SVG is explicitly illustrative/mock data.
- Social buttons and Remember me show their unavailable status; no unsupported security badge, policy links or password-reset link appears.
- Auth screens identify the mock session instead of presenting it as real account access. Signup does not claim an unconfirmed password policy.
- Purchase plans use neutral copy, numeric days remaining, a native date picker and accessible error/focus states. Calendar input formatting follows the browser locale.
- The menu opens a modal drawer; background interaction is blocked by the native dialog and focus is trapped/restored. Navigation closes the drawer.
- On narrow layouts the auth hero is shortened and its decorative chart/badges are hidden to prioritize the form.

## Verification and resume checkpoint (26 September 2026)

- `npm test`: **28 tests passed** across 4 files (10 purchase-plan UI/mock tests, 10 merged API-adapter tests, 8 auth/shared-app tests), after incorporating the latest origin/main changes.
- `npm run build`: TypeScript and Vite production build passed. The development preview is excluded from the production entry.
- Automated coverage includes CRUD/cancel/validation/failures, auth validation and password visibility, signup/provider-field-error retry, session-load retry, duplicate-login prevention, navigation with a stable plan store, logout failure, drawer focus/Escape, expiry and private-route guards, popstate handling, unknown routes and dashboard mounting.
- No browser connection was available. Desktop/mobile visual comparison, native date picker, dialog inertness and real-browser Back/Forward remain **unverified**. jsdom provides minimal dialog method shims for interaction tests.
- No real Clerk/OAuth, emails, API requests, database persistence or two-account ownership tests were performed.

**Completed checkpoint:** shared shell/routes, sign-in/signup, Home, purchase-plan integration, demo controls and automated tests/build. Next work can begin without rebuilding these pieces: (1) visually compare at 1440x900 and 375px, (2) obtain Nelson's Clerk adapter/configuration and verification behavior, (3) supply policy destinations and configured social providers, (4) mount Anjali's dashboard when supplied, (5) connect Wunna's authenticated API adapter and verify real persistence/ownership. Recommendation and password reset stay excluded.
