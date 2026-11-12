import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLink } from '../../../app/router';
import { type PurchasePlanService } from '../types';
import { ErrorBanner } from './Primitives';
import { RefreshIconButton, UpdatedAt } from './UpdatedAt';
import { useManagerRefresh } from '../useManagerRefresh';
import { ManagerRefreshBar, ManagerSkeleton, useRefreshSweep } from './ManagerLoading';
import { formatDate, formatDateTime } from '../dates';
import { Pagination } from './Pagination';
import { singaporeToday } from '../../market-dashboard/format';
import { OfficerFilter } from './OfficerFilter';
import { SortMenu, type SortGroup } from './SortMenu';
import { CardTop } from './StatusTag';

type InboxType = 'all' | 'submitted' | 'overdue' | 'withdrawn';
type InboxSort = 'newest' | 'oldest' | 'deadline-soonest' | 'deadline-latest' | 'mt-high' | 'mt-low';
const SORTS: SortGroup<InboxSort>[] = [
  { heading: 'Date submitted', options: [{ id: 'newest', label: 'Newest' }, { id: 'oldest', label: 'Oldest' }] },
  { heading: 'Deadline', options: [{ id: 'deadline-soonest', label: 'Earliest' }, { id: 'deadline-latest', label: 'Latest' }] },
  { heading: 'Quantity', options: [{ id: 'mt-high', label: 'High to low' }, { id: 'mt-low', label: 'Low to high' }] },
];
type InboxRow = { created_at: string; purchase_deadline: string; quantity_mt: number; notification_id: string };
const SORTERS: Record<InboxSort, (a: InboxRow, b: InboxRow) => number> = {
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  oldest: (a, b) => a.created_at.localeCompare(b.created_at),
  'deadline-soonest': (a, b) => a.purchase_deadline.localeCompare(b.purchase_deadline) || b.created_at.localeCompare(a.created_at),
  'deadline-latest': (a, b) => b.purchase_deadline.localeCompare(a.purchase_deadline) || b.created_at.localeCompare(a.created_at),
  'mt-high': (a, b) => b.quantity_mt - a.quantity_mt || b.created_at.localeCompare(a.created_at),
  'mt-low': (a, b) => a.quantity_mt - b.quantity_mt || b.created_at.localeCompare(a.created_at),
};
const TYPES: { id: InboxType; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'submitted', label: 'Pending' }, { id: 'overdue', label: 'Overdue' }, { id: 'withdrawn', label: 'Withdrawn' }];

/** Pending, overdue (still pending after its purchase deadline) or withdrawn: each request is exactly one. */
export function inboxState(row: { status: string; purchase_deadline: string }, today: string): Exclude<InboxType, 'all'> {
  return row.status === 'withdrawn' ? 'withdrawn' : row.purchase_deadline < today ? 'overdue' : 'submitted';
}

/** Pending requests carry no tag; overdue and withdrawn ones do. */
function inboxTag(row: { status: string; purchase_deadline: string }, today: string) {
  const state = inboxState(row, today);
  return state === 'submitted' ? undefined : state;
}

/** Three requests per row and two rows per page. */
export const INBOX_PAGE_SIZE = 6;

