/**
 * JS mirror of the colour tokens for consumers that cannot read CSS variables
 * (Clerk `appearance`, Recharts SVG props). tokens.css is the source of truth;
 * theme.test.ts fails if a value here drifts from it. Add further exports (chartTheme,
 * Phase 6) built from `colors`, as clerkAppearance is.
 */
export const colors = {
  canvas: '#0c0d0e',
  surface: '#1a1b1c',
  surfaceInput: '#121314',
  surfaceHover: '#e8dcc412',
  text: '#f0e6d2',
  textSecondary: '#b5ac9b',
  textSupporting: '#c5bba7',
  textLabel: '#e4d8c0',
  textPlaceholder: '#b6ac99',
  borderSubtle: '#e8dcc426',
  borderControl: '#e8dcc466',
  backdrop: '#000000b8',
  action: '#e8dcc4',
  actionHover: '#f4e8d1',
  textOnAction: '#171818',
  focus: '#f4e8d1',
  errorText: '#efb9af',
  errorSurface: '#382b29',
  errorBorder: '#e3b3a9',
  errorAlertText: '#f2d9d2',
  authCard: '#0c0d0e',
  authInk: '#f0e6d2',
  authLabel: '#e6dcc8',
  authMuted: '#b5ac9b',
  authField: '#151617',
  authLine: '#6b665c',
  authPlaceholder: '#9a9282',
  authAccent: '#eadfc9',
  authAccentHover: '#f4ecdc',
  authOnAccent: '#0c0d0e',
  authError: '#efb9af',
  authHeroText: '#f4ecdc',
  authHeroSub: '#e0d6c3',
  authHeroFallback: '#050607',
} as const;

/** Anchor mark for the Clerk form header (replaces the dashboard logo): dark anchor in a beige circle. */
const anchorMark = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"><circle cx="22" cy="22" r="22" fill="${colors.authAccent}"/><g transform="translate(11 11)" fill="none" stroke="${colors.authOnAccent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="5" r="2.75"/><path d="M11 20V7.75M4.6 11H1.8a9.2 9.2 0 0 0 18.4 0h-2.8"/></g></svg>`)}`;

/** Clerk sign-in/sign-up theme: the card-less dark form of the ship-video design (bordered dark fields, beige button). */
export const clerkAppearance = {
  options: { logoImageUrl: anchorMark, logoPlacement: 'inside' as const },
  variables: {
    colorPrimary: colors.authAccent,
    colorPrimaryForeground: colors.authOnAccent,
    colorBackground: colors.authCard,
    colorForeground: colors.authInk,
    colorMutedForeground: colors.authMuted,
    colorMuted: colors.authField,
    colorInput: colors.authField,
    colorInputForeground: colors.authInk,
    colorBorder: colors.authLine,
    colorNeutral: colors.authInk,
    colorDanger: colors.authError,
    colorRing: colors.authAccent,
    fontFamily: "'Geist', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    borderRadius: '8px',
  },
  elements: {
    rootBox: { width: '100%' },
    // No card: the form sits straight on the page.
    cardBox: { width: '100%', border: 'none', borderRadius: 0, boxShadow: 'none', background: 'transparent' },
    card: { padding: '0', boxShadow: 'none', border: 'none', background: 'transparent', gap: '28px' },
    logoBox: { justifyContent: 'center', height: '44px' },
    logoImage: { width: '44px', height: '44px' },
    headerTitle: { fontSize: '28px', fontWeight: 600, lineHeight: '34px', letterSpacing: '-.02em', color: colors.authInk },
    headerSubtitle: { fontSize: '14px', color: colors.authMuted },
    socialButtonsBlockButton: { minHeight: '46px', borderRadius: '8px', border: `1px solid ${colors.authLine}`, boxShadow: 'none', background: 'transparent',
      color: colors.authInk, fontWeight: 500, '&:hover': { background: colors.authField } },
    socialButtonsIconButton: { minHeight: '46px', borderRadius: '8px', border: `1px solid ${colors.authLine}`, boxShadow: 'none', background: 'transparent',
      '&:hover': { background: colors.authField } },
    dividerLine: { background: colors.authLine, opacity: .6 },
    dividerText: { color: colors.authMuted },
    formFieldLabel: { fontSize: '13px', fontWeight: 500, color: colors.authLabel },
    // Bordered dark field; the border and focus ring are forced in auth.css because Clerk re-applies its own shadow.
    formFieldInput: { height: '46px', fontSize: '15px', padding: '0 14px', background: colors.authField, borderRadius: '8px', outline: 'none' },
    // Flat beige button: Clerk's default gradient sheen and shadow removed.
    formButtonPrimary: { minHeight: '48px', borderRadius: '8px', fontSize: '15px', fontWeight: 600, boxShadow: 'none', backgroundImage: 'none',
      color: colors.authOnAccent, '&::after': { display: 'none' }, '&:hover': { backgroundColor: colors.authAccentHover, boxShadow: 'none' } },
    footer: { background: 'transparent' },
    footerActionText: { color: colors.authMuted },
    footerActionLink: { color: colors.authAccent, fontWeight: 500, textUnderlineOffset: '3px' },
    formFieldAction: { color: colors.authAccent },
    identityPreviewEditButton: { color: colors.authAccent },
  },
};

/** Maps each `colors` key to its CSS custom property. */
export const cssVar = (key: keyof typeof colors) =>
  `--bb-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;
