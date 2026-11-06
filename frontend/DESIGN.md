# Implemented design tokens

Human-approved authority: [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md).
Values live in `src/styles/tokens.css`; `src/styles/theme.ts` mirrors colours for
JavaScript consumers (`colors`, plus `chart` for Recharts props) and `theme.test.ts` verifies that mirror.

- Dark and beige with warm neutrals. There is no separate accent colour: cream is the primary action, the focus ring and chart series 1.
- Typeface: IBM Plex Sans, self-hosted through `@fontsource/ibm-plex-sans` (weights 400, 500, 600) and imported in `base.css`. Digits are all one width by default, so columns line up. The font is set on `body`, so pages outside `.bb-app` inherit it.
- Type roles, used with `font:`: `--bb-type-display` 40/44, `figure-lg` 32/38, `title` and `figure` 24/30, `heading` 16/24 (all 600), `lead` 16/24 and `body` 14/21 (400), `body-strong` 14/21 (600), `label` 12/16 (500). Sizes are `--bb-text-xs` 12, `md` 14, `xl` 16, `4xl` 24, `6xl` 32, `7xl` 40. 12px is the floor. Headings get their roles from `base.css` at zero specificity, so a page rule always wins.
- Text tiers: `--bb-text` for answers, headings, values and form field labels. `--bb-text-secondary` for body copy. `--bb-text-tertiary` for captions, dates, units and placeholders (not on `--bb-surface-overlay`). `--bb-text-disabled` for disabled text only. No tier is for cream: use `--bb-text-on-action` there.
- Surfaces: `--bb-canvas`, `--bb-surface` (panels), `--bb-surface-input` (inputs), `--bb-surface-overlay` (menus, dialogs, selected segment).
- Cards: only for the answer, the panel holding the main action, and list items you open. Everything else sits on the canvas, grouped by spacing and headings.
- Borders: `--bb-border-subtle` for dividers and cards, `--bb-border-control` for inputs and secondary buttons (at least 3:1).
- Radius: cards 12px, controls 6px, `--bb-radius-pill`, circular brand mark.
- Buttons: 44px tall. Primary is a cream fill, secondary a transparent outline.
- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 48, 64 (`--bb-space-1` to `-6`, `-8`, `-12`, `-16`). 48 separates page sections. Values under 4 are hairline adjustments.
- Status: `--bb-success-*` for Approved, Purchased, Buy now. `--bb-warning-*` for Due soon, Monitor, stale data. `--bb-error-*` for Overdue, Rejected, errors. `--bb-info-*` for Wait and neutral notices. `--bb-neutral-surface` with secondary text for On track, Draft, Awaiting approval and Withdrawn, so colour only marks what needs attention. Chips have no border: status text on its surface, at 12px.
- Price direction: `--bb-price-up` is dearer and shares the danger colour, `--bb-price-down` is cheaper and shares the success colour, so green and red mean good or bad for the buyer. Never colour alone: always pair with an arrow, sign or word.
- Chart presentation: grid = subtle border, axis = secondary text, series 1 = action beige, cursor = control border. Recharts reads them from `theme.ts` because SVG attributes do not resolve CSS variables.
- Navigation: top bar on every page, no sidebar.
- Shared content max-width: 1440px; horizontal padding: clamp(16px, 3vw, 40px).
- Shared loading indicators are static; retain their status announcements.

Exceptions: Home keeps its own sizes and spacing for now, and the sign-in headline keeps its large size. Sign-in and organisation still have literal spacing, because neither is covered by the screens checked in preview.

This reference is maintained directly from source. Keep it aligned with the authority above.
