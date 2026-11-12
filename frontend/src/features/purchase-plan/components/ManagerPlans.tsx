import { useMemo, useRef, useState } from 'react';
import type { PurchasePlan, PurchasePlanService } from '../types';
import { ErrorBanner } from './Primitives';
import { RefreshIconButton, UpdatedAt } from './UpdatedAt';
import { useManagerRefresh } from '../useManagerRefresh';
import { ManagerRefreshBar, ManagerSkeleton, useRefreshSweep } from './ManagerLoading';
import { Pagination } from './Pagination';
import { OfficerFilter } from './OfficerFilter';
import { SortMenu, type SortGroup } from './SortMenu';
import { ManagerPlanCard, managerPlanState, type ManagerPlanState } from './ManagerPlanCard';

/** Three plans per row and two rows per page, like the Approval inbox. */
export const MANAGER_PLANS_PAGE_SIZE = 6;
/** Pending requests live in the Approval inbox and drafts are the officer's own, so managers see only decided plans. */
const DECIDED = ['approved', 'purchased', 'rejected', 'closed'];

type PlanType = 'all' | ManagerPlanState;
const TYPES: { id: PlanType; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'to-buy', label: 'To buy' }, { id: 'overdue', label: 'Overdue' },
  { id: 'purchased', label: 'Purchased' }, { id: 'rejected', label: 'Rejected' }, { id: 'closed', label: 'Closed' },
];
type PlanSort = 'deadline-soonest' | 'deadline-latest' | 'mt-high' | 'mt-low' | 'newest' | 'oldest';
const SORTS: SortGroup<PlanSort>[] = [
  { heading: 'Deadline', options: [{ id: 'deadline-soonest', label: 'Earliest' }, { id: 'deadline-latest', label: 'Latest' }] },
  { heading: 'Quantity', options: [{ id: 'mt-high', label: 'High to low' }, { id: 'mt-low', label: 'Low to high' }] },
  { heading: 'Date submitted', options: [{ id: 'newest', label: 'Newest' }, { id: 'oldest', label: 'Oldest' }] },
];
const submitted = (plan: PurchasePlan) => plan.submitted_at ?? '';
const SORTERS: Record<PlanSort, (a: PurchasePlan, b: PurchasePlan) => number> = {
  'deadline-soonest': (a, b) => a.purchase_deadline.localeCompare(b.purchase_deadline) || submitted(b).localeCompare(submitted(a)),
  'deadline-latest': (a, b) => b.purchase_deadline.localeCompare(a.purchase_deadline) || submitted(b).localeCompare(submitted(a)),
  'mt-high': (a, b) => b.quantity_mt - a.quantity_mt || a.purchase_deadline.localeCompare(b.purchase_deadline),
  'mt-low': (a, b) => a.quantity_mt - b.quantity_mt || a.purchase_deadline.localeCompare(b.purchase_deadline),
  newest: (a, b) => submitted(b).localeCompare(submitted(a)),
  oldest: (a, b) => submitted(a).localeCompare(submitted(b)),
};
const DEFAULT_SORT: PlanSort = 'deadline-soonest';
const COUNTS: { id: ManagerPlanState; label: string }[] = [
  { id: 'to-buy', label: 'To buy' }, { id: 'overdue', label: 'Overdue' }, { id: 'purchased', label: 'Purchased' }, { id: 'rejected', label: 'Rejected' }, { id: 'closed', label: 'Closed' },
];

