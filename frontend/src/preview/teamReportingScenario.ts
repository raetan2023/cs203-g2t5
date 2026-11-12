// Preview-only team reporting service for the admin page: three officers (one without a manager, so the
// warning shows) and two managers. Assignments are kept in memory; nothing reaches the backend.
import type { ReportingOverview, TeamReportingService } from '../features/admin/teamReportingApi';

export function createPreviewTeamReporting(): TeamReportingService {
  let overview: ReportingOverview = {
    officers: [
      { user_id: 'officer-1', label: 'Alicia Tan (alicia.tan@preview.example)', pm_user_id: 'manager-1' },
      { user_id: 'officer-2', label: 'Benjamin Lim (ben.lim@preview.example)', pm_user_id: 'manager-2' },
      { user_id: 'officer-3', label: 'Chen Wei (chen.wei@preview.example)', pm_user_id: null },
    ],
    managers: [
      { user_id: 'manager-1', label: 'Procurement Manager (preview)', officer_count: 1 },
      { user_id: 'manager-2', label: 'Second Manager (preview)', officer_count: 1 },
    ],
  };
  const pause = () => new Promise(done => setTimeout(done, 300));
  return {
    async load() { await pause(); return overview; },
    async assign(officerId, managerId) {
      await pause();
      overview = { ...overview, officers: overview.officers.map(o => o.user_id === officerId ? { ...o, pm_user_id: managerId } : o) };
      return overview;
    },
    async syncMembers() { await pause(); return { saved: 0, removed: 0 }; },
  };
}
