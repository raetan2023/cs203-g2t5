import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportingOverview, TeamReportingService } from './teamReportingApi';

const AUTO_UPDATE_MS = 5000;
const SUCCESS_MESSAGE_MS = 4000;
const poCount = (count: number) => `${count} PO${count > 1 ? 's' : ''}`;

export function TeamReporting({ service }: { service: TeamReportingService }) {
  const [overview, setOverview] = useState<ReportingOverview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoadError('');
    try { setOverview(await service.load()); }
    catch (failure) { setLoadError(failure instanceof Error ? failure.message : "We couldn't load your team. Please try again."); }
  }, [service]);
  useEffect(() => { void load(); }, [load]);

  // Success messages clear themselves; errors stay until the next action.
  useEffect(() => {
    if (message?.tone !== 'success') return;
    const timer = setTimeout(() => setMessage(null), SUCCESS_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  // Role changes reach the database through Clerk's webhook, so re-read the list
  // quietly. A save in progress wins: a reply that started before it is discarded.
  const saving = useRef(false);
  const saveCount = useRef(0);
  useEffect(() => {
    let active = true;
    let checking = false;
    async function check() {
      if (checking || saving.current || document.visibilityState !== 'visible') return;
      checking = true;
      const startedAt = saveCount.current;
      try {
        const latest = await service.load();
        if (active && !saving.current && startedAt === saveCount.current) { setOverview(latest); setLoadError(''); }
      } catch { /* The next check tries again; a background failure needs no message. */ }
      finally { checking = false; }
    }
    const timer = setInterval(() => void check(), AUTO_UPDATE_MS);
    const onVisible = () => void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [service]);

  async function run(action: () => Promise<string>) {
    saving.current = true; saveCount.current += 1;
    setBusy(true); setMessage(null);
    try { setMessage({ tone: 'success', text: await action() }); }
    catch (failure) { setMessage({ tone: 'error', text: failure instanceof Error ? failure.message : 'Something went wrong. Please try again.' }); }
    finally { saving.current = false; setBusy(false); }
  }

  const pick = (officerId: string, managerId: string) => {
    setMessage(null);
    setPicks(current => ({ ...current, [officerId]: managerId }));
  };
  // Saved one by one, so a failure keeps only the picks that did not save.
  const save = () => run(async () => {
    for (const [officerId, managerId] of changes) {
      setOverview(await service.assign(officerId, managerId));
      setPicks(({ [officerId]: _saved, ...rest }) => rest);
    }
    return 'Saved.';
  });
  const cancel = () => { setMessage(null); setPicks({}); };
  const refresh = async () => {
    setRefreshing(true);
    await run(async () => {
      await service.syncMembers();
      setOverview(await service.load());
      setLoadError('');
      return 'Team list updated.';
    });
    setRefreshing(false);
  };

  const managers = overview?.managers ?? [];
  // Add the email only when two managers share a name.
  const managerName = (manager: { label: string; email?: string | null }) =>
    manager.email && manager.email !== manager.label && managers.filter(m => m.label === manager.label).length > 1 ? `${manager.label} (${manager.email})` : manager.label;
  // A pick stops counting if it matches what is saved, or its people changed role.
  const changes = Object.entries(picks).filter(([officerId, managerId]) => {
    const officer = overview?.officers.find(item => item.user_id === officerId);
    return !!officer && officer.pm_user_id !== managerId && managers.some(item => item.user_id === managerId);
  });
  const picked = new Map(changes);
  const unassigned = overview?.officers.filter(officer => officer.pm_user_id === null).length ?? 0;
  // Counts unsaved picks too, so the dropdowns preview the result of saving.
  const managerCount = (id: string) => overview?.officers.filter(officer => (picked.get(officer.user_id) ?? officer.pm_user_id) === id).length ?? 0;
  return <section className="bb-admin-team" aria-labelledby="admin-team-reporting">
    <div className="bb-admin-section-heading bb-admin-team-heading">
      <div><h2 id="admin-team-reporting">Team reporting</h2>
        {overview && overview.officers.length > 0 && (unassigned > 0
          ? <p className="bb-admin-team-status bb-admin-team-status--required">PM assignments required: {unassigned} {unassigned === 1 ? 'officer has' : 'officers have'} no manager.</p>
          : <p className="bb-admin-team-status bb-admin-team-status--complete">All officers have a manager.</p>)}
      </div>
      <button type="button" className={`bb-admin-team-refresh${refreshing ? ' is-refreshing' : ''}`} aria-label="Refresh team list" title="Refresh team list" disabled={busy} onClick={() => void refresh()}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" /><path d="M21 3v5h-5" /></svg>
      </button>
    </div>
    <div className="bb-admin-team-body">
      {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={`bb-admin-team-message bb-admin-team-message--${message.tone}`}>{message.text}</p>}
      {loadError ? <div role="alert"><p className="bb-admin-team-message bb-admin-team-message--error">{loadError}</p><button type="button" className="bb-button bb-button--secondary" onClick={() => void load()}>Try again</button></div>
        : !overview ? <p role="status" className="bb-admin-team-note">Loading your team...</p>
        : overview.officers.length === 0 ? <p className="bb-admin-team-note">No Procurement Officers yet. Invite people below, then refresh this list.</p>
        : <>
          {managers.length === 0 && <p className="bb-admin-team-note">Add a Procurement Manager before assigning officers.</p>}
          <ul className="bb-admin-team-list">
            {overview.officers.map(officer => {
              const selectId = `pm-for-${officer.user_id}`;
              return <li key={officer.user_id}>
                <label htmlFor={selectId} className="bb-admin-team-person">{officer.label}
                  {officer.email && officer.email !== officer.label && <span className="bb-admin-team-email">{officer.email}</span>}
                </label>
                <div className="bb-admin-team-choice">
                  {officer.pm_user_id === null && <span className="bb-admin-team-warning">No PM assigned</span>}
                  <select id={selectId} value={picked.get(officer.user_id) ?? officer.pm_user_id ?? ''} disabled={busy || managers.length === 0}
                    onChange={event => pick(officer.user_id, event.target.value)}>
                    {officer.pm_user_id === null && <option value="">Choose a manager</option>}
                    {managers.map(manager => <option key={manager.user_id} value={manager.user_id}>{managerName(manager)} ({poCount(managerCount(manager.user_id))})</option>)}
                  </select>
                </div>
              </li>;
            })}
          </ul>
          <div className="bb-admin-team-actions">
            <button type="button" className="bb-button bb-button--secondary" disabled={busy || changes.length === 0} onClick={cancel}>Cancel</button>
            <button type="button" className="bb-button" disabled={busy || changes.length === 0} onClick={() => void save()}>Save changes</button>
          </div>
        </>}
    </div>
  </section>;
}
