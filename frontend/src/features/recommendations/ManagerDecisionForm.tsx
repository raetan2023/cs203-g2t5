import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../purchase-plan/components/Primitives';
import { calendarDays, formatDate, formatDateTime } from '../purchase-plan/dates';
import { requestError, type ApprovalDecision, type PlanAnalysis, type PurchasePlan, type PurchasePlanService } from '../purchase-plan/types';
import { actionLabel, usd } from './format';
import './manager-decision.css';

type Choice = 'approved' | 'rejected';

/** Direction B: saved recommendation first, with a final decision inside a modal side panel. */
export function ManagerDecisionForm({ planId, fingerprint, service, onDecided, onRefresh, plan, analysis, buyerLabel, today, defaultOpen = false }: {
  planId: string; fingerprint: string; service: PurchasePlanService; onDecided(): void; onRefresh(): void;
  plan?: PurchasePlan; analysis?: PlanAnalysis; buyerLabel?: string | null; today?: string; defaultOpen?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [choice, setChoice] = useState<Choice>('approved');
  // Approving after the deadline asks once more: the purchase may still happen late.
  const [lateApproval, setLateApproval] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [otherDecision, setOtherDecision] = useState<ApprovalDecision | null>(null);
  const [success, setSuccess] = useState<Choice | null>(null);
  const [invalid, setInvalid] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), field = useRef<HTMLTextAreaElement>(null);
  const pending = useRef(false), active = useRef(true), terminal = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal(); element.focus(); document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, [open]);
  function show(next: Choice) {
    setChoice(next); setError(''); setInvalid(false); setConflict(false); setSuccess(null); setOtherDecision(null);
    terminal.current = false; setOpen(true);
  }
  function close() {
    if (pending.current) return;
    setOpen(false);
    if (terminal.current) { terminal.current = false; onDecided(); }
  }
  async function confirm(next: Choice) {
    if (!service.decide || pending.current || conflict || success) return;
    setChoice(next);
    if (next === 'approved' && remaining !== undefined && remaining < 0 && !lateApproval) { setLateApproval(true); return; }
    if (comment.trim().length > 2000 || (next === 'rejected' && !comment.trim())) {
      setInvalid(true); field.current?.focus(); return;
    }
    pending.current = true; setBusy(true); setError(''); setInvalid(false);
    try {
      await service.decide(planId, { decision: next, comment: comment.trim(), approval_fingerprint: fingerprint });
      if (active.current) { terminal.current = true; setSuccess(next); }
    } catch (failure) {
      if (active.current) {
        const message = requestError(failure);
        // Not found while the page is open means the request left this manager's team, usually because
        // an admin moved the officer to another PM.
        setError(message.status === 404
          ? 'This request is no longer yours to decide. The officer may now be managed by another PM, so it has moved to their Approval inbox.'
          : message.detail);
        const changed = message.status === 409 || message.status === 404;
        setConflict(changed);
        if (changed && service.readSubmission) {
          try {
            const latest = await service.readSubmission(planId);
            if (active.current) setOtherDecision(latest.decision ?? null);
          } catch { /* The conflict remains locked even when audit refresh is unavailable. */ }
        }
      }
    } finally { pending.current = false; if (active.current) setBusy(false); }
  }
  const guidance = analysis?.recommendation.status === 'ready' ? analysis.recommendation.value : undefined;
  const reference = analysis?.reference.status === 'ready' ? analysis.reference.value : undefined;
  const cost = analysis?.cost_impact.status === 'ready' ? analysis.cost_impact.value : undefined;
  const quantity = plan?.quantity_mt ?? analysis?.context.quantity_mt;
  const referenceTotal = cost?.reference_total ?? (reference && quantity ? reference.price * quantity : undefined);
  const deadline = plan?.purchase_deadline ?? analysis?.context.purchase_deadline;
  const remaining = deadline && (today ?? plan?.scenario_as_of_date) ? calendarDays((today ?? plan!.scenario_as_of_date), deadline) : undefined;
  const footerDisabled = busy || conflict;
  const title = success ? `Plan ${success}` : otherDecision ? 'Plan already decided' : 'Approve plan';
  return <section className="rec-manager-decision" aria-label="Manager review">
    <h3>Manager review</h3>
    <p>Review the saved recommendation. The plan owner sees your decision and comment.</p>
    <div className="rec-approval-actions" hidden={open}>
      <button className="bb-button" onClick={() => show('approved')}>Approve recommendation</button>
      <button className="bb-button bb-button--secondary" onClick={() => show('rejected')}>Reject recommendation</button>
    </div>
    {open && createPortal(<dialog ref={dialog} className="md-panel" tabIndex={-1} aria-labelledby={`${id}-title`} aria-describedby={`${id}-context`} aria-busy={busy}
      onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }} onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const items = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), a[href], summary'));
        if (!items.length) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === dialog.current)) { event.preventDefault(); items.at(-1)!.focus(); }
        else if (!event.shiftKey && (document.activeElement === items.at(-1) || document.activeElement === dialog.current)) { event.preventDefault(); items[0].focus(); }
      }}>
      <header className="md-header"><div><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-context`}>#{planId.slice(0, 8)} · Singapore MGO · submitted recommendation</p></div>
        <button className="md-close" aria-label="Close review" disabled={busy} onClick={close}>×</button></header>
      {busy && <div className="md-progress" role="status">Saving decision…</div>}
      {success ? <div className="md-success" role="status"><span><Icon name={success === 'approved' ? 'check' : 'cross-circle'} /></span><h3>Plan {success}</h3>
        <p>The decision and comment have been saved.</p><p>The plan owner can see the decision on their plan.</p></div>
      : <div className="md-body">
        {conflict && <div className="md-notice" role="alert"><strong>{otherDecision ? 'Already decided by another manager' : 'This request has changed'}</strong>
          <p>{otherDecision ? `${otherDecision.decision === 'approved' ? 'Approved' : 'Rejected'} by ${otherDecision.manager_label} · ${formatDateTime(otherDecision.decided_at)}. This decision is final.` : error}</p>
          {otherDecision?.comment && <p>Comment: {otherDecision.comment}</p>}</div>}
        {lateApproval && !conflict && remaining !== undefined && remaining < 0 && <div className="md-notice" role="alert"><strong>The purchase deadline has passed</strong>
          <p>It was {Math.abs(remaining)} {Math.abs(remaining) === 1 ? 'day' : 'days'} ago. Approve anyway?</p></div>}
        {error && !conflict && <div className="md-notice md-notice--error" role="alert"><strong>Couldn’t save your decision</strong><p>{error}</p><p>Your comment is kept. Reload the request to check its current status before retrying.</p></div>}
        <div className="md-recommendation"><span className="md-recommendation-icon"><Icon name="check" /></span><div><span className="md-kicker">Recommendation at submission{plan?.submitted_at && <> · <time dateTime={plan.submitted_at}>{formatDateTime(plan.submitted_at)}</time></>}</span>
          <strong>{guidance ? actionLabel(guidance.action) : 'Recommendation not available'}</strong></div></div>
        <div className="md-cost"><p><span>Cost for {quantity?.toLocaleString('en-GB') ?? '—'} MT at reference</span><strong>{referenceTotal == null ? 'Unavailable' : usd(referenceTotal)}</strong></p>
          {cost && <><div className="md-range" aria-hidden="true"><span style={{ left: `${rangePosition(cost.reference_total, cost.forecast_total.lower, cost.forecast_total.upper)}%` }} /></div>
            <div className="md-range-labels"><span>− {usd(Math.max(0, -cost.difference_total.lower))} possible saving</span><span>+ {usd(Math.max(0, cost.difference_total.upper))} possible increase</span></div>
            <p className="md-cost-note">Forecast impact versus the saved reference; not realised savings.</p></>}
        </div>
        <dl className="md-facts"><div><dt>Procurement Officer</dt><dd>{buyerLabel ?? 'Plan owner unavailable'}</dd></div>
          <div><dt>Buy by</dt><dd className={remaining !== undefined && remaining <= 2 ? 'md-deadline' : undefined}>{deadline ? formatDate(deadline) : 'Unavailable'}{remaining !== undefined && <span>{remaining < 0 ? `overdue by ${Math.abs(remaining)} days` : remaining === 0 ? 'today' : `in ${remaining} ${remaining === 1 ? 'day' : 'days'}`}</span>}</dd></div>
          <div><dt>Reference</dt><dd>{reference ? <>USD {reference.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/MT<span>Singapore MGO · {formatDate(reference.observation_date)}</span></> : 'Unavailable'}</dd></div>
        </dl>
        <button className="md-detail-link" disabled={busy} onClick={close}>View full recommendation →</button>
        <div className="md-comment"><label htmlFor={`${id}-comment`}>{choice === 'rejected' ? 'Rejection reason (required)' : 'Approval comment (optional)'}</label>
          <textarea ref={field} id={`${id}-comment`} placeholder="Add context for the plan owner" rows={4} maxLength={2000} value={comment} disabled={footerDisabled} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-validation` : undefined}
            required={choice === 'rejected'} onChange={event => { setComment(event.target.value); setInvalid(false); }} />
          {invalid && <p id={`${id}-validation`} className="md-validation" role="alert">{comment.trim().length > 2000 ? 'Use at most 2000 characters.' : 'Add a reason — explain why the plan was rejected.'}</p>}
        </div>
        <p className="md-buyer-note">The plan owner sees this with your decision.</p>
      </div>}
      <footer className="md-footer">{success ? <button className="md-button md-button--primary" onClick={close}>Back to plan</button>
        : conflict ? <button className="md-button md-button--primary" disabled={busy} onClick={() => { setOpen(false); onRefresh(); }}>Reload request</button>
        : <><button className="md-button md-button--reject" disabled={footerDisabled} aria-label="Confirm rejection" onClick={() => { void confirm('rejected'); }}>{busy && choice === 'rejected' ? <><span className="md-spinner" aria-hidden="true" />Rejecting…</> : 'Reject'}</button>
          <button className="md-button md-button--primary" disabled={footerDisabled} aria-label="Confirm approval" onClick={() => { void confirm('approved'); }}>{busy && choice === 'approved' ? <><span className="md-spinner" aria-hidden="true" />Approving…</> : lateApproval ? 'Approve anyway' : 'Approve'}</button></>}
      </footer>
    </dialog>, document.body)}
  </section>;
}
function rangePosition(reference: number, lower: number, upper: number) {
  const min = Math.min(lower, reference), max = Math.max(upper, reference);
  return max === min ? 50 : Math.max(2, Math.min(98, (reference - min) / (max - min) * 100));
}
