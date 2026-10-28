import { colors } from '../../styles/theme';

/** Shared theme for Clerk organisation cards, switcher popovers and management: the app's dark surfaces and beige actions. */
export const organisationAppearance = {
  variables: {
    colorPrimary: colors.action,
    colorPrimaryForeground: colors.textOnAction,
    colorBorder: colors.borderSubtle,
    colorMuted: colors.canvas,
    colorBackground: colors.surface,
    colorForeground: colors.text,
    colorMutedForeground: colors.textSecondary,
    colorInput: colors.surfaceInput,
    colorInputForeground: colors.text,
    colorNeutral: colors.text,
    colorDanger: colors.errorText,
    colorRing: colors.focus,
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    borderRadius: '0.5rem',
  },
  elements: {
    // Flat beige button, matching .bb-button: Clerk's gradient sheen and shadow removed.
    formButtonPrimary: { backgroundColor: colors.action, color: colors.textOnAction, backgroundImage: 'none', boxShadow: 'none',
      '&::after': { display: 'none' }, '&:hover': { backgroundColor: colors.actionHover } },
    // Management modal: canvas sidebar beside a surface page, like the app shell's navigation.
    navbar: { background: colors.canvas, borderRight: `1px solid ${colors.borderSubtle}` },
    navbarButton: { color: colors.textSecondary, '&[data-active="true"]': { color: colors.text, background: colors.surfaceHover } },
    modalBackdrop: { background: colors.backdrop },
    cardBox: 'bb-org-clerk-cardbox',
    card: 'bb-org-clerk-card',
    organizationSwitcherTrigger: 'bb-org-clerk-trigger',
    organizationSwitcherPopoverCard: 'bb-org-clerk-popover',
    organizationPreviewMainIdentifier: 'bb-org-clerk-name',
    organizationProfilePage: 'bb-org-clerk-profile',
  },
};
