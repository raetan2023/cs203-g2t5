# Bunker Buddy — dark-and-beige design system

Extracted 2026-10-24 from `frontend/src/prototypes/wireframe/wireframe.css`
and its inherited `../oris/oris.css`. This is a source-based specification, not a
completed browser audit. Application code was not changed for this extraction.
Read alongside `frontend/AGENTS.md` and `docs/frontend-design-guidelines.md`.

## Semantic colours

Names below describe the current shared palette, revised to light beige as requested.
The original prototype remains a reference; production shared tokens now live in frontend/src/styles/tokens.css.

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | `#0c0d0e` | Page background |
| `surface` | `#1a1b1c` | Cards |
| `surface-input` | `#121314` | Inputs |
| `text-primary` | `#f0e6d2` | Main text |
| `text-secondary` | `#b5ac9b` | Subtitles, dividers |
| `text-supporting` | `#c5bba7` | Intro description |
| `text-label` | `#e4d8c0` | Input labels |
| `text-placeholder` | `#b6ac99` | Placeholders, auxiliary controls |
| `border-subtle` | `#e8dcc426` | Cards and dividers |
| `border-control` | `#e8dcc466` | Input outlines; 40% beige; contrast-preserving implementation choice |
| `action-primary` / `action-hover` | `#e8dcc4` / `#f4e8d1` | Primary button |
| `text-on-action` | `#171818` | Primary button text |
| `focus` | `#f4e8d1` | Focus ring and focused input border |
| `error-text` / `error-surface` | `#efb9af` / `#382b29` | Inline error / alert surface |
| `error-border` / `error-alert-text` | `#e3b3a9` / `#f2d9d2` | Invalid input / alert text |

The theme is predominantly neutral, not strictly colourless: errors retain muted
warm colour. Provider hover uses beige at approximately 7% opacity. No success,
warning or financial-series palette has been established; do not invent one as
an allegedly approved token. Validate actual composited contrast before rollout.

### Pending tokens (names reserved, values not decided)

These are placeholders for the revamp. Do not give them values in code until the
owning phase decides them (see `docs/UI_REVAMP_PLAN.md` §4.1 and §6).

| Token | Decided in | Notes |
| --- | --- | --- |
| `price-up` / `price-up-surface`, `price-down` / `price-down-surface`, `price-flat` | Phase 5 (recommendations) | Direction, not good/bad: a rise is unfavourable for a fuel buyer. Always paired with a sign, arrow or word |
| `success-text` / `success-surface` | Phase 4 (purchase plans) | May stay neutral text plus a check icon |
| `warning-text` / `warning-surface` | Phase 5 | Stale/unavailable data; must differ from error by more than hue |
| `chart-grid`, `chart-axis`, `chart-series-1..n`, `chart-forecast`, `chart-band` | Phase 6 (dashboard) | Solid actual vs dashed forecast; confidence bands subdued and labelled |

### Contrast check — final beige revision (2026-10-26)

Computed from current token values using WCAG relative luminance, compositing alpha borders
on each surface. These replace earlier white-palette figures.

| Pair | canvas | surface | input | Result |
| --- | --- | --- | --- | --- |
| `text-primary` | 15.7 | 13.9 | 15.0 | pass |
| `text-secondary` | 8.7 | 7.7 | 8.3 | pass |
| `text-supporting` | 10.2 | 9.1 | 9.8 | pass |
| `text-label` | 13.8 | 12.2 | 13.2 | pass |
| `text-placeholder` | 8.7 | 7.7 | 8.3 | pass |
| `error-text` | 11.3 | 10.0 | 10.8 | pass |
| `error-alert-text` on `error-surface` | n/a | n/a | 10.1 | pass |
| `text-on-action` on `action-primary` | n/a | n/a | 13.1 | pass |
| `focus` | 16.0 | 14.2 | 15.3 | pass |
| `border-control` (`#e8dcc466`) | 3.1 | 3.1 | 3.1 | pass |

Owner requested light beige instead of white. Implementer selected exact beige values.
The earlier approved 35% white border became 40% beige to retain at least 3:1 contrast;
35% beige gives only about 2.6–2.7:1. Subtle borders are decorative separators,
not control outlines. The header date chip now uses 12px text.
## Typography, spacing and shape

