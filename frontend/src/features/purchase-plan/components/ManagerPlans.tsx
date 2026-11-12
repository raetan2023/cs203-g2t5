import { useMemo, useRef, useState } from 'react';
import type { PurchasePlan, PurchasePlanService, TeamMember } from '../types';
import { useTeam, withTeam } from '../useTeam';
import { ErrorBanner } from './Primitives';
import { RefreshIconButton, UpdatedAt } from './UpdatedAt';
import { useManagerRefresh } from '../useManagerRefresh';
import { ManagerRefreshBar, ManagerSkeleton, useRefreshSweep } from './ManagerLoading';
import { Pagination } from './Pagination';
import { OfficerFilter } from './OfficerFilter';
import { PeopleFilter, type PeopleGroup } from './PeopleFilter';
import { SortMenu, type SortGroup } from './SortMenu';
import { ManagerPlanCard, managerPlanState, type ManagerPlanState } from './ManagerPlanCard';

/** Three plans per row and two rows per page, like the Approval inbox. */
export const MANAGER_PLANS_PAGE_SIZE = 6;
/** Drafts are the officer's own, and pending or withdrawn requests never got a decision, so this section shows decided plans. */
const SHOWN: Record<Audience, string[]> = {
  manager: ['approved', 'purchased', 'rejected', 'closed'],
  admin: ['approved', 'purchased', 'rejected', 'closed'],
};
type Audience = 'manager' | 'admin';
/** Types that are rare, so their figure and filter show only while there are some. */
const RARE: ManagerPlanState[] = ['withdrawn'];
/** The "No PM assigned" choice in the admin's PM filter. */
const NO_PM = 'no-pm';

type PlanType = 'all' | ManagerPlanState;
const TYPES: { id: PlanType; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'to-buy', label: 'To buy' },
  { id: 'purchased', label: 'Purchased' }, { id: 'rejected', label: 'Rejected' }, { id: 'withdrawn', label: 'Withdrawn' }, { id: 'closed', label: 'Closed' },
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
const COUNTS = TYPES.filter((type): type is { id: ManagerPlanState; label: string } => type.id !== 'all');

