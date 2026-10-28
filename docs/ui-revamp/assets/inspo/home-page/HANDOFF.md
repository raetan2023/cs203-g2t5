# Home page — design handoff

Branch: `feature/home-page` (forked from `feature/ui-revamp-wireframe`). PRs go back into wireframe, not main.

**Status (2026-10-28): implemented** in `frontend/src/features/home/` (`HomePage.tsx`, `home.css`, `marketQuote.ts`, tests in `HomePage.test.tsx`).
Preview every role locally: `npm run dev` in `frontend/`, open `/preview.html`, Demo controls → "Home - buyer / manager / analyst / admin / price unavailable".
Hero photo: `frontend/src/features/home/assets/harbour-dusk.jpg` = Kerensa Pickett on Unsplash (`kerensa-pickett--U9f2MwH73M-unsplash.jpg`, Unsplash License), resized to 2560px.

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

- **Price card:** use `GET /api/v1/market/stored` (what the live Market dashboard reads) — the `SGP_MGO_OBSERVED` series: its `ticker` (value, change, `observedDate`) and up to 60 `history` points for the sparkline. Market routes are API-key guarded, not role-guarded, so **admins can load it too**. Don't use:
  - `/api/v1/market/dashboard` — legacy: exact-date match on the old `SGP_MGO_DERIVED` proxy series, and it falls back to hard-coded mock values (USD 614.50) when nothing matches.
  - `/api/v1/forecast` — admins get a 403.
- **Fallback to the previous price is already built in.** `/stored` returns each series' most recent observations, newest first, whatever today's date is. If today has no quote, the latest entry *is* the previous available day's price. MGO quotes are sparse (not every day has one), so "previous" can be a few days back — always show the observation's own date on the card.
- **Is it refreshed daily?** `.github/workflows/import-market.yml` (on `main`) imports at 07:37 SGT every day, and only writes when the repo variable `MARKET_DAILY_IMPORT_ENABLED` is `true`. **Verified on 2026-10-28:** the variable is `true`, the scheduled runs succeeded daily from 24–28 Oct (GitHub starts them around 09:30–10:30 SGT), and the 28 Oct run applied writes. Latest `SGP_MGO_OBSERVED` quote stored: 2026-10-26 (273 rows) — i.e. on 28 Oct the card falls back to the 26 Oct price. The daily *model* job (`daily-forecasts.yml`, 08:17 SGT) publishes forecasts, not the price observations.
- **The app's date is today.** `/api/v1/config` returns the runtime Singapore date (`OperationalDate.today()`), so the greeting's date line and the rest of the app agree.

## Decisions (2026-10-28)

- Price card wording: label the price **"est."**
- Greeting date: **today's date**. The price card shows its own quote date; when there's no quote today, it shows the most recent earlier one.
- Greeting name: the user's **full name** (`displayName`, as `ClerkApp.tsx` already sets it). The mock's fit-to-width logic splits onto two lines when the name is long.
- **Role:** `HomePage` doesn't receive the role yet. `App.tsx` has it as `planAccess.role`; `ClerkApp.tsx` already builds a display label (`roleLabel`).

## Open questions

- Photo: one fixed image, or swap by time of day to match the greeting? (The `afternoon/` folder suggests swapping.) Which photo is the final pick for each slot?
- Price card: the values in the mock are hard-coded (data source: see Backend check). It still needs loading, error and "no data" states — the dashboard endpoint returns 204 when there are no tickers.
- Header: the mock draws its own transparent header. The app already has `frontend/src/components/AppShell.tsx`, so the home page probably needs a transparent-over-photo variant of that shell rather than a second header.
- Mobile layout: the mock is only drawn at 1440×860.

## Where the code lives

- `frontend/src/features/home/HomePage.tsx` — the current page (plain welcome text and one button). It only receives `displayName` and `canReadPlans`.
- `frontend/src/app/App.tsx` — renders `HomePage`. The user's role is available there as `planAccess.role` (`'org:buyer'`, `'org:manager'`, …) and needs to be passed down.
