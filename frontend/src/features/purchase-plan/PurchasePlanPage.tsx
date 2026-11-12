import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearch } from '../../app/router';
import { useBuyerDecisions } from './components/BuyerDecisions';
import { PreviousPlanNote } from './components/PreviousPlanNote';
import { ApprovalInbox } from './components/ApprovalInbox';
import { ManagerTeamOverview } from './components/ManagerTeamOverview';
import { ManagerPlansLoading } from './components/ManagerLoading';
import { DeletePlanDialog } from './components/DeletePlanDialog';
import { formatDate } from './dates';
import { ErrorBanner, Icon, LoadingState, PlanButton } from './components/Primitives';
import { PurchasePlanForm } from './components/PurchasePlanForm';
import { PurchasePlanSummary } from './components/PurchasePlanSummary';
import { Pagination } from './components/Pagination';
import { ManagerPlans } from './components/ManagerPlans';

/** Three plans per row and two rows per page, like the Approval inbox. */
export const PLANS_PAGE_SIZE = 6;
import { requestError, type PlanInput, type PurchasePlan, type PurchasePlanService } from './types';
import './purchase-plan.css';

type PageState =
  | { mode: 'loading' }
  | { mode: 'error'; message: string }
  | { mode: 'view'; plan: PurchasePlan | null }
  | { mode: 'form'; plan: PurchasePlan | null };

export interface PurchasePlanPageProps {
  service: PurchasePlanService;
  canEdit?: boolean;
  isManager?: boolean;
  isAdmin?: boolean;
  /** Required even before a plan exists: the API's null response has no date. */
  scenarioDate: string;
  /** Future analysis consumers clear cached results on context changes or successful writes. */
  onInvalidateAnalysis?: () => void;
}

