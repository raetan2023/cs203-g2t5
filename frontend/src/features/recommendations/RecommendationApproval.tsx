import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLink } from '../../app/router';
import { formatDate } from '../purchase-plan/dates';
import { requestError, type PlanAnalysis, type PurchasePlan, type PurchasePlanService, type SubmissionResponse } from '../purchase-plan/types';
import type { Horizon } from '../forecast/apiService';
import { PreviousPlanNote } from '../purchase-plan/components/PreviousPlanNote';
import { PlanLifecycleActions, PurchaseOutcome } from './PlanLifecycleActions';
import { ManagerDecisionForm } from './ManagerDecisionForm';
import { EvidenceView } from './RecommendationEvidence';
import { actionLabel, amount, dayDate, readableDates, usd } from './format';
import { decisionTime } from '../purchase-plan/components/PlanDecisionNote';

export function RecommendationApproval({ analysis, plan, horizon, planService, onSubmitted }: {
  analysis: PlanAnalysis; plan: PurchasePlan; horizon: Horizon; planService: PurchasePlanService; onSubmitted(plan: PurchasePlan): void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const guidance = analysis.recommendation.status === 'ready' ? analysis.recommendation.value : undefined;
  const forecast = analysis.forecast.status === 'ready' ? analysis.forecast.value : undefined;
  const referenceOnly = guidance?.action === 'BUY_NOW' && analysis.reference.status === 'ready'
    && analysis.cost_impact.status === 'unavailable' && analysis.cost_impact.reason === 'unsupported_horizon';
  const valid = plan.status === 'draft' && !!planService.submit && analysis.source === 'api' && analysis.provenance === 'model'
    && !!guidance && !!forecast?.run_id && (analysis.cost_impact.status === 'ready' || referenceOnly)
    && !!analysis.approval_fingerprint?.match(/^[a-f0-9]{64}$/);

  async function submit() {
    if (!valid || !planService.submit || !forecast?.run_id || !guidance || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const { plan: saved } = await planService.submit(plan.plan_id, {
        horizon_days: horizon, run_id: forecast.run_id, recommendation_id: guidance.recommendation_id,
        approval_fingerprint: analysis.approval_fingerprint!, urgency: analysis.context.urgency ?? 'NORMAL',
        quantity_mt: plan.quantity_mt, purchase_deadline: plan.purchase_deadline,
        scenario_as_of_date: analysis.context.scenario_as_of_date,
      });
      if (active.current) onSubmitted(saved);
    } catch (failure) { if (active.current) setError(requestError(failure).detail); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <section className="rec-approval" aria-label="Submit for approval">
    {confirm ? <div className="rec-approval-confirm" role="group" aria-label="Confirm submission">
      <p><strong>Submit {guidance ? `“${guidance.action.replaceAll('_', ' ').toLowerCase()}”` : 'this recommendation'} for approval?</strong> The plan and this recommendation are locked while managers review it.</p>
      <div className="rec-approval-actions"><button className="bb-button bb-button--secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button>
      <button className="bb-button" disabled={busy || !valid} onClick={submit}>{busy ? 'Submitting…' : 'Confirm submission'}</button></div>
    </div> : <button className="bb-button rec-submit" disabled={!valid} onClick={() => setConfirm(true)}>Submit for approval</button>}
    {error && <p role="alert">{error} Your selection has not been confirmed. Refresh the page if the plan or forecast changed.</p>}
    {!valid && <p className="rec-approval-note">A saved draft and a current priced recommendation are required.</p>}
    {referenceOnly ? <p className="rec-approval-note">Uses the observed reference price for buying now. No supported forecast cost is available within the deadline.</p>
      : <p className="rec-approval-note">Cost detail included: <strong>{horizon}-day forecast</strong>{forecast ? ` · target ${formatDate(forecast.target_date)}` : ''}. Select an eligible date to change it.</p>}
    <p className="rec-approval-note">Every manager in your organisation receives the recommendation, its reasons and this cost detail.</p>
  </section>;
}

export function SubmittedRecommendationView({ plan, planService, canDecide = false, canAct = false, today = plan.scenario_as_of_date, onChanged, onReload }: {
  plan: PurchasePlan; planService: PurchasePlanService; canDecide?: boolean; canAct?: boolean; today?: string;
  onChanged?(plan: PurchasePlan): void; onReload?(): void;
}) {
  const scope = useMemo(() => ({}), [planService, plan.plan_id, plan.status, today]);
  const [result, setResult] = useState<Partial<SubmissionResponse> & { scope: object; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (!planService.readSubmission) { setResult({ scope, error: 'Submitted recommendation loading is unavailable.' }); return; }
    planService.readSubmission(plan.plan_id).then(data => { if (active) setResult({ scope, ...data }); })
      .catch(error => { if (active) setResult({ scope, error: requestError(error).detail }); });
    return () => { active = false; };
  }, [scope, attempt]);
  const current = result?.scope === scope ? result : undefined;
  const submission = current?.submission;
  const decision = current?.decision;
  const status = plan.status === 'purchased' || plan.status === 'withdrawn' ? plan.status : decision?.decision ?? plan.status;
  const refreshDecision = () => { setResult(undefined); setAttempt(value => value + 1); };
  const analysis = submission?.analysis;
  const rec = analysis?.recommendation.status === 'ready' ? analysis.recommendation.value : undefined;
  const cost = analysis?.cost_impact.status === 'ready' ? analysis.cost_impact.value : undefined;
  const saved = analysis?.forecast.status === 'ready' ? analysis.forecast.value : undefined;
  const quantity = (analysis?.context.quantity_mt ?? plan.quantity_mt).toLocaleString('en-GB', { maximumFractionDigits: 20 });
  const deadline = analysis?.context.purchase_deadline ?? plan.purchase_deadline;
  const approved = status === 'approved';
  const deciding = canDecide && status === 'submitted' && !decision && !!planService.decide && !!analysis?.approval_fingerprint;
  const nextStep = deciding ? 'Review the saved recommendation, then approve or reject it. The first decision is final.'
    : status === 'submitted' ? 'Await a manager decision, or withdraw this request if your plans change.'
    : status === 'purchased' ? 'The actual purchase is recorded below. The plan and approval history remain saved.'
    : status === 'withdrawn' ? 'This request was withdrawn. Copy it to a new draft to request approval again.'
    : approved ? 'Buy using a current supplier quote, then record the actual purchase. Approval does not place an order.'
    : 'This plan stays locked. Copy it to a new draft to review the quantity and deadline before submitting again.';
  const title = status === 'purchased' ? 'Purchase recorded' : status === 'withdrawn' ? 'Request withdrawn'
    : status === 'approved' ? 'Recommendation approved' : status === 'rejected' ? 'Recommendation rejected' : 'Awaiting manager approval';
  return <main className="recommendations">
    <header className="rec-header">
      <AppLink href="/purchase-plans" aria-label="Back to purchase plans"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>Purchase plans</AppLink>
      <h1>Submitted recommendation</h1>
      <p>{quantity} MT · due {dayDate(deadline, true)}{plan.submitted_at && <> · submitted <time dateTime={plan.submitted_at}>{decisionTime(plan.submitted_at)}</time></>}</p>
    </header>
    {plan.previous_plan_id && <PreviousPlanNote plan={plan} service={planService} />}
    {!current ? <section className="rec-card" role="status"><h2>Loading submitted recommendation…</h2><div className="rec-skeleton" aria-hidden="true" /></section>
      : current.error ? <section className="rec-card rec-error" role="alert"><h2>Couldn’t load this request</h2><p>{current.error}</p><button className="bb-button" onClick={refreshDecision}>Retry submission</button></section>
      : <div className="rec-layout">
        <section className={`rec-answer rec-status rec-status--${status}`} aria-label="Approval status">
          <div className="rec-verdict">
            <span className="rec-verdict-icon" aria-hidden="true"><StatusIcon status={status} /></span>
            <div><span className="rec-kicker">Approval status</span>
              <h2>{title}</h2>
              <p className="rec-tagline">{decision ? <>Decided by {decision.manager_label} · <time dateTime={decision.decided_at}>{decisionTime(decision.decided_at)}</time></>
                : status === 'withdrawn' ? 'Managers can no longer approve this request.' : 'All managers in your organisation have been notified. The plan is locked while it’s reviewed.'}</p>
              {decision && decision.manager_label !== decision.manager_clerk_user_id && <p className="rec-context">Manager account: {decision.manager_clerk_user_id}</p>}
            </div>
          </div>
          {decision?.comment && <div className="rec-status-comment"><span className="rec-kicker">{decision.decision === 'approved' ? 'Manager’s comment' : 'Reason for rejection'}</span><p className="rec-decision-comment">{decision.comment}</p></div>}
          <p className="rec-next"><strong>Next step</strong> {nextStep}</p>
          {current.withdrawal && <p>Withdrawn {decisionTime(current.withdrawal.withdrawn_at)}{current.withdrawal.reason && ` · ${current.withdrawal.reason}`}</p>}
          {canAct && <PlanLifecycleActions key={`${plan.plan_id}:${status}:${today}`} plan={{ ...plan, status }} data={{ ...current, submission: submission ?? null }}
            service={planService} today={today} onChanged={saved => onChanged?.(saved)} onReload={onReload ?? refreshDecision} />}
          {!canAct && current.revision_plan_ids?.map(id => <p key={id}><AppLink href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(id)}`}>View copied plan</AppLink></p>)}
          {deciding && <ManagerDecisionForm key={`${plan.plan_id}:${analysis!.approval_fingerprint}`} planId={plan.plan_id}
            fingerprint={analysis!.approval_fingerprint!} service={planService} onDecided={refreshDecision} onRefresh={refreshDecision} />}
        </section>

        <aside className="rec-rail" aria-label="Saved recommendation summary">
          <div className="rec-rail-card">
            <div><span className="rec-kicker">Saved recommendation</span><strong className="rec-rail-action">{rec ? actionLabel(rec.action) : 'Not saved'}</strong></div>
            <dl className="rec-rail-facts">
              <div><dt>Plan</dt><dd>{quantity} MT</dd></div>
              <div><dt>Deadline</dt><dd>{dayDate(deadline)}</dd></div>
              {submission && <div><dt>Cost detail</dt><dd>{cost ? `${submission.horizon_days}-day${saved ? ` · ${dayDate(saved.target_date)}` : ''}` : 'Reference price'}</dd></div>}
              {cost && <div><dt>Saved estimate</dt><dd>{cost.central_total == null ? `${usd(cost.forecast_total.lower)}–${amount(cost.forecast_total.upper)}` : usd(cost.central_total)}</dd></div>}
            </dl>
          </div>
          <p className="rec-rail-note">Saved at submission. These figures don’t change when new prices are published.</p>
        </aside>

        <div className="rec-evidence">
          <PurchaseOutcome data={{ ...current, submission: submission ?? null }} />
          {!analysis || !submission ? <section className="rec-card"><h2>Earlier plan-only submission</h2><p>This request was submitted before recommendation snapshots were introduced. No selected recommendation was saved.</p></section>
            : <section className="rec-detail" aria-label="Saved recommendation for approval">
              <div className="rec-section-head"><div>
                <h2>Plan recommendation · {rec?.action.replaceAll('_', ' ')}</h2>
                {rec && <p>{readableDates(rec.explanation)}</p>}
              </div></div>
              {cost ? <dl className="rec-detail-grid">
                <div><dt>Saved reference cost</dt><dd>{usd(cost.reference_total)}</dd></div>
                <div><dt>Saved estimated total</dt><dd>{cost.central_total == null ? 'Unavailable' : usd(cost.central_total)}</dd></div>
                <div><dt>Saved experimental cost range</dt><dd>{usd(cost.forecast_total.lower)}–{amount(cost.forecast_total.upper)}</dd></div>
              </dl> : <p className="rec-detail-note">Reference-price-only request. No supported forecast cost was available within the deadline.</p>}
              <div className="rec-detail-foot">
                <span>Cost detail: {submission.horizon_days}-day forecast{saved ? ` · target ${formatDate(saved.target_date)}` : ''}</span>
                <span>Planning date {formatDate(analysis.context.scenario_as_of_date)} · Urgency {analysis.context.urgency ?? 'NORMAL'}</span>
                {saved && <span>Model {saved.model_version} · run {saved.run_id}</span>}
              </div>
            </section>}
          {analysis && <details className="rec-fine"><summary>How this recommendation was calculated</summary>
            <div className="rec-fine-body"><EvidenceView analysis={analysis} /></div></details>}
        </div>
      </div>}
  </main>;
}

function StatusIcon({ status }: { status?: string }) {
  const path = status === 'approved' || status === 'purchased' ? <path d="M5 12.5l4.5 4.5L19 7.5" />
    : status === 'rejected' || status === 'withdrawn' ? <path d="M6 6l12 12M18 6L6 18" />
    : <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>;
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
}
