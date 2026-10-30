import { useEffect, useState } from 'react';
import type { ApprovalDecision, PurchasePlan, PurchasePlanService } from '../types';
import { Icon } from './Primitives';

export const decisionTime = (value: string) => new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Tells the buyer where a submitted plan stands without opening it. The manager, time and reason come from
 * the plan's saved submission (GET /{planId}/submission), which buyers can already read for their own plans.
 */
export function PlanDecisionNote({ plan, service }: { plan: PurchasePlan; service?: PurchasePlanService }) {
  const decided = plan.status === 'approved' || plan.status === 'rejected';
  const [result, setResult] = useState<{ planId: string; status?: string; decision?: ApprovalDecision | null; error?: boolean }>();
  useEffect(() => {
    if (!decided || !service?.readSubmission) return;
    let active = true;
    service.readSubmission(plan.plan_id)
      .then(({ decision }) => { if (active) setResult({ planId: plan.plan_id, status: plan.status, decision: decision ?? null }); })
      .catch(() => { if (active) setResult({ planId: plan.plan_id, status: plan.status, error: true }); });
    return () => { active = false; };
  }, [decided, service, plan.plan_id, plan.status]);

  if (plan.status === 'submitted') return <div className="pp-decision pp-decision--submitted">
    <Icon name="clock" /><p><strong>Awaiting manager approval.</strong> All managers in your organisation have been notified. This plan is locked while awaiting review.</p>
  </div>;
  if (plan.status === 'purchased') return <div className="pp-decision"><Icon name="check-circle" /><p>Purchase recorded. Open this plan to see the actual cost and saved estimate.</p></div>;
  if (plan.status === 'withdrawn') return <div className="pp-decision"><Icon name="cross-circle" /><p>Request withdrawn. Copy it to a new draft to request approval again.</p></div>;
  if (!decided) return null;
  const approved = plan.status === 'approved';
  const current = result?.planId === plan.plan_id && result.status === plan.status ? result : undefined;
  const decision = current?.decision;
  return <div className={`pp-decision pp-decision--${plan.status}`}>
    <Icon name={approved ? 'check-circle' : 'cross-circle'} />
    <div>
      {/* The status pill already names the outcome; this line says who decided and when. */}
      <p>{decision ? <><strong>{decision.manager_label}</strong> {approved ? 'approved' : 'rejected'} this plan · <time dateTime={decision.decided_at}>{decisionTime(decision.decided_at)}</time></>
        : <strong>Manager decision recorded.</strong>}</p>
      {decision?.comment && <p className="pp-decision-comment">{approved ? 'Comment' : 'Reason'}: “{decision.comment}”</p>}
      {service?.readSubmission && !current && <p className="pp-decision-meta" role="status">Loading the manager’s note…</p>}
      {current?.error && <p className="pp-decision-meta">Couldn’t load the manager’s note. Open the decision to see it.</p>}
      <p className="pp-decision-meta">{approved ? 'Buy using a current supplier quote, then open the decision to record the purchase.'
        : 'This plan stays locked. Open the decision to copy it to a new draft.'}</p>
    </div>
  </div>;
}
