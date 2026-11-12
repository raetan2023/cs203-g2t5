import { useEffect, useState } from 'react';
import { AppLink } from '../../../app/router';
import type { ApprovalDecision, PurchasePlan, PurchasePlanService } from '../types';
import { formatDate, formatDateTime } from '../dates';
import { CardTop, type TagKind } from './StatusTag';

export type ManagerPlanState = Extract<TagKind, 'to-buy' | 'purchased' | 'rejected' | 'withdrawn' | 'closed'>;

/** Each plan is exactly one of these. Overdue means approved, past its deadline, and still not bought. */
export function managerPlanState(plan: Pick<PurchasePlan, 'status' | 'days_remaining'>): ManagerPlanState {
  switch (plan.status) {
    case 'purchased': return 'purchased';
    case 'rejected': return 'rejected';
    case 'withdrawn': return 'withdrawn';
    case 'closed': return 'closed';
    // An approval not bought by its deadline is closed; the hourly job may not have saved that yet.
    default: return plan.days_remaining < 0 ? 'closed' : 'to-buy';
  }
}

type Details = { planId: string; buyer?: string | null; decision?: ApprovalDecision | null; failed?: boolean };
/** Details already read, per account's service, so a card shown again needs no loading pause. */
const seen = new WeakMap<PurchasePlanService, Map<string, Details>>();


/**
 * One plan, laid out like an Approval inbox card: quantity, deadline and status on top, who submitted it
 * and when, one line about the outcome, then the open button. Admins also see the officer's current PM.
 */
export function ManagerPlanCard({ plan, service, showManager = false }: { plan: PurchasePlan; service?: PurchasePlanService; showManager?: boolean }) {
  const key = `${plan.plan_id}|${plan.status}`;
  // A card that was shown before starts with its details, so changing filters or pages does not make lines pop in.
  const [details, setDetails] = useState<Details | undefined>(() => service ? seen.get(service)?.get(key) : undefined);
  useEffect(() => {
    if (!service?.readSubmission) return;
    let active = true;
    const cache = seen.get(service) ?? new Map<string, Details>();
    seen.set(service, cache);
    if (cache.has(key)) setDetails(cache.get(key));
    service.readSubmission(plan.plan_id)
      .then(({ buyer_label, decision }) => {
        const loaded = { planId: plan.plan_id, buyer: buyer_label, decision: decision ?? null };
        cache.set(key, loaded);
        if (active) setDetails(loaded);
      })
      .catch(() => { if (active) setDetails({ planId: plan.plan_id, failed: true }); });
    return () => { active = false; };
  }, [service, plan.plan_id, key]);
  const current = details?.planId === plan.plan_id ? details : undefined;
  const status = plan.status ?? 'draft';
  const state = managerPlanState(plan);
  const quantity = plan.quantity_mt.toLocaleString('en-GB', { maximumFractionDigits: 20 });
  const decision = current?.decision;
  // Who decided and when. A purchase is always the whole plan, so it needs no amount line.
  const outcome = status === 'withdrawn' ? 'Withdrawn before a decision was made.'
    : decision ? `${decision.decision === 'approved' ? 'Approved' : 'Rejected'} by ${decision.manager_label} · ${formatDateTime(decision.decided_at)}` : '';
  const action = status === 'purchased' ? 'View purchase record' : status === 'withdrawn' ? 'View withdrawn request' : 'View decision';
  return <section className="pp-card pp-summary pp-manager-plan" aria-label={`${quantity} MT plan`}>
    <CardTop quantity={quantity} deadline={plan.purchase_deadline} due={formatDate(plan.purchase_deadline)} tag={state} />
    <p className="pp-inbox-meta">
      Submitted by <strong>{plan.buyer_label ?? current?.buyer ?? (current?.failed ? 'an officer' : '…')}</strong>
      {/* Admins see the officer's PM on the same line, which keeps the card short. */}
      {showManager && <span className="pp-manager-plan-pm"> · PM {plan.pm_label ? <strong>{plan.pm_label}</strong> : <span className="pp-manager-plan-no-pm">No PM assigned</span>}</span>}<br />
      {plan.submitted_at ? <time dateTime={plan.submitted_at}>{formatDateTime(plan.submitted_at)}</time> : 'Not submitted'}
    </p>
    {/* One line about the outcome; a rejection's reason or a lateness reminder follows it. */}
    <p className="pp-manager-plan-outcome">{outcome || ' '}</p>
    {status === 'rejected' && decision?.comment && <p className="pp-manager-plan-reason">Reason: “{decision.comment}”</p>}
    {state === 'closed' && <p className="pp-manager-plan-closed">{plan.closed_reason === 'role_change' ? 'Closed: the officer changed role.' : 'Closed: not bought by the deadline.'}</p>}
    <AppLink className="pp-button pp-button--primary pp-inbox-open" href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(plan.plan_id)}`}>{action}</AppLink>
  </section>;
}