type Option = { id: string; label: string; count: number };
/** One choice per person, with how many of the shown plans are theirs. */
function optionsOf(plans: PurchasePlan[], key: (plan: PurchasePlan) => { id: string; label: string } | null): Option[] {
  const byId = new Map<string, Option>();
  for (const plan of plans) {
    const person = key(plan);
    if (!person) continue;
    const entry = byId.get(person.id) ?? { ...person, count: 0 };
    entry.count += 1;
    byId.set(person.id, entry);
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}
/**
 * Every officer grouped under their current PM, with "No PM assigned" last: the whole team (even officers
 * with no plans yet) plus anyone else who owns a shown plan.
 */
function teamsOf(plans: PurchasePlan[], team: TeamMember[]): PeopleGroup[] {
  const people = new Map<string, { label: string; pm: { id: string; label: string }; count: number }>();
  for (const member of team)
    people.set(member.user_id, { label: member.label, count: 0,
      pm: member.pm_user_id ? { id: member.pm_user_id, label: member.pm_label ?? 'A manager' } : { id: NO_PM, label: 'No PM assigned' } });
  for (const plan of plans) {
    const officer = officerOf(plan);
    if (!officer) continue;
    const entry = people.get(officer.id) ?? { label: officer.label, pm: managerOf(plan), count: 0 };
    entry.count += 1;
    people.set(officer.id, entry);
  }
  const groups = new Map<string, PeopleGroup>();
  for (const [id, person] of people) {
    const group = groups.get(person.pm.id) ?? { id: person.pm.id, label: person.pm.label, officers: [] };
    group.officers.push({ id, label: person.label, count: person.count });
    groups.set(person.pm.id, group);
  }
  for (const group of groups.values()) group.officers.sort((a, b) => a.label.localeCompare(b.label));
  return [...groups.values()].sort((a, b) => (a.id === NO_PM ? 1 : 0) - (b.id === NO_PM ? 1 : 0) || a.label.localeCompare(b.label));
}
const managerOf = (plan: PurchasePlan) => plan.pm_user_id ? { id: plan.pm_user_id, label: plan.pm_label ?? 'A manager' } : { id: NO_PM, label: 'No PM assigned' };
const officerOf = (plan: PurchasePlan) => plan.buyer_user_id ? { id: plan.buyer_user_id, label: plan.buyer_label ?? 'An officer' } : null;

/**
 * Decided plans for a manager (their officers) or an admin (every officer, read-only, filterable by PM too);
 * reloads every 30 seconds.
 */
export function ManagerPlans({ service, audience = 'manager' }: { service: PurchasePlanService; audience?: Audience }) {
  const admin = audience === 'admin';
  const { data, loadedAt, error, loading, refresh } = useManagerRefresh(service, () => service.list(), 30_000);
  const all = useMemo(() => (data?.plans ?? []).filter(plan => SHOWN[audience].includes(plan.status ?? 'draft')), [data, audience]);
  const [page, setPage] = useState(1);
  const [officers, setOfficers] = useState<string[]>([]);
  const [type, setType] = useState<PlanType>('all');
  const [sort, setSort] = useState<PlanSort>(DEFAULT_SORT);
  // Admins choose officers grouped under their PM; managers choose among their own officers.
  // Every officer on the team is offered, even one with no plans yet.
  const team = useTeam(service);
  const teams = useMemo(() => admin ? teamsOf(all, team) : [], [all, admin, team]);
  const officerOptions = useMemo(() => withTeam(team, optionsOf(all, officerOf)), [all, team]);
  // Someone who no longer has plans drops out of the choice by itself.
  const chosen = officers.filter(id => officerOptions.some(option => option.id === id));
  const byOfficer = chosen.length === 0 ? all : all.filter(plan => plan.buyer_user_id && chosen.includes(plan.buyer_user_id));
  const rows = (type === 'all' ? byOfficer : byOfficer.filter(plan => managerPlanState(plan) === type)).slice().sort(SORTERS[sort]);
  // The counts in the type buttons follow the people chosen; the type choice decides which cards show.
  const counts: Record<string, number> = { all: byOfficer.length,
    ...Object.fromEntries(COUNTS.map(({ id }) => [id, byOfficer.filter(plan => managerPlanState(plan) === id).length])) };
  const present = new Set(all.map(plan => managerPlanState(plan)));
  // Rare types show only while there are some.
  const offered = (id: PlanType) => id === 'all' || !RARE.includes(id) || present.has(id);
  const types = TYPES.filter(({ id }) => offered(id) || type === id);
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
  // Empty slots always fill the page to two rows, so the section keeps one size however few plans there are.
  const spacers = MANAGER_PLANS_PAGE_SIZE - visible.length;
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
        <p className="pp-card-description">{admin ? 'Decided plans from every officer.' : 'Decided plans from the officers you manage.'}</p>
        <UpdatedAt loadedAt={loadedAt} current={!loading && !error} />
        {data && <div className="pp-inbox-notes">
          <p className="pp-card-description pp-inbox-note">* <span className="pp-inbox-note-closed">Closed</span> plans: not bought by the deadline, or the officer changed role.</p>
        </div>}
      </div>
      <div className="pp-overview-controls pp-inbox-controls pp-controls-stack">
        {/* Row 1: who and in what order; row 2: which type, and refresh. Every filter shows even with no plans. */}
        {data && <div className="pp-controls-row">
          {/* Always takes its space (just hidden when there is nothing to reset), so the filters never shift. */}
          <button type="button" className={`pp-inbox-reset${changed ? '' : ' pp-inbox-reset--idle'}`} onClick={showEverything} aria-hidden={!changed} tabIndex={changed ? undefined : -1}>Show all plans</button>
          {admin ? <PeopleFilter groups={teams} selected={chosen} onChange={chooseOfficers} />
            : <OfficerFilter options={officerOptions} selected={chosen} onChange={chooseOfficers} />}
          <SortMenu groups={SORTS} value={sort} onChange={chooseSort} />
        </div>}
        <div className="pp-controls-row">
          {data && <div className="pp-filter" role="group" aria-label="Plan type">
            {types.map(option => <button type="button" key={option.id} aria-pressed={type === option.id} onClick={() => chooseType(option.id)}>{option.label} ({counts[option.id]})</button>)}
          </div>}
          <RefreshIconButton label="Refresh plans" loading={loading} refreshing={refreshing} onClick={() => { sweep.start(); refresh(); }} />
        </div>
      </div>
    </div>
    {sweep.sweeping && <ManagerRefreshBar label="Updating plans…" />}
    {loading && !data ? <><p className="pp-sr-only" role="status">Loading plans…</p><ManagerSkeleton /></>
      : error ? <ErrorBanner>{error}</ErrorBanner>
      : <>
        <div className="pp-fixed-grid">
        {rows.length === 0 && <p className="pp-inbox-empty pp-grid-empty">{filtered ? 'No plans match these filters.' : admin ? 'No approved, purchased or rejected plans in your organisation yet.' : 'No approved, purchased or rejected plans from your officers yet.'}</p>}
        <div className={`pp-plan-grid pp-plan-grid--paged pp-refresh-content${refreshing || sweep.sweeping ? ' pp-refresh-content--pending' : ''}`}>
          {visible.map(plan => <ManagerPlanCard key={plan.plan_id} plan={plan} service={service} showManager={admin} />)}
          {Array.from({ length: spacers }, (_, i) => <div key={`spacer-${i}`} aria-hidden="true" className="pp-plan-spacer" />)}
        </div>
        </div>
        <div className="pp-pager-bar">
          <p className="pp-page-summary">{rows.length === 0 ? 'Showing 0 of 0' : `Showing ${(current - 1) * MANAGER_PLANS_PAGE_SIZE + 1}–${Math.min(current * MANAGER_PLANS_PAGE_SIZE, rows.length)} of ${rows.length}`}</p>
          <Pagination page={current} pageCount={pageCount} onChange={changePage} label="Plan pages" />
        </div>
      </>}
  </section>;
}
