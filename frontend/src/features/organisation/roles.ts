/** Display names for Clerk membership roles; not a backend authorization policy. */
export const ORGANISATION_ROLES = {
  'org:admin': 'Admin',
  'org:buyer': 'Buyer',
  'org:manager': 'Procurement Manager',
  'org:analyst': 'Finance/Risk Analyst',
} as const;

export function organisationRoleLabel(role: string | null | undefined): string | null {
  return role && Object.hasOwn(ORGANISATION_ROLES, role)
    ? ORGANISATION_ROLES[role as keyof typeof ORGANISATION_ROLES] : null;
}