export function PurchasePlanPage({ service, scenarioDate, onInvalidateAnalysis, canEdit = true, isManager = false, isAdmin = false }: PurchasePlanPageProps) {
  const decisions = useBuyerDecisions();
  const [state, setState] = useState<PageState>({ mode: 'loading' });
  const [plans, setPlans] = useState<PurchasePlan[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  /** Visible counterpart of the announcement; planId marks the card to highlight. Cleared by the next action. */
  const [notice, setNotice] = useState<{ text: string; planId: string | null } | null>(null);
  const editPlanId = new URLSearchParams(useSearch()).get('edit_plan_id');
  const [filter, setFilter] = useState<'all' | 'open' | 'finished' | 'submitted' | 'approved' | 'rejected'>('all');
  /** Officers see plans by whose move it is; managers and admins keep the status filter above. */
  const [tab, setTab] = useState<PlanGroup>('todo');
  const [copyError, setCopyError] = useState('');
  const [sort, setSort] = useState<PlanSort>('deadline');
  const [planPage, setPlanPage] = useState(1);
  const plansSection = useRef<HTMLElement>(null);
  useEffect(() => { setPlanPage(1); }, [filter, tab, sort]);
  const sortId = useId();
  const [writingServices, setWritingServices] = useState<Set<PurchasePlanService>>(() => new Set());
  const writing = writingServices.has(service);
  const createRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const focusAfterRender = useRef<'create' | 'edit' | null>(null);
  // Identity distinguishes A -> B -> A and service/account changes, not just date equality.
  const context = useMemo(() => ({ service, scenarioDate }), [service, scenarioDate]);
  const activeContext = useRef<typeof context | null>(context);
  const invalidate = useRef(onInvalidateAnalysis);
  useEffect(() => { invalidate.current = onInvalidateAnalysis; }, [onInvalidateAnalysis]);
  useEffect(() => {
    activeContext.current = context;
    invalidate.current?.();
    setCopyError('');
    return () => { activeContext.current = null; };
  }, [context]);
  // Sharing this promise avoids consuming fail-once fixtures twice in StrictMode.
  const readRequest = useRef<{ context: typeof context; attempt: number; promise: ReturnType<PurchasePlanService['list']> } | null>(null);

  function scenarioError(plan: PurchasePlan | null): string | null {
    return plan && plan.scenario_as_of_date !== scenarioDate
      ? 'Your plan has not been refreshed for the current application date. Please retry.'
      : null;
  }

  useEffect(() => {
    let current = true;
    setState({ mode: 'loading' });
    setShowDelete(false);
    setSaving(false);
    setAnnouncement('');
    setNotice(null);
    focusAfterRender.current = null;
    if (!readRequest.current || readRequest.current.context !== context || readRequest.current.attempt !== attempt) {
      readRequest.current = { context, attempt, promise: service.list() };
    }
    readRequest.current.promise.then(({ plans }) => {
      if (!current) return;
      const message = plans.map(scenarioError).find(Boolean);
      setPlans(plans);
      const edit = canEdit && editPlanId ? plans.find(p => p.plan_id === editPlanId && (!p.status || p.status === 'draft')) : undefined;
      setState(message ? { mode: 'error', message } : edit ? { mode: 'form', plan: edit } : { mode: 'view', plan: null });
    }).catch(error => {
      if (current) setState({ mode: 'error', message: requestError(error).detail });
    });
    return () => { current = false; };
  }, [context, attempt, editPlanId, canEdit]);

  useEffect(() => {
    if (state.mode === 'view' && focusAfterRender.current) {
      (focusAfterRender.current === 'create' ? createRef : editRef).current?.focus();
      focusAfterRender.current = null;
    }
  }, [state]);

  async function save(input: PlanInput) {
    if (!canEdit || state.mode !== 'form') return;
    setWritingServices(previous => new Set(previous).add(service));
    let response;
    try {
      response = await (state.plan ? service.update(state.plan.plan_id, input) : service.create(input));
    } catch (error) {
      if (activeContext.current !== context) { reconcilePreviousWrite(); return; }
      throw error;
    } finally {
      finishWrite();
    }
    if (activeContext.current !== context) { reconcilePreviousWrite(); return; }
    invalidate.current?.();
    const message = scenarioError(response.plan);
    if (message) { setState({ mode: 'error', message }); return; }
    focusAfterRender.current = 'edit';
    setPlans(previous => [...previous.filter(plan => plan.plan_id !== response.plan.plan_id), response.plan]
      .sort((a, b) => a.purchase_deadline.localeCompare(b.purchase_deadline) || a.plan_id.localeCompare(b.plan_id)));
    setState({ mode: 'view', plan: response.plan });
    setTab('todo');
    setAnnouncement('Purchase plan saved.');
    setNotice({ text: 'Plan saved', planId: response.plan.plan_id });
  }

  async function remove() {
    if (!canEdit || state.mode !== 'view' || !state.plan) return;
    const planId = state.plan.plan_id;
    setWritingServices(previous => new Set(previous).add(service));
    try {
      await service.delete(planId);
    } catch (error) {
      if (activeContext.current !== context) { reconcilePreviousWrite(); return; }
      throw error;
    } finally {
      finishWrite();
    }
    if (activeContext.current !== context) { reconcilePreviousWrite(); return; }
    invalidate.current?.();
    focusAfterRender.current = 'create';
    setShowDelete(false);
    setPlans(previous => previous.filter(plan => plan.plan_id !== planId));
    setState({ mode: 'view', plan: null });
    setAnnouncement('Purchase plan deleted.');
    setNotice({ text: 'Plan deleted', planId: null });
  }

  /** Copies a rejected or withdrawn plan, then opens the new draft in the edit form. */
  async function copyPlan(source: PurchasePlan) {
    if (!canEdit || !service.revise || state.mode !== 'view') return;
    clearFeedback();
    setWritingServices(previous => new Set(previous).add(service));
    let response;
    try {
      response = await service.revise(source.plan_id);
    } catch (error) {
      if (activeContext.current !== context) { reconcilePreviousWrite(); return; }
      // The copy may have saved even though the reply failed, so re-read before offering it again.
      setCopyError(requestError(error).detail);
      setAttempt(value => value + 1);
      return;
    } finally {
      finishWrite();
    }
    if (activeContext.current !== context) { reconcilePreviousWrite(); return; }
    invalidate.current?.();
    const message = scenarioError(response.plan);
    if (message) { setState({ mode: 'error', message }); return; }
    setPlans(previous => [...previous, response.plan]);
    setTab('todo');
    setState({ mode: 'form', plan: response.plan });
  }

  function clearFeedback() {
    setAnnouncement('');
    setNotice(null);
    setCopyError('');
  }

  function finishWrite() {
    if (!activeContext.current) return;
    setWritingServices(previous => {
      const remaining = new Set(previous);
      remaining.delete(service);
      return remaining;
    });
  }

  // A write may have reached storage after the new scenario's read. Re-read that
  // account, but never bring a previous account's results into the current one.
  function reconcilePreviousWrite() {
    if (activeContext.current?.service !== service) return;
    invalidate.current?.();
    setAttempt(value => value + 1);
  }

  const listed = plans;
  const filteredPlans = canEdit ? plans.filter(p => planGroup(p) === tab) : listed.filter(p => filter === 'all' || (filter === 'open'
    ? !['rejected', 'withdrawn', 'purchased', 'closed'].includes(p.status ?? 'draft')
    : filter === 'finished' ? ['rejected', 'withdrawn', 'purchased', 'closed'].includes(p.status ?? 'draft') : p.status === filter));
  // After a plan is saved or copied, open the page that shows it.
  const highlighted = notice?.planId ?? null;
  useEffect(() => {
    if (!highlighted) return;
    const index = sortPlans(filteredPlans, sort).findIndex(plan => plan.plan_id === highlighted);
    if (index >= 0) setPlanPage(Math.floor(index / PLANS_PAGE_SIZE) + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the highlighted plan changes
  }, [highlighted]);
  const copies = new Map(plans.flatMap(p => p.previous_plan_id ? [[p.previous_plan_id, p.plan_id] as const] : []));

  return <main className="purchase-plan">
    <div className="pp-sr-only" role="status">{announcement}</div>
    {state.mode === 'loading' ? isManager ? <ManagerPlansLoading /> : <LoadingState /> : <>
      <header className="pp-heading">
        <div><h1>{canEdit ? "Purchase plans" : "Organisation purchase plans"}</h1><p>{saving ? 'Saving your purchase plan...' : canEdit ? 'Manage your purchase quantity and deadline.' : isAdmin ? 'Read-only access to your organisation’s purchase plans, approval status and saved decisions.' : 'Review your officers’ requests, track their purchasing, and follow up on the plans you’ve decided.'}</p></div>
        {canEdit && <div className="pp-create">
          {/* Fades out on its own (CSS); hovering holds it. The role="status" above announces it. */}
          {notice && <span className="pp-notice" onAnimationEnd={() => setNotice(null)}><Icon name="check" />{notice.text}</span>}
          <PlanButton variant="secondary" className="pp-icon-button" aria-label="Refresh plans" title="Refresh plans" disabled={writing || state.mode === 'form' || showDelete} onClick={() => {
            clearFeedback();
            invalidate.current?.();
            if (decisions?.service === service) decisions.refresh();
            setAttempt(value => value + 1);
          }}><Icon name="refresh" /></PlanButton>
          <PlanButton ref={createRef} disabled={writing || state.mode !== 'view'} onClick={() => {
            clearFeedback(); setState({ mode: 'form', plan: null });
          }}><Icon name="plus" />Create plan</PlanButton>
        </div>}
      </header>
      {isManager && service.notifications && <ApprovalInbox service={service} />}
      {isManager && service.managerOverview && <ManagerTeamOverview service={service} />}
      {writing && state.mode === 'view' && <p role="status">Finishing your previous plan change before another edit can be made.</p>}
      {state.mode === 'error' && <section className="pp-card pp-load-error" aria-label="Unable to load purchase plan">
        <h2>Unable to load your purchase plan</h2>
        <ErrorBanner>{state.message}</ErrorBanner>
        <PlanButton onClick={() => setAttempt(value => value + 1)}>Retry</PlanButton>
      </section>}
      {/* Managers' and admins' Plans section loads, filters and refreshes on its own, like the Approval inbox. */}
      {(isManager || isAdmin) && state.mode === 'view' && <ManagerPlans service={service} audience={isAdmin ? 'admin' : 'manager'} />}
      {/* Admins get the organisation's figures under their Plans section; managers have theirs above it. */}
      {isAdmin && state.mode === 'view' && service.managerOverview && <ManagerTeamOverview service={service} audience="admin" />}
      {!isManager && !isAdmin && state.mode === 'view' && listed.length === 0 && <section className="pp-empty" aria-label="No purchase plan">
        <p>{canEdit ? "You haven't created a purchase plan yet." : 'No purchase plans have been assigned to this organisation yet.'}</p>
      </section>}
      {state.mode === 'view' && copyError && <div className="pp-copy-error"><ErrorBanner>{copyError}</ErrorBanner></div>}
      {!isManager && !isAdmin && state.mode === 'view' && listed.length > 0 && <>
        <section ref={plansSection} className="pp-card pp-plans-panel" aria-label={canEdit ? 'Your plans' : 'Plans'}>
        {canEdit ? <div className="pp-list-heading">
          <h2 className="pp-sr-only">Your plans</h2>
          <div className="pp-tabs" role="group" aria-label="Plan filter">
            {PLAN_GROUPS.map(group => <button type="button" key={group.id} aria-pressed={tab === group.id} onClick={() => setTab(group.id)}>
              {group.label} ({plans.filter(plan => planGroup(plan) === group.id).length})
            </button>)}
          </div>
          <div className="pp-sort-select">
            <label htmlFor={sortId}>Sort by</label>
            <span className="pp-select">
              <select id={sortId} value={sort} onChange={event => setSort(event.target.value as PlanSort)}>
                <option value="deadline">Deadline</option>
                <option value="volume">Volume</option>
              </select>
              <Icon name="chevron-down" />
            </span>
          </div>
        </div> : <div className="pp-list-heading">
          <h2>Plans</h2>
          <div className="pp-filter" role="group" aria-label="Plan filter">
            {(isAdmin ? ['all', 'submitted', 'approved', 'rejected'] as const : ['all', 'open', 'finished'] as const).map(option => <button type="button" key={option} aria-pressed={filter === option} onClick={() => setFilter(option)}>{option === 'all' ? 'All' : option === 'open' ? 'Open' : option === 'finished' ? 'Finished' : option === 'submitted' ? 'Pending approval' : option === 'approved' ? 'Approved' : 'Rejected'}</button>)}
          </div>
          <div className="pp-sort" role="group" aria-labelledby="pp-sort-label">
            <span className="pp-sort-label" id="pp-sort-label">Sort by</span>
            {(['deadline', 'volume'] as const).map(option => <button key={option} type="button" aria-pressed={sort === option}
              onClick={() => setSort(option)}>{option === 'deadline' ? 'Deadline' : 'Volume'}</button>)}
          </div>
        </div>}
        {/* The team's plan totals sit inside the Plans card, under its heading. */}
        {!canEdit && <PlanOverview plans={listed} />}
        {filteredPlans.length === 0 && <p role="status">{canEdit ? PLAN_GROUPS.find(group => group.id === tab)!.empty : `No ${filter === 'submitted' ? 'plans pending approval' : `${filter} plans`}.`}</p>}
        {(() => {
          const ordered = sortPlans(filteredPlans, sort);
          const pageCount = Math.max(1, Math.ceil(ordered.length / PLANS_PAGE_SIZE));
          // Stay on the last page that still exists after a filter or a deletion.
          const current = Math.min(planPage, pageCount);
          const shown = ordered.slice((current - 1) * PLANS_PAGE_SIZE, current * PLANS_PAGE_SIZE);
          // Empty slots keep a short last page the same size, so the pager does not jump.
          const spacers = pageCount > 1 ? PLANS_PAGE_SIZE - shown.length : 0;
          const changePage = (next: number) => {
            setPlanPage(next);
            const top = plansSection.current?.getBoundingClientRect().top;
            if (top !== undefined && top < 0) plansSection.current?.scrollIntoView?.({ block: 'start' });
          };
          return <>
        <div className="pp-plan-grid pp-plan-grid--paged">{shown.map(plan => <PurchasePlanSummary canEdit={canEdit} key={plan.plan_id} plan={plan} service={service} busy={writing}
          saved={notice?.planId === plan.plan_id}
          copiedPlanId={copies.get(plan.plan_id)}
          onCopy={service.revise ? () => void copyPlan(plan) : undefined}
          editRef={state.plan?.plan_id === plan.plan_id ? editRef : undefined}
          deleteRef={state.plan?.plan_id === plan.plan_id ? deleteRef : undefined} onEdit={() => {
            clearFeedback(); setState({ mode: 'form', plan });
          }} onDelete={() => { clearFeedback(); setState({ mode: 'view', plan }); setShowDelete(true); }} />)}
          {Array.from({ length: spacers }, (_, i) => <div key={`spacer-${i}`} aria-hidden="true" className="pp-plan-spacer" />)}</div>
        {ordered.length > 0 && pageCount > 1 && <div className="pp-pager-bar">
          <p className="pp-page-summary">Showing {(current - 1) * PLANS_PAGE_SIZE + 1}–{Math.min(current * PLANS_PAGE_SIZE, ordered.length)} of {ordered.length}</p>
          <Pagination page={current} pageCount={pageCount} onChange={changePage} label="Plan pages" />
        </div>}
          </>;
        })()}
        </section>
      </>}
      {canEdit && state.mode === 'form' && state.plan?.previous_plan_id && <PreviousPlanNote plan={state.plan} service={service} />}
      {canEdit && state.mode === 'form' && <PurchasePlanForm plan={state.plan} scenarioDate={scenarioDate} onSave={save} onBusyChange={busy => {
        if (activeContext.current === context) setSaving(busy);
      }} onCancel={() => {
        focusAfterRender.current = state.plan ? 'edit' : 'create';
        setState({ mode: 'view', plan: state.plan });
      }} />}
      {canEdit && showDelete && <DeletePlanDialog description={state.mode === 'view' && state.plan ? `${state.plan.quantity_mt.toLocaleString('en-GB')} MT · due ${formatDate(state.plan.purchase_deadline)}` : undefined} onCancel={() => setShowDelete(false)} onDelete={remove} />}
    </>}
  </main>;
}

type PlanSort = 'deadline' | 'volume';

type PlanGroup = 'todo' | 'awaiting' | 'finished';

const PLAN_GROUPS: { id: PlanGroup; label: string; empty: string }[] = [
  { id: 'todo', label: 'To do', empty: 'Nothing to do right now.' },
  { id: 'awaiting', label: 'Awaiting approval', empty: 'No plans awaiting approval.' },
  { id: 'finished', label: 'Finished', empty: 'No finished plans.' },
];

/** Whose move it is. Rejected plans are Finished because copying is optional and the original can never leave To do. */
function planGroup(plan: PurchasePlan): PlanGroup {
  const status = plan.status ?? 'draft';
  return status === 'draft' || status === 'approved' ? 'todo' : status === 'submitted' ? 'awaiting' : 'finished';
}

/** Display order only; the saved plans are not changed. ISO dates sort as strings; ties keep their saved order. */
function sortPlans(plans: PurchasePlan[], sort: PlanSort) {
  return [...plans].sort((a, b) => sort === 'volume'
    ? b.quantity_mt - a.quantity_mt || a.purchase_deadline.localeCompare(b.purchase_deadline)
    : a.purchase_deadline.localeCompare(b.purchase_deadline));
}

/** Page summary derived from the loaded plans. Numbers and units are separate elements so they read as one value. */
/** "Active" means drafts and requests awaiting approval. */
function PlanOverview({ plans }: { plans: PurchasePlan[] }) {
  const active = plans.filter(plan => !plan.status || plan.status === 'draft' || plan.status === 'submitted');
  const upcoming = active.filter(plan => plan.days_remaining >= 0);
  const overdue = active.length - upcoming.length;
  const next = upcoming.reduce<PurchasePlan | undefined>((soonest, plan) => !soonest || plan.days_remaining < soonest.days_remaining ? plan : soonest, undefined);
  const deadlineDate = next && new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${next.purchase_deadline}T00:00:00Z`));
  return <section className="pp-overview" aria-label="Plan summary">
    <div><span className="pp-overview-label">Active plans</span><span className="pp-overview-value">{active.length}</span></div>
    <div className={overdue ? 'pp-overview--alert' : undefined}>
      <span className="pp-overview-label">Overdue plans</span>
      <span className="pp-overview-value">{overdue > 0 && <Icon name="alert" />}{overdue}</span>
    </div>
    <div>
      <span className="pp-overview-label">Next deadline</span>
      {next
        ? <span className="pp-overview-value">{next.days_remaining === 0 ? 'Today' : <>{next.days_remaining}<span className="pp-overview-unit">{next.days_remaining === 1 ? 'day' : 'days'}</span></>}
          <span className="pp-overview-note">· {deadlineDate}</span></span>
        : <span className="pp-overview-value pp-overview-value--empty">None upcoming</span>}
    </div>
  </section>;
}
