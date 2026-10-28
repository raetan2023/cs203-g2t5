# Home page — design handoff

Branch: `feature/home-page` (forked from `feature/ui-revamp-wireframe`). PRs go back into wireframe, not main.

## What's here

- `Home — buyer-html/HomeBuyer.dc.html` — the main mock. One component with a `role` prop (`buyer` | `manager`). Open it by serving the folder (`python -m http.server`), not over `file://`.
- `Home — manager-html/HomeManager.dc.html` — the same component rendered with `role="manager"`.
- `Home — analyst-html/HomeAnalyst.dc.html` and `Home — admin-html/HomeAdmin.dc.html` — the same component with `role="analyst"` / `role="admin"`. **Their bundled `HomeBuyer.dc.html` is the latest version** (all four roles, per-role button link); the copies in the buyer and manager folders are older.
- `home-page-pics/` — hero photo options. These are web-sized copies (2560px long edge); the full-resolution originals are not committed. Photos in `afternoon/` are daylight shots; the rest are dusk/night.

## The design

Full-bleed harbour photo with dark gradients top and bottom. Over it:

1. Header: menu button, Bunker Buddy mark, organisation switcher, role badge, avatar initial.
2. A huge greeting, `GOOD MORNING / AFTERNOON / EVENING, JORDAN`, sized to fit one line and split into two lines when the name is long. Below it, today's date (e.g. `Wednesday 28 October`).
3. One primary button whose label and target depend on the role.
4. A Singapore MGO price card (price per MT, quote date, % change, sparkline) that links to the market dashboard.

Tokens (colours, radii, type) are in the `data-dc-design-system-vars` block at the top of the mock and match the wireframe system.

## Roles

The app has four roles (`OrganisationAccess.Role`: `BUYER, MANAGER, ANALYST, ADMIN`). All four are designed; only the button changes.

| Role | Plan access today | Button | Where it goes in the app |
|---|---|---|---|
| Buyer | Own plans, can create/edit | "Go to your plans" | `/purchase-plans` |
| Manager | Whole organisation, approves | "Plans for approval" | `/purchase-plans` — the Approval inbox (`ApprovalInbox.tsx`) already renders there for managers. Add an anchor id to the inbox and link to it; there is no separate approvals page. |
| Analyst | Whole organisation, read-only | "Market dashboard" | `/market-dashboard` (already routed) |
| Admin | No plan access | "Manage organisation" | Clerk's organisation profile (members, invites, roles) — call Clerk's `openOrganizationProfile()`. Our backend has no member endpoints and doesn't need any. |

## Backend check (2026-10-28)

Everything in the four designs can be built on the current backend. No new endpoints needed.

- **Price card:** use `GET /api/v1/market/dashboard` — the `SGP_MGO_DERIVED` ticker (value, `changePct`, `observedDate`) and its `chartSeries` points for the sparkline. Market routes are API-key guarded, not role-guarded, so **admins can load it too**. Don't use `/api/v1/forecast` for this: admins get a 403 there.
- **Price card caveats:** the series is labelled "Singapore MGO (derived est.)" — it's an estimate from the gasoil proxy, so the card should say "est." rather than "quote". Its date is the app's scenario date (a 2025 demo date), not today, while the greeting shows today's date.
- **Greeting name:** `ClerkApp.tsx` sets `displayName` to the full name first, so the greeting would read "GOOD EVENING, JORDAN LEE". The mock uses the first name only; add a `firstName` to `SessionUser`.
- **Role:** `HomePage` doesn't receive the role yet. `App.tsx` has it as `planAccess.role`; `ClerkApp.tsx` already builds a display label (`roleLabel`).

## Open questions

- Photo: one fixed image, or swap by time of day to match the greeting? (The `afternoon/` folder suggests swapping.) Which photo is the final pick for each slot?
- Price card: the values in the mock are hard-coded (data source: see Backend check). It still needs loading, error and "no data" states — the dashboard endpoint returns 204 when there are no tickers.
- Header: the mock draws its own transparent header. The app already has `frontend/src/components/AppShell.tsx`, so the home page probably needs a transparent-over-photo variant of that shell rather than a second header.
- Mobile layout: the mock is only drawn at 1440×860.

## Where the code lives

- `frontend/src/features/home/HomePage.tsx` — the current page (plain welcome text and one button). It only receives `displayName` and `canReadPlans`.
- `frontend/src/app/App.tsx` — renders `HomePage`. The user's role is available there as `planAccess.role` (`'org:buyer'`, `'org:manager'`, …) and needs to be passed down.
