import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLink } from '../../app/router';
import { formatDate } from '../purchase-plan/dates';
import { requestError, type PlanAnalysis, type PurchasePlan, type PurchasePlanService, type SubmittedRecommendation, type ApprovalDecision } from '../purchase-plan/types';
import type { Horizon } from '../forecast/apiService';
import { ManagerDecisionForm } from './ManagerDecisionForm';
import { EvidenceView } from './RecommendationEvidence';

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
  return <section className="rec-approval" aria-label="Request recommendation approval">
    <h3>Request approval for this recommendation</h3>
    <p>Plan recommendation: <strong>{guidance?.action.replaceAll('_', ' ')}</strong>. This recommendation considers the available forecasts within your purchase deadline.</p>
    {referenceOnly ? <p>This request uses the observed reference price for buying now. No supported forecast cost is available within the deadline.</p>
      : <p>Cost detail included: <strong>{horizon}-day forecast</strong>{forecast ? ` · target ${formatDate(forecast.target_date)}` : ''}.</p>}
    <p>Every manager in your organisation will receive the plan recommendation, its reasons and this selected cost detail.</p>
    {!valid && <p>A saved draft and a current priced recommendation are required.</p>}
    {error && <p role="alert">{error} Your selection has not been confirmed. Refresh the page if the plan or forecast changed.</p>}
    {confirm ? <div>
      <p><strong>Confirm this choice?</strong> The plan and this recommendation will be locked for review.</p>
      <div className="rec-approval-actions"><button className="bb-button bb-button--secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel request</button>
      <button className="bb-button" disabled={busy || !valid} onClick={submit}>{busy ? 'Submitting request…' : 'Confirm approval request'}</button></div>
    </div> : <button className="bb-button" disabled={!valid} onClick={() => setConfirm(true)}>Request approval for this recommendation</button>}
  </section>;
}

export function SubmittedRecommendationView({ plan, planService, canDecide = false }: { plan: PurchasePlan; planService: PurchasePlanService; canDecide?: boolean }) {
  const scope = useMemo(() => ({}), [planService, plan.plan_id]);
  const [result, setResult] = useState<{ scope: object; submission?: SubmittedRecommendation | null; decision?: ApprovalDecision | null; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (!planService.readSubmission) { setResult({ scope, error: 'Submitted recommendation loading is unavailable.' }); return; }
    planService.readSubmission(plan.plan_id).then(({ submission, decision }) => { if (active) setResult({ scope, submission, decision }); })
      .catch(error => { if (active) setResult({ scope, error: requestError(error).detail }); });
    return () => { active = false; };
  }, [scope, attempt]);
  const current = result?.scope === scope ? result : undefined;
  const submission = current?.submission;
  const decision = current?.decision;
  const status = decision?.decision ?? plan.status;
  const refreshDecision = () => { setResult(undefined); setAttempt(value => value + 1); };
  const analysis = submission?.analysis;
  const rec = analysis?.recommendation.status === 'ready' ? analysis.recommendation.value : undefined;
  const cost = analysis?.cost_impact.status === 'ready' ? analysis.cost_impact.value : undefined;
  const usd = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  return <main className="recommendations">
    <header className="rec-header"><div><p className="rec-eyebrow">Approval request · {status}</p><h1>Submitted recommendation</h1>
    <p>Saved at submission. These estimates do not change when a new forecast is published.</p></div><AppLink href="/purchase-plans">Back to purchase plans</AppLink></header>
    {decision && <section className={`rec-card rec-decision rec-decision--${decision.decision}`} aria-label="Approval decision">
      <h2>{decision.decision === 'approved' ? 'Recommendation approved' : 'Recommendation rejected'}</h2>
      <p>Decided by {decision.manager_label} · {new Date(decision.decided_at).toLocaleString('en-GB')}</p>
      {decision.manager_label !== decision.manager_clerk_user_id && <p className="rec-context">Manager account: {decision.manager_clerk_user_id}</p>}
      {decision.comment && <p className="rec-decision-comment">{decision.comment}</p>}
      <p>The decision is final for this request. No purchase has been executed by the app.</p>
    </section>}
    {!current ? <p role="status">Loading submitted recommendation…</p> : current.error ? <section className="rec-card" role="alert"><p>{current.error}</p><button className="bb-button" onClick={() => { setResult(undefined); setAttempt(value => value + 1); }}>Retry submission</button></section>
      : !analysis || !submission ? <section className="rec-card"><h2>Earlier plan-only submission</h2><p>This request was submitted before recommendation snapshots were introduced. No selected recommendation was saved.</p></section>
      : <section className="rec-card" aria-label="Saved recommendation for approval">
        <h2>Plan recommendation · {rec?.action.replaceAll('_', ' ')}</h2>
        {cost ? <p>Saved cost detail: {submission.horizon_days}-day forecast{analysis.forecast.status === 'ready' ? ` · target ${formatDate(analysis.forecast.value.target_date)}` : ''}.</p>
          : <p>Reference-price-only request. No supported forecast cost was available within the deadline.</p>}
        <p>{analysis.context.quantity_mt.toLocaleString('en-GB')} MT · Deadline {formatDate(analysis.context.purchase_deadline)}</p>
        <p>Planning date: {formatDate(analysis.context.scenario_as_of_date)} · Urgency: {analysis.context.urgency ?? 'NORMAL'}</p>
        {plan.submitted_at && <p>Submitted: {new Date(plan.submitted_at).toLocaleString('en-GB')}</p>}
        <p>{rec?.explanation}</p>
        {cost && <dl className="rec-evidence-grid"><div><dt>Saved reference cost</dt><dd>{usd(cost.reference_total)}</dd></div>
          <div><dt>Saved estimated total</dt><dd>{cost.central_total == null ? 'Unavailable' : usd(cost.central_total)}</dd></div>
          <div><dt>Saved experimental cost range</dt><dd>{usd(cost.forecast_total.lower)}–{usd(cost.forecast_total.upper)}</dd></div></dl>}
        <EvidenceView analysis={analysis} />
        {canDecide && status === 'submitted' && !decision && planService.decide && analysis.approval_fingerprint
          && <ManagerDecisionForm key={`${plan.plan_id}:${analysis.approval_fingerprint}`} planId={plan.plan_id}
            fingerprint={analysis.approval_fingerprint} service={planService} onDecided={refreshDecision} onRefresh={refreshDecision} />}
        {analysis.forecast.status === 'ready' && <p className="rec-context">Model version: {analysis.forecast.value.model_version} · Forecast run: {analysis.forecast.value.run_id}</p>}
      </section>}
  </main>;
}
