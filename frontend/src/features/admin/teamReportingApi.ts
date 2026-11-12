/** `label` is the person's name when Clerk has one, otherwise their email. */
export interface ReportingOfficer { user_id: string; label: string; email?: string | null; pm_user_id: string | null }
export interface ReportingManager { user_id: string; label: string; email?: string | null; officer_count: number }
export interface ReportingOverview { officers: ReportingOfficer[]; managers: ReportingManager[] }
export interface MemberSyncResult { saved: number; removed: number }

export interface TeamReportingService {
  load(): Promise<ReportingOverview>;
  assign(officerId: string, managerId: string): Promise<ReportingOverview>;
  syncMembers(): Promise<MemberSyncResult>;
}

function parseOverview(value: unknown): ReportingOverview {
  const data = value as Partial<ReportingOverview> | null;
  const text = (item: unknown) => typeof item === 'string' && item.length > 0;
  const optional = (item: unknown) => item === undefined || item === null || typeof item === 'string';
  if (!data || !Array.isArray(data.officers) || !Array.isArray(data.managers)
    || !data.officers.every(o => text(o?.user_id) && text(o?.label) && optional(o.email) && (o.pm_user_id === null || text(o.pm_user_id)))
    || !data.managers.every(m => text(m?.user_id) && text(m?.label) && optional(m.email) && Number.isSafeInteger(m.officer_count))) {
    throw new Error('The team reporting response was invalid. Please retry.');
  }
  return data as ReportingOverview;
}

export function createTeamReportingService({ getToken, baseUrl }: {
  getToken: () => Promise<string | null>; baseUrl?: string;
}): TeamReportingService {
  const base = (baseUrl ?? import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');

  async function request(path: string, failure: string, method = 'GET', body?: object): Promise<unknown> {
    const token = await getToken();
    let response: Response;
    try {
      response = await fetch(`${base}/api/v1/admin/${path}`, {
        method, cache: 'no-store',
        headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) },
        ...(body && { body: JSON.stringify(body) }),
      });
    } catch { throw new Error(failure); }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error((payload as { detail?: string } | null)?.detail ?? failure);
    return payload;
  }

  return {
    load: async () => parseOverview(await request('pm-assignments', "We couldn't load your team. Please try again.")),
    assign: async (officerId, managerId) => parseOverview(await request(`pm-assignments/${encodeURIComponent(officerId)}`,
      "We couldn't save that change. Please try again.", 'PUT', { pm_user_id: managerId })),
    syncMembers: async () => {
      const result = await request('members/sync', "We couldn't sync members from Clerk. Please try again.", 'POST') as MemberSyncResult | null;
      if (!result || !Number.isSafeInteger(result.saved) || !Number.isSafeInteger(result.removed)) throw new Error('The member sync response was invalid. Please retry.');
      return result;
    },
  };
}
