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
  authCard: '#f5efe3',
  authInk: '#17140f',
  authInkHover: '#2b261f',
  authLabel: '#5f574b',
  authLine: '#8c826f',
  authPlaceholder: '#6f6556',
  authSoft: '#ebe3d3',
  authSoftHover: '#e1d7c4',
  authError: '#9b2c1a',
} as const;

/** Anchor mark for the Clerk card header (replaces the dashboard logo): cream anchor in an ink circle. */
const anchorMark = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"><circle cx="22" cy="22" r="22" fill="${colors.authInk}"/><g transform="translate(11 11)" fill="none" stroke="${colors.authCard}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="5" r="2.75"/><path d="M11 20V7.75M4.6 11H1.8a9.2 9.2 0 0 0 18.4 0h-2.8"/></g></svg>`)}`;

/** Clerk sign-in/sign-up theme: the cream card of the reactive-ship design (underline fields, pill buttons). */
export const clerkAppearance = {
  options: { logoImageUrl: anchorMark, logoPlacement: 'inside' as const },
  variables: {
    colorPrimary: colors.authInk,
    colorPrimaryForeground: colors.authCard,
    colorBackground: colors.authCard,
    colorForeground: colors.authInk,
    colorMutedForeground: colors.authLabel,
    colorMuted: colors.authSoft,
    colorInput: 'transparent',
    colorInputForeground: colors.authInk,
    colorBorder: colors.authLine,
    colorNeutral: colors.authInk,
    colorDanger: colors.authError,
    colorRing: colors.authInk,
    fontFamily: "'Geist', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    borderRadius: '12px',
  },
  elements: {
    rootBox: { width: '100%' },
    cardBox: { width: '100%', border: 'none', borderRadius: '20px', boxShadow: '0 30px 80px rgb(0 0 0 / .55)' },
    card: { padding: '40px 36px 28px', boxShadow: 'none', border: 'none', background: colors.authCard },
    logoBox: { justifyContent: 'center', height: '44px' },
    logoImage: { width: '44px', height: '44px' },
    headerTitle: { fontSize: '28px', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-.01em' },
    headerSubtitle: { fontSize: '14px', color: colors.authLabel },
    socialButtonsBlockButton: { minHeight: '48px', borderRadius: '24px', border: 'none', boxShadow: 'none', background: colors.authSoft, color: colors.authInk,
      fontWeight: 600, '&:hover': { background: colors.authSoftHover } },
    dividerLine: { background: colors.authLine, opacity: .45 },
    formFieldLabel: { fontSize: '12px', fontWeight: 600, color: colors.authLabel },
    // Underline fields, as in the design.
    formFieldInput: { minHeight: '44px', fontSize: '17px', padding: '8px 0', background: 'transparent', border: 'none', borderRadius: 0,
      boxShadow: `inset 0 -1.5px 0 0 ${colors.authLine}`, outline: 'none',
      // Focus = a heavier ink underline (the design's focus state), replacing Clerk's ring.
      '&:focus, &:focus-visible, &:hover:focus': { boxShadow: `inset 0 -2px 0 0 ${colors.authInk}`, outline: 'none', borderColor: 'transparent' } },
    // Flat pill: Clerk's default gradient sheen and shadow removed.
    formButtonPrimary: { minHeight: '52px', borderRadius: '26px', fontSize: '15px', fontWeight: 600, boxShadow: 'none', backgroundImage: 'none',
      '&::after': { display: 'none' }, '&:hover': { backgroundColor: colors.authInkHover, boxShadow: 'none' } },
    footer: { background: colors.authCard },
    footerActionText: { color: colors.authLabel },
    footerActionLink: { color: colors.authInk, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px' },
  },
};

/** Maps each `colors` key to its CSS custom property. */
export const cssVar = (key: keyof typeof colors) =>
  `--bb-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;
