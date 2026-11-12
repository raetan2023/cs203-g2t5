import { useEffect, useState } from 'react';
import type { ApprovalDecision, PurchasePlan, PurchasePlanService } from '../types';
import { Icon } from './Primitives';

export const decisionTime = (value: string) => new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
/** "Bought 195 MT of 200 MT planned. " or "Bought all 200 MT. "; empty until the purchase has loaded. */
const decisionDay = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

/** The officer's card note: always one line. The status pill and the buttons carry the rest. */
function NoteLine({ icon, text, tone, busy = false }: { icon: 'clock' | 'check-circle' | 'cross-circle'; text: string; tone?: 'approved' | 'rejected'; busy?: boolean }) {
  return <div className={`pp-decision pp-decision--line${tone ? ` pp-decision--${tone}` : ''}`}>
    <Icon name={icon} /><p title={text} role={busy ? 'status' : undefined}>{text}</p>
  </div>;
}

/**
 * Tells the buyer where a submitted plan stands without opening it. The manager, time and reason come from
 * the plan's saved submission (GET /{planId}/submission), which buyers can already read for their own plans.
 */
export function PlanDecisionNote({ plan, service, canAct = true }: { plan: PurchasePlan; service?: PurchasePlanService; canAct?: boolean }) {
  const decided = plan.status === 'approved' || plan.status === 'rejected';
  const reads = decided;
  const [result, setResult] = useState<{ planId: string; status?: string; decision?: ApprovalDecision | null; error?: boolean }>();
  useEffect(() => {
    if (!reads || !service?.readSubmission) return;
    let active = true;
    service.readSubmission(plan.plan_id)
      .then(({ decision }) => { if (active) setResult({ planId: plan.plan_id, status: plan.status, decision: decision ?? null }); })
      .catch(() => { if (active) setResult({ planId: plan.plan_id, status: plan.status, error: true }); });
    return () => { active = false; };
  }, [reads, service, plan.plan_id, plan.status]);

  if (canAct && plan.status === 'submitted') return <NoteLine icon="clock" text="Locked while your manager reviews it." />;
  if (canAct && plan.status === 'purchased') return <NoteLine icon="check-circle" text="Purchase recorded. See the actual cost and saved estimate." />;
  if (canAct && plan.status === 'withdrawn') return <NoteLine icon="cross-circle" text="You withdrew this request." />;
  if (plan.status === 'submitted') return <div className="pp-decision pp-decision--submitted">
    <Icon name="clock" /><p><strong>Awaiting manager approval.</strong> The officer’s Procurement Manager has been notified. This plan is locked while awaiting review.</p>
  </div>;
  if (plan.status === 'purchased') return <div className="pp-decision"><Icon name="check-circle" /><p>Purchase recorded. Open this plan to see the actual cost and saved estimate.</p></div>;
  if (plan.status === 'withdrawn') return <div className="pp-decision"><Icon name="cross-circle" /><p>Request withdrawn. Copy it to a new draft to request approval again.</p></div>;
  if (plan.status === 'closed') return <div className="pp-decision"><Icon name="minus-circle" /><p>Closed because the officer is no longer a procurement officer. It can no longer be bought.</p></div>;
  if (!decided) return null;
  const approved = plan.status === 'approved';
  const current = result?.planId === plan.plan_id && result.status === plan.status ? result : undefined;
  const decision = current?.decision;
  if (canAct) {
    const icon = approved ? 'check-circle' : 'cross-circle', tone = approved ? 'approved' : 'rejected';
    if (service?.readSubmission && !current) return <NoteLine icon={icon} tone={tone} text="Loading the manager’s note…" busy />;
    if (current?.error) return <NoteLine icon={icon} tone={tone} text="Couldn’t load the manager’s note. Open the decision to see it." />;
    if (!decision) return <NoteLine icon={icon} tone={tone} text="Manager decision recorded." />;
    // A rejection's reason is what the officer needs before copying; who and when are behind View decision.
    return <NoteLine icon={icon} tone={tone} text={!approved && decision.comment ? `Reason: ${decision.comment}`
      : `${approved ? 'Approved' : 'Rejected'} by ${decision.manager_label} · ${decisionDay(decision.decided_at)}`} />;
  }
  return <div className={`pp-decision pp-decision--${plan.status}`}>
    <Icon name={approved ? 'check-circle' : 'cross-circle'} />
    <div>
      {/* The status pill already names the outcome; this line says who decided and when. */}
      <p>{decision ? <><strong>{decision.manager_label}</strong> {approved ? 'approved' : 'rejected'} this plan · <time dateTime={decision.decided_at}>{decisionTime(decision.decided_at)}</time></>
        : <strong>Manager decision recorded.</strong>}</p>
      {decision?.comment && <p className="pp-decision-comment">{approved ? 'Comment' : 'Reason'}: “{decision.comment}”</p>}
      {service?.readSubmission && !current && <p className="pp-decision-meta" role="status">Loading the manager’s note…</p>}
      {current?.error && <p className="pp-decision-meta">Couldn’t load the manager’s note. Open the decision to see it.</p>}
      <p className="pp-decision-meta">Read-only access. Open the decision to view the saved recommendation and manager comments.</p>
    </div>
  </div>;
}