/** The manager's own inbox of their officers' requests; reloads every 30 seconds. */
export function ApprovalInbox({ service }: { service: PurchasePlanService }) {
  const { data, loadedAt, error, loading, refresh } = useManagerRefresh(service, () => service.notifications!(), 30_000);
  const all = data?.notifications ?? [];
  const [page, setPage] = useState(1);
  const [officers, setOfficers] = useState<string[]>([]);
  const [type, setType] = useState<InboxType>('all');
  const [sort, setSort] = useState<InboxSort>('newest');
  const officerOptions = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; count: number }>();
    for (const row of all) {
      const entry = byId.get(row.buyer_user_id) ?? { id: row.buyer_user_id, label: row.buyer_label, count: 0 };
      entry.count += 1;
      byId.set(row.buyer_user_id, entry);
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [all]);
  // An officer who no longer has requests drops out of the choice by itself.
  const chosen = officers.filter(id => officerOptions.some(option => option.id === id));
  const byOfficer = chosen.length === 0 ? all : all.filter(row => chosen.includes(row.buyer_user_id));
  const today = singaporeToday();
  const rows = (type === 'all' ? byOfficer : byOfficer.filter(row => inboxState(row, today) === type)).slice().sort(SORTERS[sort]);
  // The figures follow the officer choice; the type choice decides which cards show.
  const pendingCount = byOfficer.filter(row => inboxState(row, today) === 'submitted').length;
  const overdueCount = byOfficer.filter(row => inboxState(row, today) === 'overdue').length;
  const withdrawnCount = byOfficer.filter(row => row.status === 'withdrawn').length;
  const filtered = chosen.length > 0 || type !== 'all';
  const changed = filtered || sort !== 'newest';
  function chooseOfficers(ids: string[]) { setOfficers(ids); setPage(1); }
  function chooseType(next: InboxType) { setType(next); setPage(1); }
  function chooseSort(next: InboxSort) { setSort(next); setPage(1); }
  function showEverything() { setOfficers([]); setType('all'); setSort('newest'); setPage(1); }
  const refreshing = loading && data !== undefined;
  const sweep = useRefreshSweep(loading);
  const pageCount = Math.max(1, Math.ceil(rows.length / INBOX_PAGE_SIZE));
  // The 30-second reload can shrink the list; stay on the last page that still exists.
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * INBOX_PAGE_SIZE, current * INBOX_PAGE_SIZE);
  // Empty slots keep a short last page the same size as the others, so the pager does not jump.
  const spacers = pageCount > 1 ? INBOX_PAGE_SIZE - visible.length : 0;
  function changePage(next: number) {
    setPage(next);
    const top = section.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) section.current?.scrollIntoView?.({ block: 'start' });
  }
  // Home's "Plans for approval" links here; client-side navigation doesn't scroll to a hash by itself.
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash !== '#approval-inbox') return;
    section.current?.scrollIntoView?.({ block: 'start' });
    section.current?.focus({ preventScroll: true });
  }, []);
  return <section ref={section} id="approval-inbox" tabIndex={-1} className="pp-card pp-approval-inbox pp-manager-panel" aria-label="Approval inbox" aria-busy={loading}>
    <div className="pp-overview-header">
      <div>
        <h2>Approval inbox</h2>
        <p className="pp-card-description">Requests from the officers you manage.</p>
        <UpdatedAt loadedAt={loadedAt} current={!loading && !error} />
        {data && <dl className="pp-inbox-counts">
          <div><dt>Pending</dt><dd>{pendingCount}</dd></div>
          <div className="pp-inbox-counts-overdue"><dt>Overdue</dt><dd>{overdueCount}</dd></div>
          <div className="pp-inbox-counts-withdrawn"><dt>Withdrawn</dt><dd>{withdrawnCount}</dd></div>
        </dl>}
        {data && <div className="pp-inbox-notes">
          <p className="pp-card-description pp-inbox-note">* <span className="pp-inbox-note-overdue">Overdue</span> submissions are rejected automatically 5 days after their deadline.</p>
          <p className="pp-card-description pp-inbox-note">* <span className="pp-inbox-note-withdrawn">Withdrawn</span> submissions disappear after 5 days.</p>
        </div>}
      </div>
      <div className="pp-overview-controls pp-inbox-controls">
        {data && all.length > 0 && <>
          {changed && <button type="button" className="pp-inbox-reset" onClick={showEverything}>Show all requests</button>}
          <OfficerFilter options={officerOptions} selected={chosen} onChange={chooseOfficers} />
          <SortMenu groups={SORTS} value={sort} onChange={chooseSort} />
          <div className="pp-filter" role="group" aria-label="Request type">
            {TYPES.map(option => <button type="button" key={option.id} aria-pressed={type === option.id} onClick={() => chooseType(option.id)}>{option.label}</button>)}
          </div>
        </>}
        <RefreshIconButton label="Refresh inbox" loading={loading} refreshing={refreshing} onClick={() => { sweep.start(); refresh(); }} />
      </div>
    </div>
    {sweep.sweeping && <ManagerRefreshBar label="Updating approval inbox…" />}
    {loading && !data ? <><p className="pp-sr-only" role="status">Loading approval notifications…</p><ManagerSkeleton /></> : error ? <ErrorBanner>{error}</ErrorBanner> : rows.length === 0 ? <p className="pp-inbox-empty">{filtered ? 'No requests match these filters.' : 'No requests are waiting for you.'}</p> : <><ul className={`pp-approval-list pp-refresh-content${refreshing || sweep.sweeping ? ' pp-refresh-content--pending' : ''}`}>{visible.map(row => <li key={row.notification_id} className="pp-inbox-card">
      <CardTop quantity={row.quantity_mt.toLocaleString('en-GB')} deadline={row.purchase_deadline} due={formatDate(row.purchase_deadline)}
        tag={inboxTag(row, today)} />
      <p className="pp-inbox-meta">Submitted by <strong>{row.buyer_label}</strong><br /><time dateTime={row.created_at}>{formatDateTime(row.created_at)}</time></p>
      <AppLink className="pp-button pp-button--primary pp-inbox-open" href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(row.plan_id)}`}>View submitted recommendation</AppLink>
    </li>)}{Array.from({ length: spacers }, (_, i) => <li key={`spacer-${i}`} role="presentation" aria-hidden="true" className="pp-approval-spacer" />)}</ul>
      <div className="pp-pager-bar">
        <p className="pp-page-summary">Showing {(current - 1) * INBOX_PAGE_SIZE + 1}–{Math.min(current * INBOX_PAGE_SIZE, rows.length)} of {rows.length}</p>
        <Pagination page={current} pageCount={pageCount} onChange={changePage} label="Approval inbox pages" />
      </div></>}
  </section>;
}
