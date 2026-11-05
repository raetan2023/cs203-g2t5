/**
 * JS mirror of the colour tokens for consumers that cannot read CSS variables
 * (Clerk `appearance`, Recharts SVG props). tokens.css is the source of truth;
 * theme.test.ts fails if a value here drifts from it. Add further exports (chartTheme,
 * Phase 6) built from `colors`, as clerkAppearance is.
 */
export const colors = {
  canvas: '#0d0c0b',
  surface: '#1a1918',
  surfaceInput: '#242220',
  surfaceHover: '#e8dcc412',
  text: '#f0e6d2',
  textSecondary: '#b5ac9b',
  textTertiary: '#958e7e',
  textDisabled: '#6b665c',
  borderSubtle: '#3a3631',
  borderControl: '#756e65',
  backdrop: '#000000b8',
  action: '#e8dcc4',
  actionHover: '#f4e8d1',
  textOnAction: '#171818',
  focus: '#f4e8d1',
  errorText: '#ee8c7c',
  errorSurface: '#382926',
  errorBorder: '#ee8c7c',
  errorAlertText: '#f2d9d2',
  authHeroText: '#f4ecdc',
  authHeroSub: '#e0d6c3',
  authHeroFallback: '#050607',
  priceUp: '#ee8c7c',
  priceDown: '#9ec48a',
  priceFlat: '#b5ac9b',
} as const;

/** Chart presentation values for Recharts props (SVG attributes cannot read CSS variables reliably). Mirrors the --bb-chart-* aliases. */
export const chart = {
  grid: colors.borderSubtle,
  axis: colors.textSecondary,
  series1: colors.action,
  cursor: colors.borderControl,
  dotRing: colors.surface,
} as const;

/**
 * Clerk sign-in/sign-up theme: the card-less dark form of the ship-video design (bordered dark fields, beige button).
 * Clerk's own logo is hidden; ClerkAuthPage renders the app's BrandMark above the form instead.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: colors.action,
    colorPrimaryForeground: colors.textOnAction,
    colorBackground: colors.canvas,
    colorForeground: colors.text,
    colorMutedForeground: colors.textSecondary,
    colorMuted: colors.surfaceInput,
    colorInput: colors.surfaceInput,
    colorInputForeground: colors.text,
    colorBorder: colors.borderControl,
    colorNeutral: colors.text,
    colorDanger: colors.errorText,
    colorRing: colors.action,
    fontFamily: "'IBM Plex Sans', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    borderRadius: '8px',
  },
  elements: {
    rootBox: { width: '100%' },
    // No card: the form sits straight on the page.
    cardBox: { width: '100%', border: 'none', borderRadius: 0, boxShadow: 'none', background: 'transparent' },
    card: { padding: '0', boxShadow: 'none', border: 'none', background: 'transparent', gap: '28px' },
    logoBox: { display: 'none' },
    headerTitle: { fontSize: '24px', fontWeight: 600, lineHeight: '30px', color: colors.text },
    headerSubtitle: { fontSize: '14px', color: colors.textSecondary },
    socialButtonsBlockButton: { minHeight: '46px', borderRadius: '8px', border: `1px solid ${colors.borderControl}`, boxShadow: 'none', background: 'transparent',
      color: colors.text, fontWeight: 500, '&:hover': { background: colors.surfaceInput } },
    socialButtonsIconButton: { minHeight: '46px', borderRadius: '8px', border: `1px solid ${colors.borderControl}`, boxShadow: 'none', background: 'transparent',
      '&:hover': { background: colors.surfaceInput } },
    dividerLine: { background: colors.borderControl, opacity: .6 },
    dividerText: { color: colors.textSecondary },
    formFieldLabel: { fontSize: '12px', fontWeight: 500, color: colors.text },
    // Bordered dark field; the border and focus ring are forced in auth.css because Clerk re-applies its own shadow.
    formFieldInput: { height: '46px', fontSize: '14px', padding: '0 14px', background: colors.surfaceInput, borderRadius: '8px', outline: 'none' },
    // Flat beige button: Clerk's default gradient sheen and shadow removed.
    formButtonPrimary: { minHeight: '48px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, boxShadow: 'none', backgroundImage: 'none',
      color: colors.textOnAction, '&::after': { display: 'none' }, '&:hover': { backgroundColor: colors.actionHover, boxShadow: 'none' } },
    footer: { background: 'transparent' },
    footerActionText: { color: colors.textSecondary },
    footerActionLink: { color: colors.action, fontWeight: 500, textUnderlineOffset: '3px' },
    formFieldAction: { color: colors.action },
    identityPreviewEditButton: { color: colors.action },
  },
};

/** Maps each `colors` key to its CSS custom property. */
export const cssVar = (key: keyof typeof colors) =>
  `--bb-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;
