/** Shared theme for Clerk organisation cards, switcher popovers and management. */
export const organisationAppearance = {
  variables: {
    colorPrimary: '#18c7bd',
    colorPrimaryForeground: '#04262b',
    colorBorder: '#2b4258',
    colorMuted: '#132b40',
    colorBackground: '#0c1d2f',
    colorForeground: '#edf4fc',
    colorMutedForeground: '#9aadc2',
    colorInput: '#10263b',
    colorInputForeground: '#edf4fc',
    colorNeutral: '#c9d8e8',
    colorDanger: '#ff9299',
    fontFamily: "Inter, 'Segoe UI', Arial, sans-serif",
    borderRadius: '0.75rem',
  },
  elements: {
    formButtonPrimary: { backgroundColor: '#18c7bd', color: '#04262b' },
    cardBox: 'bb-org-clerk-cardbox',
    card: 'bb-org-clerk-card',
    organizationSwitcherTrigger: 'bb-org-clerk-trigger',
    organizationSwitcherPopoverCard: 'bb-org-clerk-popover',
    organizationPreviewMainIdentifier: 'bb-org-clerk-name',
    organizationProfilePage: 'bb-org-clerk-profile',
  },
};
