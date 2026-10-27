import { organisationRoleLabel } from './roles';

export interface OrganisationPermissions {
  organisation_id: string;
  role: string;
  can_read_plans: boolean;
  can_write_plans: boolean;
  plan_scope: 'own' | 'organisation' | 'none';
}

/** Admission comes from Spring's verified token, not a browser-selected role. */
export async function fetchOrganisationAccess(getToken: () => Promise<string | null>): Promise<OrganisationPermissions> {
  const token = await getToken();
  if (!token) throw new Error('Please sign in again.');
  const base = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
  const response = await fetch(`${base}/api/v1/organisation`, {
    cache: 'no-store', headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(response.status === 403
    ? 'Your organisation role is not available. Refresh your session or contact your admin.'
    : 'Could not verify organisation access. Check the backend and retry.');
  const data = await response.json() as OrganisationPermissions;
  const expected = data?.role === 'org:buyer' ? ['own', true, true]
    : data?.role === 'org:manager' || data?.role === 'org:analyst' ? ['organisation', true, false]
    : data?.role === 'org:admin' ? ['none', false, false] : null;
  if (!expected || !organisationRoleLabel(data.role) || typeof data.organisation_id !== 'string'
      || !/^org_[A-Za-z0-9]+$/.test(data.organisation_id)
      || data.plan_scope !== expected[0] || data.can_read_plans !== expected[1] || data.can_write_plans !== expected[2]) {
    throw new Error('The organisation access response was invalid. Please retry.');
  }
  return data;
}