- Family: `'Segoe UI', 'Helvetica Neue', Arial, sans-serif`; no downloaded font.
- Body: 15px / 1.5, weight 400. Intro description: 15–19px / 1.7.
- Desktop hero: `clamp(38px, min(5.2vw, 7svh), 76px)`, weight 300,
  line-height 1.09, tracking −0.045em. Mobile: 39–55px, down to 35px at 360px.
- Card title: 31px / 1.25, weight 400, tracking −0.7px. Brand: 20–23px / 500.
- Subtitle and primary action: 14px; labels/social buttons: 13px;
  account switch/errors: 12px; divider/preview note: 11px. Action weight: 600.
- Common spacing: 8, 12, 16, 20, 24, 28, 32px, with optical exceptions
  such as 14, 18 and 34px. Prefer this shared scale in future; do not mechanically
  preserve every one-off margin. Card padding: 24–40px depending on viewport.
- Radius: cards 10px; buttons/inputs/alerts 5px; password control 4px;
  circular brand mark. Borders: 1px. Card shadow: `0 16px 60px #00000026`.

## Components and layout

Phase 2 decisions (2026-10-26): retain the existing menu-button/modal sidebar on desktop;
no persistent rail. Desktop is the delivery and review target; no separate mobile redesign
or mobile acceptance gate is required. Retain existing responsive behavior where practical.
Shared page container: `--bb-page-max: 1440px`, `--bb-page-pad: clamp(16px, 3vw, 40px)`;
implementation defaults for a centered content area. Modal backdrop uses
`--bb-backdrop: #000000b8` (neutral 72% black). Shared loading indicators stay static,
with their existing status text, consistent with motion being reserved for authentication.
Implemented-token reference: `frontend/DESIGN.md` (maintained from source).

- **Primary button:** full-width in login, minimum 50px high, 13px 20px padding,
  light beige fill/dark text, 150ms background transition. Social buttons: minimum
  46px, subtle border and translucent fill. Pending controls use opacity .65.
- **Inputs:** 48px high, 12px 14px padding, 15px text (16px on mobile), visible
  label, explicit invalid state. Password toggle remains a 44px control.
- **Cards:** charcoal surface, restrained outline/shadow. Login column is
  370–450px wide. Preserve content and form behavior; do not copy mock auth into production.
- **Navigation:** login demonstrates only the brand and underlined account-switch
  control. Proposed extension: retain existing header/sidebar structure and
  `aria-current`; use a neutral surface highlight plus emphasis for the active item.
  Do not add navigation to login or claim a full navigation design is approved.
- **Responsive:** desktop keeps copy/ship left and form right; stacked below 761px.
  Ship stays in normal flow below copy. Root border-box includes page padding;
  ship and spacing adapt to viewport height. Aim for one desktop frame, but allow
  scrolling for short screens, zoom, validation and mobile rather than clipping controls.

## Motion and accessibility

The ship draws once over about five seconds: outline, hull, cargo/deck, bridge,
then a soft 1.25-second sweep. No looping, node dots, camera drift or moving text.
Reduced motion immediately displays the finished mesh and suppresses the sweep
and transitions. Decorative SVG is hidden from assistive technology.

Retain semantic labels, keyboard order, password-toggle naming, pending/error
announcements and success focus. Use a 2px focus ring with 4px offset. Do not
remove production skip links, dialog behavior or loading feedback. The prototype's
small helper text and subtle borders need browser contrast/readability review.

## Financial charts and tables — proposed extension

- Reuse data, calculations, units, date formatting, sorting and responsive containers.
  Do not alter financial meaning to achieve visual consistency.
- Use neutral surfaces, primary text for values, secondary text for axes and
  subtle grid lines. Keep chart labels readable; avoid decorative gradients/glow.
- Distinguish actual/forecast series with solid/dashed strokes and explicit legend
  labels; confidence ranges need labelled, subdued fills. Never rely on grey shade alone.
- Preserve positive/negative and observed/estimated semantics with signs, labels
  or icons. Any retained financial colours are semantic exceptions, not brand accents;
  do not assume a price increase is good for a fuel purchaser.
- Preserve accessible data tables/tooltips and missing/stale/error states. No ship
  build animation on financial data; avoid animation that suggests invented price movement.
- Tables: reuse tabular numerals, align numeric columns right, keep units and
  consistent precision, subtle row dividers, clear headers, and horizontal overflow
  on narrow screens. Do not shrink dense table text to the login's 11px helper size.

