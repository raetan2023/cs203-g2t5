/**
 * JS mirror of the colour tokens for consumers that cannot read CSS variables
 * (Clerk `appearance`, Recharts SVG props). tokens.css is the source of truth;
 * theme.test.ts fails if a value here drifts from it. Add exports (clerkAppearance,
 * chartTheme) in the phases that need them (Phase 3, Phase 6), built from `colors`.
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

/** Maps each `colors` key to its CSS custom property. */
export const cssVar = (key: keyof typeof colors) =>
  `--bb-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;
