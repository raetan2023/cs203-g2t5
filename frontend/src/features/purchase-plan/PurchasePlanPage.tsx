import { useEffect, useRef, useState } from 'react';
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
  /** Required even before a plan exists: the API's null response has no date. */
  scenarioDate: string;
}

export function PurchasePlanPage({ service, scenarioDate }: PurchasePlanPageProps) {
  const [state, setState] = useState<PageState>({ mode: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const createRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const focusAfterRender = useRef<'create' | 'edit' | null>(null);
  // Sharing this promise avoids consuming fail-once fixtures twice in StrictMode.
  const readRequest = useRef<{ service: PurchasePlanService; attempt: number; promise: ReturnType<PurchasePlanService['read']> } | null>(null);

  useEffect(() => {
    let current = true;
    setState({ mode: 'loading' });
    setShowDelete(false);
    if (!readRequest.current || readRequest.current.service !== service || readRequest.current.attempt !== attempt) {
      readRequest.current = { service, attempt, promise: service.read() };
    }
    readRequest.current.promise.then(({ plan }) => {
      if (current) setState({ mode: 'view', plan });
    }).catch(error => {
      if (current) setState({ mode: 'error', message: requestError(error).detail });
    });
    return () => { current = false; };
  }, [service, attempt]);

  useEffect(() => {
    if (state.mode === 'view' && focusAfterRender.current) {
      (focusAfterRender.current === 'create' ? createRef : editRef).current?.focus();
      focusAfterRender.current = null;
    }
  }, [state]);

  async function save(input: PlanInput) {
    if (state.mode !== 'form') return;
    const response = await (state.plan ? service.update(input) : service.create(input));
    focusAfterRender.current = 'edit';
    setState({ mode: 'view', plan: response.plan });
    setAnnouncement('Purchase plan saved.');
  }

  async function remove() {
    await service.delete();
    focusAfterRender.current = 'create';
    setShowDelete(false);
    setState({ mode: 'view', plan: null });
    setAnnouncement('Purchase plan deleted.');
  }

  const plan = state.mode === 'view' || state.mode === 'form' ? state.plan : null;
  return <main className="purchase-plan">
    <div className="pp-sr-only" role="status">{announcement}</div>
    {state.mode === 'loading' ? <LoadingState /> : <>
      <header className="pp-heading">
        <div><h1>Purchase plans</h1><p>{saving ? 'Saving your purchase plan...' : 'Manage your purchase quantity and deadline.'}</p></div>
        <div className="pp-create">
          {plan && state.mode === 'view' && <span id="pp-one-plan">You can save one purchase plan.</span>}
          <PlanButton ref={createRef} disabled={state.mode !== 'view' || !!plan} aria-describedby={plan && state.mode === 'view' ? 'pp-one-plan' : undefined} onClick={() => {
            setAnnouncement(''); setState({ mode: 'form', plan: null });
          }}><Icon name="plus" />Create plan</PlanButton>
        </div>
      </header>
      {state.mode === 'error' && <section className="pp-card pp-load-error" aria-label="Unable to load purchase plan">
        <h2>Unable to load your purchase plan</h2>
        <ErrorBanner>{state.message}</ErrorBanner>
        <PlanButton onClick={() => setAttempt(value => value + 1)}>Retry</PlanButton>
      </section>}
      {state.mode === 'view' && !state.plan && <section className="pp-empty" aria-label="No purchase plan">
        <p>You haven't created a purchase plan yet.</p>
      </section>}
      {state.mode === 'view' && state.plan && <PurchasePlanSummary plan={state.plan} editRef={editRef} deleteRef={deleteRef} onEdit={() => {
        setAnnouncement(''); setState({ mode: 'form', plan: state.plan });
      }} onDelete={() => { setAnnouncement(''); setShowDelete(true); }} />}
      {state.mode === 'form' && <PurchasePlanForm plan={state.plan} scenarioDate={state.plan?.scenario_as_of_date ?? scenarioDate} onSave={save} onBusyChange={setSaving} onCancel={() => {
        focusAfterRender.current = state.plan ? 'edit' : 'create';
        setState({ mode: 'view', plan: state.plan });
      }} />}
      {showDelete && <DeletePlanDialog onCancel={() => setShowDelete(false)} onDelete={remove} />}
    </>}
  </main>;
}