## Existing CSS: reuse versus eventual replacement

Paths below are relative to `frontend/src/`.

| File | Reuse | Eventually replace or consolidate |
| --- | --- | --- |
| `app/app.css` | Header/sidebar layout, skip link, focus pattern, disabled states, responsive rules | Navy/teal literals, glowing primary button, 8px control radii, Inter-first typography; centralize tokens |
| `features/auth/auth.css` | Labels, 48px inputs, password positioning, errors, responsive form mechanics | White/mint card and fields, teal halo, 16px radius, heavier title style; account for Clerk-owned UI separately |
| `features/purchase-plan/purchase-plan.css` | Scoped variables, form grids, unit adornments, dialogs, responsive and reduced-motion handling | Map `--pp-*` to semantic tokens; replace teal/navy literals, 16px cards and 8px controls; review focus suppression/date-icon filter |
| `features/recommendations/recommendations.css` | Definition-list grids, disclosure, skeleton/empty/error states, numeric formatting | Hard-coded teal/navy surfaces and highlights, 16px cards, inconsistent focus colour |
| `features/market-dashboard/stored-market.css` | `--sm-*` approach, tabular numerals, table overflow, chart containers, responsive states | Teal gradient decoration, 12/14px card radii, scattered literals and unusually small labels |
| `features/market-dashboard/dashboard.css` | Semantic positive/negative concepts and useful layout rules where still imported | Global tokens/selectors, separate font stack and teal theme; confirm active import usage before migrating or deleting |
| `features/market-dashboard/brent-market.css` | Table structure, disclosure and responsive panel layout | Separate slate palette, 16px panel radius, literal alert colour |

CSS alone is insufficient: `MGOChart.jsx` and `StoredMarketPanel.jsx` hard-code
chart strokes, tick colours, fills and tooltip styling. Theme those presentation
values later without touching data logic. Keep `preview/preview.css` tooling separate.
The wireframe currently inherits Oris CSS: extract shared tokens deliberately
rather than importing prototype global `body` styles into the application.

## Handover / stopping point

- Branch: `feature/ui-revamp-wireframe`. Visual iterations and this specification
  are checkpointed together; check `git status` for later edits before handover.
- Preview: from `frontend`, run `npx vite --config vite.wireframe.config.ts`,
  then open `http://127.0.0.1:5175/wireframe.html`. Restart if the local server stops.
- Reference entry: `src/prototypes/wireframe/main.tsx`; it shares the form in
  `src/prototypes/oris/OrisLogin.tsx`. Production authentication is not integrated.
- Prior checks: six form tests and TypeScript passed before the latest sizing-only
  changes; the latest sizing build passed. Browser screenshots, viewport fit,
  contrast and reduced-motion playback remain unverified.
- Next step: capture desktop/mobile screenshots and approve this specification,
  then migrate shared tokens, shell/controls, feature surfaces, and finally chart
  presentation values. Preserve routes, component ownership and user flows.
- Give Claude this file, `frontend/AGENTS.md`, the linked design guidelines, and
  the current working tree. Ask it to read these explicitly rather than assume
  it auto-loads `AGENTS.md`. No further implementation is authorized by this document.

Optional tooling: browser automation for visual verification; Figma MCP for design
comparison; an interface-review skill for accessibility. [Graphify](https://graphiffy.com/docs)
offers a code graph and [MCP queries](https://graphiffy.com/mcp), useful for dependency
and impact discovery, not aesthetic judgement. If trying it, scope indexing to
`frontend` first and verify results against source. No plugin was installed here.

## Sign-in and sign-up pages (2026-10-27)

- Light card on these pages only: `--bb-auth-*` tokens (card `#f5efe3`, ink `#17140f`, label `#5f574b`, underline
  `#8c826f` at 3.3:1, placeholder `#6f6556` at 5.0:1, error `#9b2c1a`). The design export's `#b9ae99` / `#857b6a` were
  darkened for contrast.
- Typeface exception: Geist (Google Fonts) on `.auth-content` only; the app keeps the system font.
- The dusk scene (`ReactiveShip.tsx`) carries its own illustration colours (sky, sea, hull greys, `#eadfc9` lights).
  They are artwork, not UI tokens, and must not be reused in UI.

