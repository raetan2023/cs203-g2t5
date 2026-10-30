import { useEffect, useState } from 'react';
import { AppLink } from '../../../app/router';
import { requestError, type PurchasePlan, type PurchasePlanService } from '../types';

export function PreviousPlanNote({ plan, service }: { plan: PurchasePlan; service: PurchasePlanService }) {
  const previous = plan.previous_plan_id;
  const [result, setResult] = useState<{ id: string; comment?: string; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(undefined);
    if (previous && service.readSubmission) service.readSubmission(previous).then(data => {
      if (active) setResult({ id: previous, comment: data.decision?.decision === 'rejected' ? data.decision.comment : data.withdrawal?.reason });
    }).catch(error => { if (active) setResult({ id: previous, error: requestError(error).detail }); });
    return () => { active = false; };
  }, [previous, service, attempt]);
  if (!previous) return null;
  return <aside className="pp-previous-plan" aria-label="Previous plan">
    <p>This plan was copied from an earlier plan. <AppLink href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(previous)}`}>View previous plan and history</AppLink></p>
    {result?.id === previous && result.comment && <p>Earlier reason: {result.comment}</p>}
    {result?.id === previous && result.error && <p role="alert">{result.error} <button type="button" className="bb-button bb-button--secondary" onClick={() => setAttempt(n => n + 1)}>Retry earlier note</button></p>}
  </aside>;
}
