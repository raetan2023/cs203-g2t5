# Implemented design tokens

Human-approved authority: [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md).
Values live in `src/styles/tokens.css`; `src/styles/theme.ts` mirrors colours for
JavaScript consumers (`colors`, plus `chart` for Recharts props) and `theme.test.ts` verifies that mirror.

- Dark canvas, charcoal surfaces, warm light beige text and primary actions.
- System font: Segoe UI, Helvetica Neue, Arial, sans-serif.
- Type scale (2026-11-04): `--bb-text-xs` 12 · `sm` 13 · `md` 14 (body) · `lg` 15 (inputs) · `xl` 16 · `2xl` 18 · `3xl` 20 (h2, brand) · `4xl` 24 · `5xl` 28 · `6xl` 32 (page h1, key figures) · `7xl` 40. 12px is the floor; no stylesheet sets a size outside the scale.
- Card radius: 10px; control radius: 5px; pill: `--bb-radius-pill`; circular brand mark.
- Focus: 2px outline with 4px offset. Control borders: 40% beige to preserve contrast.
- Spacing scale: 4, 8, 12, 16, 20, 24, 28, 32 and 40px.
- Shared content max-width: 1440px; horizontal padding: clamp(16px, 3vw, 40px). The market dashboard uses the same container.
- Warnings (`--bb-warning-*`) mark stale, unavailable or unverified data; errors (`--bb-error-*`) mark failed actions and invalid input.
- Price direction (provisional, 2026-11-04): `--bb-price-up` #f2849e is dearer, `--bb-price-down` #8fd3a4 is cheaper, `--bb-price-flat` is the secondary text tone. Each exceeds 7:1 on every surface and is always paired with an arrow, sign or word. Day 4's dataviz pass may revise the values; the names stay.
- Chart presentation (provisional aliases): grid = subtle border, axis = secondary text, series 1 = action beige, cursor = control border. Recharts reads them from `theme.ts` `chart` because SVG attributes do not resolve CSS variables.
- Desktop menu-button navigation opens the existing modal sidebar. No persistent rail.
- Desktop review is required; a separate mobile redesign is out of scope.
- Shared loading indicators are static; retain their status announcements.
- Still pending: `success-*` (Phase 4) and `price-*-surface` (Phase 5).

Stylesheets on the token set as of 2026-11-04: `app.css`, `base.css`, `home.css`, `purchase-plan.css`, `recommendations.css`,
`auth.css`, `stored-market.css`, `brent-market.css`. Still carrying literal colours: `forecast.css` (Day 4) and `organisation.css`.
The unused `market-dashboard/dashboard.css` was deleted rather than migrated.

This reference is maintained directly from source. Keep it aligned with the authority above.
