# Home page — design handoff

Branch: `feature/home-page` (forked from `feature/ui-revamp-wireframe`). PRs go back into wireframe, not main.

## What's here

- `Home — buyer-html/HomeBuyer.dc.html` — the main mock. One component with a `role` prop (`buyer` | `manager`). Open it by serving the folder (`python -m http.server`), not over `file://`.
- `Home — manager-html/HomeManager.dc.html` — the same component rendered with `role="manager"`.
- `home-page-pics/` — hero photo options. These are web-sized copies (2560px long edge); the full-resolution originals are not committed. Photos in `afternoon/` are daylight shots; the rest are dusk/night.

## The design

Full-bleed harbour photo with dark gradients top and bottom. Over it:

1. Header: menu button, Bunker Buddy mark, organisation switcher, role badge, avatar initial.
2. A huge greeting, `GOOD MORNING / AFTERNOON / EVENING, JORDAN`, sized to fit one line and split into two lines when the name is long. Below it, today's date (e.g. `Wednesday 28 October`).
3. One primary button whose label and target depend on the role.
4. A Singapore MGO price card (price per MT, quote date, % change, sparkline) that links to the market dashboard.

Tokens (colours, radii, type) are in the `data-dc-design-system-vars` block at the top of the mock and match the wireframe system.

## Roles

The app has four roles (`OrganisationAccess.Role`: `BUYER, MANAGER, ANALYST, ADMIN`). The mocks only cover two.

| Role | Plan access today | Mock button | Status |
|---|---|---|---|
| Buyer | Own plans, can create/edit | "Go to your plans" → `/purchase-plans` | Designed |
| Manager | Whole organisation, approves | "Plans for approval" → `/purchase-plans` | Designed (should it open a filtered "awaiting approval" view?) |
| Analyst | Whole organisation, read-only | — | **Not designed** |
| Admin | No plan access | — | **Not designed** (today's page tells admins to use the organisation menu) |

## Open questions

- Analyst and admin: what's the primary button? Market dashboard is the obvious candidate for analysts; admins probably need a "Manage organisation" action.
- Photo: one fixed image, or swap by time of day to match the greeting? (The `afternoon/` folder suggests swapping.) Which photo is the final pick for each slot?
- Price card: the values in the mock are hard-coded. It needs a real data source (the market dashboard / forecast data) plus loading and "no quote today" states.
- Header: the mock draws its own transparent header. The app already has `frontend/src/components/AppShell.tsx`, so the home page probably needs a transparent-over-photo variant of that shell rather than a second header.
- Mobile layout: the mock is only drawn at 1440×860.

## Where the code lives

- `frontend/src/features/home/HomePage.tsx` — the current page (plain welcome text and one button). It only receives `displayName` and `canReadPlans`.
- `frontend/src/app/App.tsx` — renders `HomePage`. The user's role is available there as `planAccess.role` (`'org:buyer'`, `'org:manager'`, …) and needs to be passed down.
