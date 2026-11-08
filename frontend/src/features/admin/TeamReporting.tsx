import { useCallback, useEffect, useState } from 'react';
import type { ReportingOverview, TeamReportingService } from './teamReportingApi';

export function TeamReporting({ service }: { service: TeamReportingService }) {
  const [overview, setOverview] = useState<ReportingOverview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try { setOverview(await service.load()); }
    catch (failure) { setLoadError(failure instanceof Error ? failure.message : "We couldn't load your team. Please try again."); }
  }, [service]);
  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<string>) {
    setBusy(true); setMessage(null);
    try { setMessage({ tone: 'success', text: await action() }); }
    catch (failure) { setMessage({ tone: 'error', text: failure instanceof Error ? failure.message : 'Something went wrong. Please try again.' }); }
    finally { setBusy(false); }
  }

  const assign = (officerId: string, managerId: string) => run(async () => {
    setOverview(await service.assign(officerId, managerId));
    return 'Saved.';
  });
  const sync = () => run(async () => {
    const result = await service.syncMembers();
    setOverview(await service.load());
    return `Members synced: ${result.saved} current, ${result.removed} removed.`;
  });

  const managers = overview?.managers ?? [];
  const managerCount = (id: string) => managers.find(m => m.user_id === id)?.officer_count ?? 0;
  return <section className="bb-admin-team" aria-labelledby="admin-team-reporting">
    <div className="bb-admin-section-heading bb-admin-team-heading">
      <div><h2 id="admin-team-reporting">Team reporting</h2>
        <p>Choose the Procurement Manager who reviews each Procurement Officer's requests. Changing a manager moves that officer's pending requests to the new manager.</p>
      </div>
      <button type="button" className="bb-button bb-button--secondary" disabled={busy} onClick={() => void sync()}>Sync members from Clerk</button>
    </div>
    <div className="bb-admin-team-body">
      {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={`bb-admin-team-message bb-admin-team-message--${message.tone}`}>{message.text}</p>}
      {loadError ? <div role="alert"><p className="bb-admin-team-message bb-admin-team-message--error">{loadError}</p><button type="button" className="bb-button bb-button--secondary" onClick={() => void load()}>Try again</button></div>
        : !overview ? <p role="status" className="bb-admin-team-note">Loading your team...</p>
        : overview.officers.length === 0 ? <p className="bb-admin-team-note">No Procurement Officers yet. Invite people below, or sync members from Clerk.</p>
        : <>
          {managers.length === 0 && <p className="bb-admin-team-note">Add a Procurement Manager before assigning officers.</p>}
          <ul className="bb-admin-team-list">
            {overview.officers.map(officer => {
              const selectId = `pm-for-${officer.user_id}`;
              return <li key={officer.user_id}>
                <label htmlFor={selectId}>{officer.label}</label>
                <div className="bb-admin-team-choice">
                  {officer.pm_user_id === null && <span className="bb-admin-team-warning">No PM assigned</span>}
                  <select id={selectId} value={officer.pm_user_id ?? ''} disabled={busy || managers.length === 0}
                    onChange={event => { if (event.target.value) void assign(officer.user_id, event.target.value); }}>
                    {officer.pm_user_id === null && <option value="">Choose a manager</option>}
                    {managers.map(manager => <option key={manager.user_id} value={manager.user_id}>{manager.label} ({managerCount(manager.user_id)})</option>)}
                  </select>
                </div>
              </li>;
            })}
          </ul>
        </>}
    </div>
  </section>;
}
