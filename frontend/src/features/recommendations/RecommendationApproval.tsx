import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppLink } from '../../app/router';
import { formatDate, formatDateTime } from '../purchase-plan/dates';
import { requestError, type PlanAnalysis, type PurchasePlan, type PurchasePlanService, type SubmissionResponse } from '../purchase-plan/types';
import type { Horizon } from '../forecast/apiService';
import { PreviousPlanNote } from '../purchase-plan/components/PreviousPlanNote';
import { PlanLifecycleActions, PurchaseOutcome } from './PlanLifecycleActions';
import { ManagerDecisionForm } from './ManagerDecisionForm';
import { EvidenceView } from './RecommendationEvidence';
import { RecommendationReportDownload } from './RecommendationReportDownload';
import { submittedReportInput } from './recommendationReport';
import { actionLabel, amount, currencyAmount, readableDates, usd } from './format';

export const SUBMIT_LABEL = 'Accept and submit for approval';

/** Accepting and submitting are one step for the officer; the backend still requires the Accept to be on record first. */
export function RecommendationApproval({ analysis, plan, horizon, planService, onSubmitted, refresh }: {
  analysis: PlanAnalysis; plan: PurchasePlan; horizon: Horizon; planService: PurchasePlanService; onSubmitted(plan: PurchasePlan): void; refresh?: ReactNode;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const guidance = analysis.recommendation.status === 'ready' ? analysis.recommendation.value : undefined;
  const forecast = analysis.forecast.status === 'ready' ? analysis.forecast.value : undefined;
  const upcoming = !!forecast && forecast.target_date > plan.scenario_as_of_date;
  const referenceOnly = guidance?.action === 'BUY_NOW' && analysis.reference.status === 'ready'
    && analysis.cost_impact.status === 'unavailable' && analysis.cost_impact.reason === 'unsupported_horizon';
  // Monitor means "not yet": it can't be submitted, and the plan stays a draft.
  const monitoring = guidance?.action === 'MONITOR';
  const valid = !monitoring && plan.status === 'draft' && !!planService.submit && analysis.source === 'api' && analysis.provenance === 'model'
    && !!guidance && !!forecast?.run_id && upcoming && (analysis.cost_impact.status === 'ready' || referenceOnly)
    && !!analysis.approval_fingerprint?.match(/^[a-f0-9]{64}$/);

  async function submit() {
    if (!valid || !planService.submit || !forecast?.run_id || !guidance || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      await planService.recordRecommendationDecision?.(plan.plan_id, { recommendationId: guidance.recommendation_id, runId: forecast.run_id,
        action: guidance.action, decision: 'accept', reason: '' });
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
      <p><strong>Accept {guidance ? `“${actionLabel(guidance.action).toLowerCase()}”` : 'this recommendation'} and submit it for approval?</strong> The plan and this recommendation are locked while managers review it.</p>
      <div className="rec-approval-actions"><button className="bb-button bb-button--secondary" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button>
      <button className="bb-button" disabled={busy || !valid} onClick={submit}>{busy ? 'Submitting…' : 'Confirm submission'}</button></div>
    </div> : <div className="rec-approval-row">
      <button className={valid ? 'bb-button rec-submit' : 'bb-button bb-button--secondary rec-submit'} disabled={!valid} onClick={() => setConfirm(true)}>{SUBMIT_LABEL}</button>
      {refresh}
    </div>}
    {error && <p role="alert">{error} Nothing was submitted. Refresh the page if the plan or forecast changed.</p>}
    {monitoring ? <p className="rec-approval-note">Monitoring, check again tomorrow. A Monitor recommendation can’t be submitted for approval.</p>
      : !upcoming ? <p className="rec-approval-note">An updated {horizon}-day forecast is required before submitting.</p>
      : !valid ? <p className="rec-approval-note">A saved draft and a current priced recommendation are required.</p>
      : referenceOnly ? <p className="rec-approval-note">Uses the observed reference price for buying now. No supported forecast cost is available within the deadline.</p>
      : null}
    <p className="rec-approval-note">Every manager in your organisation receives the recommendation, its reasons and the selected cost detail.</p>
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
  const status = plan.status === 'purchased' || plan.status === 'withdrawn' || plan.status === 'closed' ? plan.status : decision?.decision ?? plan.status;
  const completedManagerView = canDecide && status === 'purchased' && !!current?.purchase;
  const report = (canDecide || canAct) && submission && submittedReportInput({ ...plan, status }, submission);
  const refreshDecision = () => { setResult(undefined); setAttempt(value => value + 1); };
  const analysis = submission?.analysis;
  const rec = analysis?.recommendation.status === 'ready' ? analysis.recommendation.value : undefined;
  const reference = analysis?.reference.status === 'ready' ? analysis.reference.value : undefined;
  const cost = analysis?.cost_impact.status === 'ready' ? analysis.cost_impact.value : undefined;
  const saved = analysis?.forecast.status === 'ready' ? analysis.forecast.value : undefined;
  const quantityMt = analysis?.context.quantity_mt ?? plan.quantity_mt;
  const quantity = quantityMt.toLocaleString('en-GB', { maximumFractionDigits: 20 });
  const forecastDate = cost?.target_date ?? saved?.target_date;
  const marketPrice = reference?.price ?? (cost && cost.reference_total / quantityMt);
  const marketTotal = cost?.reference_total ?? (marketPrice != null ? marketPrice * quantityMt : undefined);
  const comparison = current?.comparison;
  const pricesInPurchase = !!current?.purchase && !!comparison
    && (marketTotal == null || comparison.reference_total != null)
    && (cost?.central_total == null || comparison.central_total != null)
    && (!cost?.forecast_total || !!comparison.forecast_total);
  const deadline = analysis?.context.purchase_deadline ?? plan.purchase_deadline;
  const approved = status === 'approved';
  const deciding = canDecide && status === 'submitted' && !decision && !!planService.decide && !!analysis?.approval_fingerprint;
  const nextStep = deciding ? 'Review the saved recommendation, then approve or reject it. The first decision is final.'
    : !canAct ? 'Read-only access to the saved request, manager decision and purchase history.' : status === 'submitted' ? 'Await a manager decision.'
    : status === 'purchased' ? 'The actual purchase is recorded below. The plan and approval history remain saved.'
    : status === 'withdrawn' ? 'This request was withdrawn. Copy it to a new draft to request approval again.'
    : status === 'closed' ? 'Closed because the officer is no longer a procurement officer. It can no longer be bought.'
    : approved ? 'Buy using a current supplier quote, then record the actual purchase. Approval does not place an order.'
    : 'This plan stays locked. Copy it to a new draft to review the quantity and deadline before submitting again.';
  const title = status === 'purchased' ? 'Purchase recorded' : status === 'withdrawn' ? 'Request withdrawn' : status === 'closed' ? 'Plan closed'
    : status === 'approved' ? 'Recommendation approved' : status === 'rejected' ? 'Recommendation rejected' : 'Awaiting manager approval';
  return <main className="recommendations">
    <header className="rec-header">
      <AppLink href="/purchase-plans" aria-label="Back to purchase plans"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>Purchase plans</AppLink>
      <h1>Submitted recommendation</h1>
      <p>{quantity} MT · due {formatDate(deadline)}{plan.submitted_at && <> · submitted <time dateTime={plan.submitted_at}>{formatDateTime(plan.submitted_at)}</time></>}</p>
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
              <p className="rec-tagline">{decision ? <>{completedManagerView ? 'Approved' : 'Decided'} by {decision.manager_label} · <time dateTime={decision.decided_at}>{formatDateTime(decision.decided_at)}</time></>
                : status === 'withdrawn' ? 'The manager can no longer approve this request.' : `${canAct ? 'Your' : 'The officer’s'} Procurement Manager has been notified. The plan is locked while it’s reviewed.`}</p>
              {!completedManagerView && decision && decision.manager_label !== decision.manager_clerk_user_id && decision.manager_clerk_user_id !== 'system' && <p className="rec-context">Manager account: {decision.manager_clerk_user_id}</p>}
            </div>
          </div>
          {decision?.comment && <div className="rec-status-comment"><span className="rec-kicker">{decision.decision === 'approved' ? 'Manager’s comment' : 'Reason for rejection'}</span><p className="rec-decision-comment">{decision.comment}</p></div>}
          {!completedManagerView && <p className="rec-next"><strong>Next step</strong> {nextStep}</p>}
          {current.withdrawal && <p>Withdrawn {formatDateTime(current.withdrawal.withdrawn_at)}{current.withdrawal.reason && ` · ${current.withdrawal.reason}`}</p>}
          {canAct && <PlanLifecycleActions key={`${plan.plan_id}:${status}:${today}`} plan={{ ...plan, status }} data={{ ...current, submission: submission ?? null }}
            service={planService} today={today} onChanged={saved => onChanged?.(saved)} onReload={onReload ?? refreshDecision} />}
          {!canAct && current.revision_plan_ids?.map(id => <p key={id}><AppLink href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(id)}`}>View copied plan</AppLink></p>)}
          {deciding && <ManagerDecisionForm key={`${plan.plan_id}:${analysis!.approval_fingerprint}`} planId={plan.plan_id}
            plan={plan} analysis={analysis} buyerLabel={current.buyer_label} today={today}
            fingerprint={analysis!.approval_fingerprint!} service={planService} onDecided={refreshDecision} onRefresh={refreshDecision} />}
        </section>

        <aside className="rec-rail" aria-label="Saved recommendation summary">
          <div className="rec-rail-card">
            <div><span className="rec-kicker">Saved recommendation</span><strong className="rec-rail-action">{rec ? actionLabel(rec.action) : 'Not saved'}</strong></div>
            <dl className="rec-rail-facts">
              <div><dt>Plan</dt><dd>{quantity} MT</dd></div>
              <div><dt>Deadline</dt><dd>{formatDate(deadline)}</dd></div>
              {submission && <div><dt>Cost detail</dt><dd>{cost ? `${submission.horizon_days}-day${saved ? ` · ${formatDate(saved.target_date)}` : ''}` : 'Reference price'}</dd></div>}
              {cost && !pricesInPurchase && <div><dt>Saved estimate</dt><dd>{cost.central_total == null ? `${usd(cost.forecast_total.lower)}–${amount(cost.forecast_total.upper)}` : usd(cost.central_total)}</dd></div>}
            </dl>
          </div>
          <p className="rec-rail-note">Saved at submission. These figures don’t change when new prices are published.</p>
          {report && <RecommendationReportDownload report={report} />}
        </aside>

        <div className="rec-evidence">
          <PurchaseOutcome data={{ ...current, submission: submission ?? null }} />
          {!analysis || !submission ? <section className="rec-card"><h2>Earlier plan-only submission</h2><p>This request was submitted before recommendation snapshots were introduced. No selected recommendation was saved.</p></section>
            : !pricesInPurchase && <section className="rec-detail" aria-label="Saved recommendation for approval">
              <div className="rec-section-head"><div>
                <h2>Plan recommendation · {rec ? actionLabel(rec.action) : 'Not saved'}</h2>
                {rec && <p>{readableDates(rec.explanation)}</p>}
              </div></div>
              {marketPrice != null && marketTotal != null && <table className="rec-cost-table rec-saved-costs" aria-label="Saved recommendation costs">
                <caption>Prices saved for {quantity} MT</caption>
                <thead><tr><th scope="col">Price type</th><th scope="col">USD per MT</th><th scope="col">Total USD</th></tr></thead>
                <tbody>
                  <tr>
                    <th scope="row">Market price{reference && <span className="rec-saved-price-date">Observed {formatDate(reference.observation_date)}</span>}</th>
                    <td>{currencyAmount(marketPrice)}</td>
                    <td>{currencyAmount(marketTotal)}</td>
                  </tr>
                  {cost && <>
                    <tr>
                      <th scope="row">Forecast price{forecastDate && <span className="rec-saved-price-date">For {formatDate(forecastDate)}</span>}</th>
                      {cost.central_total == null ? <td colSpan={2}>Unavailable</td> : <>
                        <td>{currencyAmount(cost.central_total / quantityMt)}</td><td>{currencyAmount(cost.central_total)}</td>
                      </>}
                    </tr>
                    <tr>
                      <th scope="row">Experimental forecast range</th>
                      <td>{currencyAmount(cost.forecast_total.lower / quantityMt)} to {currencyAmount(cost.forecast_total.upper / quantityMt)}</td>
                      <td>{currencyAmount(cost.forecast_total.lower)} to {currencyAmount(cost.forecast_total.upper)}</td>
                    </tr>
                  </>}
                </tbody>
              </table>}
              {!cost && <p className="rec-detail-note">No forecast cost was available for the purchase window.</p>}
            </section>}
          {analysis && (!pricesInPurchase || rec) && <details className="rec-fine">
            <summary>{pricesInPurchase && rec ? `Original recommendation · ${actionLabel(rec.action)}` : 'Why this recommendation'}</summary>
            <div className="rec-fine-body">
              {pricesInPurchase && rec && <p>{readableDates(rec.explanation)}</p>}
              <EvidenceView analysis={analysis} plan={plan} />
            </div>
          </details>}
          {analysis && submission && <details className="rec-fine"><summary>Technical details</summary>
            <dl className="rec-fine-body rec-technical-details">
              <div><dt>Planning date</dt><dd>{formatDate(analysis.context.scenario_as_of_date)}</dd></div>
              <div><dt>Urgency</dt><dd>{analysis.context.urgency ?? 'NORMAL'}</dd></div>
              {saved && <>
                <div><dt>Forecast horizon</dt><dd>{submission.horizon_days} days</dd></div>
                {!cost && <div><dt>Forecast date</dt><dd>{formatDate(saved.target_date)}</dd></div>}
                <div><dt>Model version</dt><dd>{saved.model_version}</dd></div>
                <div><dt>Run ID</dt><dd>{saved.run_id}</dd></div>
              </>}
            </dl>
          </details>}
        </div>
      </div>}
  </main>;
}

function StatusIcon({ status }: { status?: string }) {
  const path = status === 'approved' || status === 'purchased' ? <path d="M5 12.5l4.5 4.5L19 7.5" />
    : status === 'rejected' || status === 'withdrawn' ? <path d="M6 6l12 12M18 6L6 18" />
    : status === 'closed' ? <path d="M6 12h12" />
    : <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>;
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
}