/** The plans a manager has decided on for their officers; reloads every 30 seconds. */
export function ManagerPlans({ service }: { service: PurchasePlanService }) {
  const { data, loadedAt, error, loading, refresh } = useManagerRefresh(service, () => service.list(), 30_000);
  const all = useMemo(() => (data?.plans ?? []).filter(plan => DECIDED.includes(plan.status ?? 'draft')), [data]);
  const [page, setPage] = useState(1);
  const [officers, setOfficers] = useState<string[]>([]);
  const [type, setType] = useState<PlanType>('all');
  const [sort, setSort] = useState<PlanSort>(DEFAULT_SORT);
  const officerOptions = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; count: number }>();
    for (const plan of all) {
      if (!plan.buyer_user_id) continue;
      const entry = byId.get(plan.buyer_user_id) ?? { id: plan.buyer_user_id, label: plan.buyer_label ?? 'An officer', count: 0 };
      entry.count += 1;
      byId.set(plan.buyer_user_id, entry);
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [all]);
  // An officer who no longer has plans drops out of the choice by itself.
  const chosen = officers.filter(id => officerOptions.some(option => option.id === id));
  const byOfficer = chosen.length === 0 ? all : all.filter(plan => plan.buyer_user_id && chosen.includes(plan.buyer_user_id));
  const rows = (type === 'all' ? byOfficer : byOfficer.filter(plan => managerPlanState(plan) === type)).slice().sort(SORTERS[sort]);
  // The figures follow the officer choice; the type choice decides which cards show.
  const counts = Object.fromEntries(COUNTS.map(({ id }) => [id, byOfficer.filter(plan => managerPlanState(plan) === id).length]));
  // Closed plans are rare, so their figure and filter show only while there are some.
  const hasClosed = all.some(plan => plan.status === 'closed');
  const counted = COUNTS.filter(({ id }) => id !== 'closed' || hasClosed);
  const types = TYPES.filter(({ id }) => id !== 'closed' || hasClosed || type === 'closed');
  const filtered = chosen.length > 0 || type !== 'all';
  const changed = filtered || sort !== DEFAULT_SORT;
  function chooseOfficers(ids: string[]) { setOfficers(ids); setPage(1); }
  function chooseType(next: PlanType) { setType(next); setPage(1); }
  function chooseSort(next: PlanSort) { setSort(next); setPage(1); }
  function showEverything() { setOfficers([]); setType('all'); setSort(DEFAULT_SORT); setPage(1); }
  const refreshing = loading && data !== undefined;
  const sweep = useRefreshSweep(loading);
  const pageCount = Math.max(1, Math.ceil(rows.length / MANAGER_PLANS_PAGE_SIZE));
  // The 30-second reload can shrink the list; stay on the last page that still exists.
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * MANAGER_PLANS_PAGE_SIZE, current * MANAGER_PLANS_PAGE_SIZE);
  // Empty slots keep a short last page the same size as the others, so the pager does not jump.
  const spacers = pageCount > 1 ? MANAGER_PLANS_PAGE_SIZE - visible.length : 0;
  const section = useRef<HTMLElement>(null);
  function changePage(next: number) {
    setPage(next);
    const top = section.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) section.current?.scrollIntoView?.({ block: 'start' });
  }
  return <section ref={section} className="pp-card pp-plans-panel pp-manager-panel" aria-label="Plans" aria-busy={loading}>
    <div className="pp-overview-header">
      <div>
        <h2>Plans</h2>
        <p className="pp-card-description">Decided plans from the officers you manage.</p>
        <UpdatedAt loadedAt={loadedAt} current={!loading && !error} />
        {data && <dl className="pp-inbox-counts pp-plan-counts">
          {counted.map(({ id, label }) => <div key={id} className={`pp-plan-count--${id}`}><dt>{label}</dt><dd>{counts[id]}</dd></div>)}
        </dl>}
        {data && <div className="pp-inbox-notes">
          <p className="pp-card-description pp-inbox-note">* <span className="pp-inbox-note-overdue">Overdue</span> plans are approved but not bought by their deadline. Remind the officer.</p>
          {hasClosed && <p className="pp-card-description pp-inbox-note">* <span className="pp-inbox-note-closed">Closed</span> plans were approved but can no longer be bought because the officer changed role.</p>}
        </div>}
      </div>
      <div className="pp-overview-controls pp-inbox-controls">
        {data && all.length > 0 && <>
          {changed && <button type="button" className="pp-inbox-reset" onClick={showEverything}>Show all plans</button>}
          <OfficerFilter options={officerOptions} selected={chosen} onChange={chooseOfficers} />
          <SortMenu groups={SORTS} value={sort} onChange={chooseSort} />
          <div className="pp-filter" role="group" aria-label="Plan type">
            {types.map(option => <button type="button" key={option.id} aria-pressed={type === option.id} onClick={() => chooseType(option.id)}>{option.label}</button>)}
          </div>
        </>}
        <RefreshIconButton label="Refresh plans" loading={loading} refreshing={refreshing} onClick={() => { sweep.start(); refresh(); }} />
      </div>
    </div>
    {sweep.sweeping && <ManagerRefreshBar label="Updating plans…" />}
    {loading && !data ? <><p className="pp-sr-only" role="status">Loading plans…</p><ManagerSkeleton /></>
      : error ? <ErrorBanner>{error}</ErrorBanner>
      : rows.length === 0 ? <p className="pp-inbox-empty">{filtered ? 'No plans match these filters.' : 'No approved, purchased or rejected plans from your officers yet.'}</p>
      : <>
        <div className={`pp-plan-grid pp-plan-grid--paged pp-refresh-content${refreshing || sweep.sweeping ? ' pp-refresh-content--pending' : ''}`}>
          {visible.map(plan => <ManagerPlanCard key={plan.plan_id} plan={plan} service={service} />)}
          {Array.from({ length: spacers }, (_, i) => <div key={`spacer-${i}`} aria-hidden="true" className="pp-plan-spacer" />)}
        </div>
        <div className="pp-pager-bar">
          <p className="pp-page-summary">Showing {(current - 1) * MANAGER_PLANS_PAGE_SIZE + 1}–{Math.min(current * MANAGER_PLANS_PAGE_SIZE, rows.length)} of {rows.length}</p>
          <Pagination page={current} pageCount={pageCount} onChange={changePage} label="Plan pages" />
        </div>
      </>}
  </section>;
}
