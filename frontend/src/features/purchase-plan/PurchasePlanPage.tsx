import { useEffect, useMemo, useRef, useState } from 'react';
import { DeletePlanDialog } from './components/DeletePlanDialog';
import { ErrorBanner, Icon, LoadingState, PlanButton } from './components/Primitives';
import { PurchasePlanForm } from './components/PurchasePlanForm';
import { PurchasePlanSummary } from './components/PurchasePlanSummary';
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
  /** Required even before a plan exists: the API's null response has no date. */
  scenarioDate: string;
  /** Future analysis consumers clear cached results on context changes or successful writes. */
  onInvalidateAnalysis?: () => void;
}

export function PurchasePlanPage({ service, scenarioDate, onInvalidateAnalysis, canEdit = true }: PurchasePlanPageProps) {
  const [state, setState] = useState<PageState>({ mode: 'loading' });
  const [plans, setPlans] = useState<PurchasePlan[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [announcement, setAnnouncement] = useState('');
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
    return () => { activeContext.current = null; };
  }, [context]);
  // Sharing this promise avoids consuming fail-once fixtures twice in StrictMode.
  const readRequest = useRef<{ context: typeof context; attempt: number; promise: ReturnType<PurchasePlanService['list']> } | null>(null);

  function scenarioError(plan: PurchasePlan | null): string | null {
    return plan && plan.scenario_as_of_date !== scenarioDate
      ? 'Your plan has not been refreshed for the active historical scenario. Please retry.'
      : null;
  }

  useEffect(() => {
    let current = true;
    setState({ mode: 'loading' });
    setShowDelete(false);
    setSaving(false);
    setAnnouncement('');
    focusAfterRender.current = null;
    if (!readRequest.current || readRequest.current.context !== context || readRequest.current.attempt !== attempt) {
      readRequest.current = { context, attempt, promise: service.list() };
    }
    readRequest.current.promise.then(({ plans }) => {
      if (!current) return;
      const message = plans.map(scenarioError).find(Boolean);
      setPlans(plans);
      setState(message ? { mode: 'error', message } : { mode: 'view', plan: null });
    }).catch(error => {
      if (current) setState({ mode: 'error', message: requestError(error).detail });
    });
    return () => { current = false; };
  }, [context, attempt]);

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
    setAnnouncement('Purchase plan saved.');
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

  return <main className="purchase-plan">
    <div className="pp-sr-only" role="status">{announcement}</div>
    {state.mode === 'loading' ? <LoadingState /> : <>
      <header className="pp-heading">
        <div><h1>{canEdit ? "Purchase plans" : "Organisation purchase plans"}</h1><p>{saving ? 'Saving your purchase plan...' : canEdit ? 'Manage your purchase quantity and deadline.' : 'View plans in your organisation. Only buyers can create or change their own plans.'}</p></div>
        {canEdit && <div className="pp-create">
          <PlanButton ref={createRef} disabled={writing || state.mode !== 'view'} onClick={() => {
            setAnnouncement(''); setState({ mode: 'form', plan: null });
          }}><Icon name="plus" />Create plan</PlanButton>
        </div>}
      </header>
      {writing && state.mode === 'view' && <p role="status">Finishing your previous plan change before another edit can be made.</p>}
      {state.mode === 'error' && <section className="pp-card pp-load-error" aria-label="Unable to load purchase plan">
        <h2>Unable to load your purchase plan</h2>
        <ErrorBanner>{state.message}</ErrorBanner>
        <PlanButton onClick={() => setAttempt(value => value + 1)}>Retry</PlanButton>
      </section>}
      {state.mode === 'view' && plans.length === 0 && <section className="pp-empty" aria-label="No purchase plan">
        <p>{canEdit ? "You haven't created a purchase plan yet." : 'No purchase plans have been assigned to this organisation yet.'}</p>
      </section>}
      {state.mode === 'view' && plans.map(plan => <PurchasePlanSummary canEdit={canEdit} key={plan.plan_id} plan={plan} busy={writing}
        editRef={state.plan?.plan_id === plan.plan_id ? editRef : undefined}
        deleteRef={state.plan?.plan_id === plan.plan_id ? deleteRef : undefined} onEdit={() => {
          setAnnouncement(''); setState({ mode: 'form', plan });
        }} onDelete={() => { setAnnouncement(''); setState({ mode: 'view', plan }); setShowDelete(true); }} />)}
      {canEdit && state.mode === 'form' && <PurchasePlanForm plan={state.plan} scenarioDate={scenarioDate} onSave={save} onBusyChange={busy => {
        if (activeContext.current === context) setSaving(busy);
      }} onCancel={() => {
        focusAfterRender.current = state.plan ? 'edit' : 'create';
        setState({ mode: 'view', plan: state.plan });
      }} />}
      {canEdit && showDelete && <DeletePlanDialog description={state.mode === 'view' && state.plan ? `${state.plan.quantity_mt.toLocaleString('en-GB')} MT - Due ${state.plan.purchase_deadline}` : undefined} onCancel={() => setShowDelete(false)} onDelete={remove} />}
    </>}
  </main>;
}
