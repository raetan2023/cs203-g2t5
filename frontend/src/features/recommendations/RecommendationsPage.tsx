import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLink } from '../../app/router';
import { formatDate } from '../purchase-plan/dates';
import type { PurchasePlan, PurchasePlanService } from '../purchase-plan/types';
import type { RecommendationService } from './service';
import { useAnalysis } from './useAnalysis';
import { PurchaseImpact } from './PurchaseImpact';
import './recommendations.css';

export function RecommendationsPage({ planService, service, scenarioDate }: {
  planService: PurchasePlanService; service?: RecommendationService; scenarioDate: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const scope = useMemo(() => ({}), [planService, service, scenarioDate, attempt]);
  const [result, setResult] = useState<{ scope: object; plan: PurchasePlan | null; error?: boolean }>();
  const requests = useRef<{ scope: object; promise: ReturnType<PurchasePlanService['read']> } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    let current = true;
    if (requests.current?.scope !== scope) requests.current = { scope, promise: planService.read() };
    requests.current.promise.then(({ plan }) => {
      if (!current) return;
      if (plan && plan.scenario_as_of_date !== scenarioDate) throw new Error('Stale plan');
      setResult({ scope, plan });
    }).catch(() => { if (current) setResult({ scope, plan: null, error: true }); });
    return () => { current = false; };
  }, [scope, planService, scenarioDate]);
  const active = result?.scope === scope ? result : undefined;
  const plan = active?.plan;
  return <main className="recommendations">
    <header className="rec-header"><div><h1 tabIndex={-1} ref={heading}>Purchase recommendation</h1><p>Review the recommendation for your selected purchase plan and active historical scenario.</p></div><AppLink className="rec-back" href="/purchase-plans">Back to purchase plans</AppLink></header>
    {plan && <section className="rec-card rec-plan" aria-labelledby="rec-plan-title"><h2 id="rec-plan-title">Selected purchase plan</h2><dl>
      <div><dt>Quantity</dt><dd>{plan.quantity_mt.toLocaleString('en-GB', { maximumFractionDigits: 20 })} MT</dd></div>
      <div><dt>Purchase deadline</dt><dd>{formatDate(plan.purchase_deadline)}</dd></div>
      <div><dt>Historical scenario date</dt><dd>{formatDate(plan.scenario_as_of_date)}</dd></div>
      <div><dt>Time remaining</dt><dd>{plan.days_remaining < 0 ? `Overdue by ${Math.abs(plan.days_remaining)} days` : `${plan.days_remaining} ${plan.days_remaining === 1 ? 'day' : 'days'}`}</dd></div>
    </dl></section>}
    {!active ? <section className="rec-card" role="status"><h2>{result ? 'Updating analysis…' : 'Loading purchase plan…'}</h2><p>{result ? 'The plan or scenario changed. Previous guidance and cost estimates have been cleared.' : 'Loading your saved purchase plan.'}</p><div className="rec-skeleton" aria-hidden="true" /></section>
      : active.error ? <section className="rec-card rec-error" role="alert"><h2>Couldn’t load analysis</h2><p>Your saved plan could not be loaded for the active historical scenario.</p><button className="bb-button" onClick={() => setAttempt(value => value + 1)}>Retry</button></section>
      : !plan ? <section className="rec-card rec-empty"><h2>No saved purchase plan</h2><p>Create a purchase plan to view plan-specific guidance.</p><AppLink className="bb-button" href="/purchase-plans">Create purchase plan</AppLink></section>
      : <section className="rec-card rec-analysis" aria-label="Purchase analysis">
        <Recommendation plan={plan} service={service} />
        {service?.readImpact && <PurchaseImpact plan={plan} service={service} />}
      </section>}
  </main>;
}

function Recommendation({ plan, service }: { plan: PurchasePlan; service?: RecommendationService }) {
  const { analysis, loading, error, connected, retry } = useAnalysis(service, plan, 'read');
  return <section className="rec-guidance" aria-label="Recommendation" aria-busy={loading}>
    <h2><span className="rec-symbol" aria-hidden="true">▦</span> Recommendation</h2>
    {loading ? <div role="status"><h3>Loading recommendation…</h3><p>The recommendation is loading for your selected saved purchase plan and historical scenario.</p><div className="rec-skeleton" aria-hidden="true" /><div className="rec-skeleton rec-skeleton-long" aria-hidden="true" /></div>
      : error ? <div className="rec-empty rec-error" role="alert"><h3>Couldn’t load analysis</h3><p>We couldn’t load the recommendation for this plan and scenario. Your plan remains saved.</p><button className="bb-button" onClick={retry}>Retry recommendation</button></div>
      : !connected ? <div className="rec-unavailable"><h3>No recommendation available</h3><p>The recommendations service is not connected yet. Your purchase plan remains saved.</p></div>
      : analysis && <>
        {analysis.recommendation.status === 'ready' ? <><h3>{analysis.recommendation.value.action}</h3><p>{analysis.recommendation.value.explanation}</p><p className="rec-context">Based on the {formatDate(analysis.context.scenario_as_of_date)} scenario</p></> : <div className="rec-unavailable"><h3>No recommendation available</h3><p>{analysis.recommendation.message}</p><p>Your purchase plan remains saved.</p></div>}
        {analysis.source === 'mock' && <p className="rec-demo">Synthetic demo data · Illustrative guidance; recommendation policy pending confirmation.</p>}
      </>}
  </section>;
}
