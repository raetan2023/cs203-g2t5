import { useEffect, useState } from 'react';
import { requestError, type ManagerOverview, type PurchasePlanService } from '../types';
import { ErrorBanner, PlanButton } from './Primitives';

export function ManagerTeamOverview({ service }: { service: PurchasePlanService }) {
  const [result, setResult] = useState<{ service: PurchasePlanService; value?: ManagerOverview; error?: string }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(undefined);
    service.managerOverview!().then(value => {
      if (active) setResult({ service, value });
    }).catch(error => {
      if (active) setResult({ service, error: requestError(error).detail });
    });
    return () => { active = false; };
  }, [service, revision]);
  const current = result?.service === service ? result : undefined;
  const data = current?.value;
  const number = (value: number) => value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
  return <section className="pp-card" aria-label="Team oversight">
    <h2>Team oversight</h2>
    <p className="pp-card-description">Plans for your active organisation. Refresh to include your team’s latest changes.</p>
    <PlanButton variant="secondary" disabled={!current} onClick={() => setRevision(value => value + 1)}>Refresh team overview</PlanButton>
    {!current ? <p role="status">Loading team exposure…</p> : current.error ? <ErrorBanner>{current.error}</ErrorBanner> : data && <>
      <dl className="pp-team-totals">
        <div><dt>Total plans</dt><dd>{data.plan_count}</dd></div>
        <div><dt>Total planned volume</dt><dd>{number(data.total_quantity_mt)} MT</dd></div>
        <div><dt>Awaiting approval</dt><dd>{data.pending_approval_count}</dd></div>
        <div><dt>Open volume</dt><dd>{number(data.open_quantity_mt)} MT</dd></div>
        <div><dt>Estimated open exposure</dt><dd>{data.exposure_usd === null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.exposure_usd)}</dd></div>
      </dl>
      <p className="pp-card-description">Open volume includes drafts, submitted plans and approved plans awaiting purchase. Purchased, rejected and withdrawn plans are excluded.</p>
      <p className="pp-card-description">{data.reference_date && data.reference_price_usd_per_mt !== null
        ? `Exposure = open volume × Singapore MGO reference price of USD ${number(data.reference_price_usd_per_mt)}/MT, observed ${data.reference_date}. This is an estimate, not a supplier quote or actual spend.`
        : 'No observed USD/MT reference price is available. Volume totals are still available.'}</p>
    </>}
  </section>;
}
