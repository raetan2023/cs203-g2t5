# Purchase-plan frontend preview

Self-contained React + TypeScript feature for Rae's purchase-plan screens. Uses Vite and feature-scoped plain CSS. These are provisional tooling choices for Luck's handoff. No router, login, database, live API, or deployment is needed.

## Run and test while building

Requires Node.js 22.12+ (tested with 22.22.3).

```powershell
cd frontend
npm install
npm run dev
```

Open the localhost URL printed by Vite (normally http://127.0.0.1:5173). Keep the terminal running; saved source changes appear automatically. If PowerShell blocks `npm.ps1`, use `npm.cmd` in these commands. Stop with Ctrl+C.

**Demo controls** at the bottom right select empty, saved, slow loading, or load/create/edit/delete failure examples. Each selected failure happens once, so Retry/Save works on the next attempt. Enable slow requests to inspect saving/deleting. Reset example, selecting another example, toggling slow requests, or refreshing resets the in-memory store. These controls appear only in development.

Try: Create → Save → Edit → Cancel → Edit/Save → Delete/Cancel → Delete/Confirm → create again. Also try blank/zero/negative quantity, a deadline before 24 October 2025, and the same-day deadline (allowed). The example 500 MT / 15 November 2025 shows **22 days** from the configured scenario date, 24 October 2025.

```powershell
npm test
npm run build
```

Tests cover full CRUD journeys, discard/cancel behavior, validation, request failures/retries, duplicate-action prevention, focus movement/trapping, and mock contract/date calculations. Native dialog rendering, background inertness, browser date-picker appearance, responsive layout and screenshot comparison need real-browser verification. The test environment supplies only minimal dialog-method shims.

## Mount in Luck's app

```tsx
import { PurchasePlanPage } from './features/purchase-plan';

<PurchasePlanPage service={purchasePlanService} scenarioDate="2025-10-24" />
```

Copy `src/features/purchase-plan/` with its scoped stylesheet (imported by the page). Exclude `*.test.*` from the shared app if its test setup differs. Production dependencies are React and React DOM only. Icons are local SVGs; there are no UI, icon or styling packages. React 19 is used, including refs as component props.

- `PurchasePlanPage` owns load/view/form state and renders one page.
- `PurchasePlanForm` keeps its draft separate from the saved plan.
- `PurchasePlanSummary` displays returned values, including `days_remaining`.
- `DeletePlanDialog` uses a native modal dialog, safe initial focus, tab trapping and focus restoration. Pending deletion cannot be dismissed.
- `PurchasePlanService` in `types.ts` defines `read`, `create`, `update`, and `delete`. `mockService.ts` implements it using an isolated in-memory store. Fixture values live in `fixtures.ts`.
- `PlanError(detail, field_errors, status)` supports general and field-specific errors without clearing the draft. A future network adapter should convert backend errors to this type.

The page imports no preview shell. Replace `src/preview/`, `main.tsx` and the preview's global CSS with Luck's header, navigation, routing and authentication setup. Feature styles are scoped under `.purchase-plan` or prefixed `pp-`. The preview header's menu graphic is decorative; navigation remains shared-app work. The page uses a 64px shared-header allowance in its minimum height; adjust if the real shell differs.

## Later integration

Wunna's adapter will map GET/POST/PUT `/api/v1/purchase-plan` responses to `{ plan }`, and DELETE 204 to `void` without JSON parsing. Create/update receive only `quantity_mt` and `purchase_deadline`. Keep authentication and networking out of the presentation components.

The configured `scenarioDate` is explicit, including before a plan exists. GET `{ plan: null }` currently supplies no date; obtaining configuration must be agreed with Wunna. Dates stay as `YYYY-MM-DD`, display uses UTC, and numeric `days_remaining` comes from the service. No urgency thresholds or quantity decimal limit have been invented.

Shared-app integration must implement session/401 handling, 404/409 recovery and user-switch state reset (mount the page with `key={userId}` and a user-specific service). These are not established by mock tests. Live persistence, ownership and Clerk integration remain future work.

## Intentional differences from mockups

- The empty-state circle and plus illustration were removed at Rae's request to avoid suggesting a second create control.
- Create reuses the edit form with empty fields and a Save plan action.
- Neutral purchase-management copy replaces live prediction/model claims.
- Time remaining includes the numeric API value (22 days for the fixture).
- A native date picker is used; its displayed input format follows the browser locale.
- Load failure and inline field validation have no separate supplied PNG and use the same visual language.
- Delete failure offers retry without mentioning a nonexistent support route.
- Focus indicators and readable disabled states support keyboard use.
- A separate development toolbar allows repeatable state testing.

Luck's current mockups were confirmed reviewed by Rae. Visual comparison at 1440 × 900 and a narrow viewport remains a manual check if no connected browser is available.

## Verification recorded 26 September 2026

- `npm test`: 2 test files, **10 tests passed**.
- `npm run build`: TypeScript checks and Vite production build passed.
- Local preview HTML and transformed entry module returned HTTP 200.
- No connected browser was available in this session. Desktop/mobile screenshots, native date picker, native modal inertness and visual comparison have **not** been verified.
- All results use mock data; live API, database persistence and authentication were not tested.
