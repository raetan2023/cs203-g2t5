import { useEffect, useState } from 'react';
import { AppLink } from '../../../app/router';
import type { ApprovalDecision, PurchasePlan, PurchasePlanService } from '../types';
import { formatDate, formatDateTime } from '../dates';
import { boughtText } from './PlanDecisionNote';
import { CardTop, type TagKind } from './StatusTag';

export type ManagerPlanState = Extract<TagKind, 'to-buy' | 'overdue' | 'purchased' | 'rejected' | 'closed'>;

/** Each plan a manager sees is exactly one of these. Overdue means approved, past its deadline, and still not bought. */
export function managerPlanState(plan: Pick<PurchasePlan, 'status' | 'days_remaining'>): ManagerPlanState {
  if (plan.status === 'purchased') return 'purchased';
  if (plan.status === 'rejected') return 'rejected';
  if (plan.status === 'closed') return 'closed';
  return plan.days_remaining < 0 ? 'overdue' : 'to-buy';
}

/**
 * A manager's view of one decided plan, laid out like an Approval inbox card: quantity, deadline and
 * status on top, who submitted it and when, one line about the outcome, then the open button.
 */
export function ManagerPlanCard({ plan, service }: { plan: PurchasePlan; service?: PurchasePlanService }) {
  const [details, setDetails] = useState<{ planId: string; buyer?: string | null; decision?: ApprovalDecision | null; bought?: number; failed?: boolean }>();
  useEffect(() => {
    if (!service?.readSubmission) return;
    let active = true;
    service.readSubmission(plan.plan_id)
      .then(({ buyer_label, decision, purchase }) => { if (active) setDetails({ planId: plan.plan_id, buyer: buyer_label, decision: decision ?? null, bought: purchase?.quantity_mt }); })
      .catch(() => { if (active) setDetails({ planId: plan.plan_id, failed: true }); });
    return () => { active = false; };
  }, [service, plan.plan_id, plan.status]);
  const current = details?.planId === plan.plan_id ? details : undefined;
  const status = plan.status ?? 'draft';
  const state = managerPlanState(plan);
  const quantity = plan.quantity_mt.toLocaleString('en-GB', { maximumFractionDigits: 20 });
  const decision = current?.decision;
  const outcome = status === 'purchased' ? boughtText(current?.bought, plan.quantity_mt).trim()
    : decision ? `${decision.decision === 'approved' ? 'Approved' : 'Rejected'} by ${decision.manager_label} · ${formatDateTime(decision.decided_at)}` : '';
  const action = status === 'purchased' ? 'View purchase record' : 'View decision';
  const late = -plan.days_remaining;
  return <section className="pp-card pp-summary pp-manager-plan" aria-label={`${quantity} MT plan`}>
    <CardTop quantity={quantity} deadline={plan.purchase_deadline} due={formatDate(plan.purchase_deadline)} tag={state} />
    <p className="pp-inbox-meta">
      Submitted by <strong>{plan.buyer_label ?? current?.buyer ?? (current?.failed ? 'an officer' : '…')}</strong><br />
      {plan.submitted_at ? <time dateTime={plan.submitted_at}>{formatDateTime(plan.submitted_at)}</time> : 'Not submitted'}
    </p>
    {/* One line about the outcome; a rejection's reason or an overdue reminder follows it. */}
    <p className="pp-manager-plan-outcome">{outcome || ' '}</p>
    {status === 'rejected' && decision?.comment && <p className="pp-manager-plan-reason">Reason: “{decision.comment}”</p>}
    {state === 'closed' && <p className="pp-manager-plan-closed">Closed because the officer is no longer a procurement officer.</p>}
    {state === 'overdue' && <p className="pp-manager-plan-late">Deadline passed {late} {late === 1 ? 'day' : 'days'} ago, not bought yet.</p>}
    <AppLink className="pp-button pp-button--primary pp-inbox-open" href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(plan.plan_id)}`}>{action}</AppLink>
  </section>;
}
