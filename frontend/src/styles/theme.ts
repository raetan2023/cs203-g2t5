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
} as const;

/** Clerk sign-in/sign-up theme; mirrors the wireframe login card (beige on near-black). */
export const clerkAppearance = {
  variables: {
    colorPrimary: colors.action,
    colorPrimaryForeground: colors.textOnAction,
    colorBackground: colors.surface,
    colorForeground: colors.text,
    colorMutedForeground: colors.textSecondary,
    colorMuted: colors.surfaceInput,
    colorInput: colors.surfaceInput,
    colorInputForeground: colors.text,
    colorBorder: colors.borderControl,
    colorNeutral: colors.text,
    colorDanger: colors.errorText,
    colorRing: colors.focus,
    colorModalBackdrop: colors.backdrop,
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    borderRadius: '5px',
  },
  elements: {
    rootBox: { width: '100%' },
    cardBox: { width: '100%', border: `1px solid ${colors.borderSubtle}`, borderRadius: '10px', boxShadow: '0 16px 60px #00000026' },
    card: { padding: '34px', boxShadow: 'none', border: 'none' },
    headerTitle: { fontSize: '31px', fontWeight: 400, lineHeight: 1.25, letterSpacing: '-.7px' },
    headerSubtitle: { fontSize: '14px', color: colors.textSecondary },
    socialButtonsBlockButton: { minHeight: '46px', border: `1px solid ${colors.borderSubtle}` },
    dividerLine: { backgroundColor: colors.borderSubtle },
    formFieldLabel: { fontSize: '13px', color: colors.textLabel },
    formFieldInput: { minHeight: '48px', fontSize: '15px' },
    formButtonPrimary: { minHeight: '50px', fontSize: '14px', fontWeight: 600, '&:hover': { backgroundColor: colors.actionHover } },
    footer: { background: colors.surface },
    footerActionLink: { color: colors.text, textDecoration: 'underline', textUnderlineOffset: '4px' },
  },
};

/** Maps each `colors` key to its CSS custom property. */
export const cssVar = (key: keyof typeof colors) =>
  `--bb-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;
