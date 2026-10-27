import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AppLink } from '../../app/router';
import { formatDate } from '../purchase-plan/dates';
import type { PurchasePlan, PurchasePlanService, Urgency, PlanAnalysis } from '../purchase-plan/types';
import type { RecommendationService } from './service';
import { useAnalysis } from './useAnalysis';
import { TimingComparison } from './TimingComparison';
import { PurchaseImpact } from './PurchaseImpact';
import './recommendations.css';
import '../forecast/forecast.css';
import type { Horizon } from '../forecast/apiService';
import { useForecastContext } from '../forecast/ForecastContext';

export function RecommendationsPage({ planService, service, scenarioDate, refreshScenario, planId }: {
  planId?: string | null; planService: PurchasePlanService; service?: RecommendationService; scenarioDate: string; refreshScenario?: () => void;
}) {
  const urgencyHintId = useId();
  const [urgency, setUrgency] = useState<Urgency>('NORMAL');
  const forecastState = useForecastContext();
  const forecast = forecastState.data?.status === 'ready' ? forecastState.data : undefined;
  const [attempt, setAttempt] = useState(0);
  const reload = () => { forecastState.retry(); refreshScenario?.(); setAttempt(value => value + 1); };
  const scope = useMemo(() => ({}), [planService, service, scenarioDate, attempt, planId]);
  const [result, setResult] = useState<{ scope: object; plan: PurchasePlan | null; error?: boolean }>();
  const requests = useRef<{ scope: object; promise: ReturnType<PurchasePlanService['read']> } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    let current = true;
    if (requests.current?.scope !== scope) requests.current = { scope, promise: planId ? planService.read(planId) : Promise.resolve({ plan: null }) };
    requests.current.promise.then(({ plan }) => {
      if (!current) return;
      if (plan && plan.scenario_as_of_date !== scenarioDate) throw new Error('Stale plan');
      setResult({ scope, plan });
    }).catch(() => { if (current) setResult({ scope, plan: null, error: true }); });
    return () => { current = false; };
  }, [scope, planService, scenarioDate, planId]);
  const active = result?.scope === scope ? result : undefined;
  const plan = active?.plan;
  const experimental = forecast?.interval.method === 'experimental_gdelt_scaled_quantiles';
  const quoteAge = forecast ? Math.round((Date.parse(scenarioDate) - Date.parse(forecast.anchor_quote_date)) / 86_400_000) : 0;
  const executedRidge = experimental && forecast?.model_version.includes('-sha256-');
  const targetFor = (h: Horizon) => {
    const base = forecast ? Date.parse(forecast.target_date) - forecastState.horizon * 86_400_000 : Date.parse(scenarioDate);
    return new Date(base + h * 86_400_000).toISOString().slice(0, 10);
  };
  const horizons = [7, 14, 30] as const;
  const fittingHorizons = plan ? horizons.filter(h => targetFor(h) <= plan.purchase_deadline && targetFor(h) > scenarioDate) : [];
  const noHorizonFits = !!plan && !!forecast && forecastState.connected && fittingHorizons.length === 0;
  const fitsSelected = fittingHorizons.includes(forecastState.horizon);
  useEffect(() => {
    if (plan && forecast && !fitsSelected && fittingHorizons.length > 0) forecastState.setHorizon(fittingHorizons[0]);
  }, [plan, forecast, fitsSelected, fittingHorizons[0], forecastState.setHorizon]);
  const afterDeadline = !!(plan && forecast && forecast.target_date > plan.purchase_deadline);
  return <main className="recommendations">
    <header className="rec-header"><div><p className="rec-eyebrow">Purchase planning</p><h1 tabIndex={-1} ref={heading}>Purchase recommendation</h1><p>Compare possible costs for your saved plan.</p></div><AppLink className="rec-back" href="/purchase-plans">Back to purchase plans</AppLink></header>
    {plan && <section className="rec-plan" aria-label="Selected purchase plan"><dl>
      <div><dt>Quantity</dt><dd>{plan.quantity_mt.toLocaleString('en-GB', { maximumFractionDigits: 20 })} MT</dd></div>
      <div><dt>Purchase deadline</dt><dd>{formatDate(plan.purchase_deadline)}</dd></div>
      <div><dt>Current date</dt><dd>{formatDate(plan.scenario_as_of_date)}</dd></div>
      <div><dt>Time remaining</dt><dd>{plan.days_remaining < 0 ? `Overdue by ${Math.abs(plan.days_remaining)} days` : `${plan.days_remaining} ${plan.days_remaining === 1 ? 'day' : 'days'}`}</dd></div>
    </dl></section>}
    {plan && <div className="rec-controls"><label>Urgency for this analysis <select aria-describedby={urgencyHintId} aria-label="Urgency for this analysis" value={urgency} onChange={event => setUrgency(event.target.value as Urgency)}>
      <option value="LOW">Low: flexible timing</option><option value="NORMAL">Normal</option><option value="HIGH">High: prioritise securing supply</option>
    </select></label><p id={urgencyHintId}>Applies to this analysis only. Your saved plan stays the same.</p></div>}
    {plan && forecastState.service && <TimingComparison service={forecastState.service} today={scenarioDate} deadline={plan.purchase_deadline} revision={String(forecastState.refreshKey)} selectedRun={forecast?.run_id} selectedHorizon={forecastState.horizon} refresh={forecastState.retry} select={forecastState.setHorizon} />}
    {experimental && plan && !noHorizonFits && fitsSelected && <aside className="rec-notice" aria-label="Estimate limitations">
      <span className="rec-notice-icon" aria-hidden="true">!</span><div>
      <h2>{plan && plan.days_remaining < 0 ? 'Your purchase deadline has passed' : afterDeadline ? 'This estimate is after your purchase deadline' : executedRidge ? 'Dated Ridge estimate' : 'Timing guidance unavailable'}</h2>
      <p>{afterDeadline ? 'Choose a shorter horizon if one fits your deadline. ' : ''}{quoteAge > 7 ? `The ${executedRidge ? "model anchor" : "latest price"} quote is ${quoteAge} days old (${formatDate(forecast!.anchor_quote_date)}). ` : executedRidge ? `The model targets ${formatDate(forecast!.target_date)} from its ${formatDate(forecast!.forecast_origin_date)} quote anchor. ` : 'No current Ridge forecast is available. '}{executedRidge && quoteAge > 7 ? `The ${forecastState.horizon}-day model targets ${formatDate(forecast!.target_date)} from that anchor. ` : ''}Compare this scenario with a current supplier quote before deciding when to buy.</p>
      <span className="rec-source-label">{executedRidge ? 'Executed Ridge · experimental bounds' : 'Last-quote fallback · Ridge unavailable'}</span>
      </div></aside>}
    {forecastState.connected && plan && <section className="rec-horizon-bar" aria-label="Estimate horizon">
      <div><span className="rec-eyebrow">Estimate date</span><p>{noHorizonFits ? 'No supported horizon fits your deadline' : forecast ? formatDate(forecast.target_date) : 'Choose a horizon'}</p></div>
      <div className="forecast-seg" role="group" aria-label="Forecast horizon">{horizons.map(h =>
        <button key={h} className={h === forecastState.horizon && !noHorizonFits ? 'active' : ''} aria-pressed={h === forecastState.horizon && !noHorizonFits} disabled={!!forecast && !fittingHorizons.includes(h)} title={!fittingHorizons.includes(h) ? `Targets ${formatDate(targetFor(h))}, outside your purchase window` : undefined} onClick={() => forecastState.setHorizon(h)}>{h} days</button>)}</div>
      {!experimental && forecast && <span className="rec-badge">{forecast.interval.method === 'gdelt_error_quantiles' ? 'Ridge regression' : 'Published model forecast'}</span>}
    </section>}
    {noHorizonFits && plan && <section className="rec-card rec-deadline-notice" role="status" aria-label="Purchase deadline guidance">
      <h2>{plan.days_remaining < 0 ? 'Your purchase deadline has passed' : 'Your deadline is before the available forecasts'}</h2>
      <p>The model supports 7, 14 and 30 days from its observed quote. The 7-day estimate targets {formatDate(targetFor(7))}, outside your purchase window ending {formatDate(plan.purchase_deadline)}. A shorter forecast is not available.</p>
      {forecast && <p>Reference cost for {plan.quantity_mt.toLocaleString('en-GB')} MT: <strong>USD {(plan.quantity_mt * forecast.anchor_price).toLocaleString('en-GB', { maximumFractionDigits: 0 })}</strong>, using the observed {formatDate(forecast.anchor_quote_date)} quote of USD {forecast.anchor_price.toLocaleString('en-GB')}/MT. This is a reference, not a forecast or supplier offer.</p>}
      <p>{plan.days_remaining < 0 ? 'Update your purchase plan and obtain a current supplier quote.' : 'Obtain a current supplier quote for your purchase window. You can edit the deadline in your saved plan if your requirements change.'}</p>
      <AppLink className="bb-button" href="/purchase-plans">Review purchase plan</AppLink>
    </section>}
    {forecastState.connected && plan && !forecast && <section className="rec-card" role={forecastState.status === 'error' ? 'alert' : 'status'}>
      <h2>{forecastState.status === 'loading' ? 'Updating estimate…' : 'Price estimate unavailable'}</h2>
      <p>{forecastState.status === 'error' ? forecastState.error : forecastState.data?.status === 'unavailable' ? forecastState.data.message : 'Loading the selected price horizon.'}</p>
      {forecastState.status !== 'loading' && <button className="bb-button" onClick={forecastState.retry}>Retry price estimate</button>}
    </section>}
    {!active ? <section className="rec-card" role="status"><h2>{result ? 'Updating analysis…' : 'Loading purchase plan…'}</h2><p>{result ? 'The plan or current date changed. Previous guidance and cost estimates have been cleared.' : 'Loading your saved purchase plan.'}</p><div className="rec-skeleton" aria-hidden="true" /></section>
      : active.error ? <section className="rec-card rec-error" role="alert"><h2>Couldn’t load analysis</h2><p>Your saved plan could not be loaded for the current planning date.</p><button className="bb-button" onClick={reload}>Retry</button></section>
      : !plan ? <section className="rec-card rec-empty"><h2>No saved purchase plan</h2><p>Choose a saved purchase plan from your plans, or create a new one.</p><AppLink className="bb-button" href="/purchase-plans">Create purchase plan</AppLink></section>
      : <section className="rec-card rec-analysis" aria-label="Purchase analysis">
        {service?.readImpact && (!forecastState.connected || (forecast && fitsSelected)) ? <PurchaseImpact plan={plan} service={service!} reload={reload} horizonDays={forecastState.connected ? forecastState.horizon : undefined} runId={forecast?.run_id} published={forecast} /> : forecastState.connected && <p>Cost impact is unavailable until a current forecast is ready for the selected horizon.</p>}
        {(!forecastState.connected || forecast || (forecastState.status !== 'error' && forecastState.status !== 'loading')) && <Recommendation plan={{ ...plan, urgency }} service={service} reload={reload} requireEvidence={forecastState.connected && !forecast}
          horizonDays={forecastState.connected ? forecastState.horizon : undefined} runId={fitsSelected ? forecast?.run_id : undefined} />}
      </section>}
  </main>;
}

function Recommendation({ plan, service, reload, horizonDays, runId, requireEvidence }: { requireEvidence?: boolean; horizonDays?: number; runId?: string; plan: PurchasePlan & { urgency?: Urgency }; service?: RecommendationService; reload(): void }) {
  const { analysis, loading, error, message, changed, connected, retry } = useAnalysis(service, plan, 'read', horizonDays, runId);

  return <section className="rec-guidance" aria-label="Recommendation" aria-busy={loading}>
    <h2><span className="rec-symbol" aria-hidden="true">▦</span> Recommendation</h2>
    {loading ? <div role="status"><h3>Loading recommendation…</h3><p>The recommendation is loading for your selected saved purchase plan and current planning date.</p><div className="rec-skeleton" aria-hidden="true" /><div className="rec-skeleton rec-skeleton-long" aria-hidden="true" /></div>
      : error ? <div className="rec-empty rec-error" role="alert"><h3>Couldn’t load analysis</h3><p>{message ?? 'We couldn’t load the recommendation for this plan and current date. Your plan remains saved.'}</p><button className="bb-button" onClick={changed ? reload : retry}>{changed ? 'Reload saved plan' : 'Retry recommendation'}</button></div>
      : !connected ? <div className="rec-unavailable"><h3>No recommendation available</h3><p>The recommendations service is not connected yet. Your purchase plan remains saved.</p></div>
      : analysis && <>
        {analysis.recommendation.status === 'ready' && (!requireEvidence || analysis.recommendation.value.evidence) ? <><h3>{analysis.recommendation.value.action}</h3><p>{analysis.recommendation.value.explanation}</p><EvidenceView analysis={analysis} /><p className="rec-context">Current date: {formatDate(analysis.context.scenario_as_of_date)}</p></> : <div className="rec-unavailable"><h3>No recommendation available</h3><p>{analysis.recommendation.status === 'unavailable' ? analysis.recommendation.message : 'Current forecast evidence is unavailable. Refresh evidence before making a timing decision.'}</p><p>Your purchase plan remains saved.</p></div>}
        {(analysis.source === 'mock' || analysis.provenance === 'fixture') && <p className="rec-demo">Synthetic demo data · Illustrative guidance only.</p>}
      </>}
  </section>;
}

function EvidenceView({ analysis }: { analysis: PlanAnalysis }) {
  const e = analysis.recommendation.status === 'ready' ? analysis.recommendation.value.evidence : undefined;
  if (!e) return null;
  const usd = (v: number | null) => v == null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
  return <div className="rec-evidence">
    <ul className="rec-reasons">{e.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
    <dl className="rec-evidence-grid"><div><dt>Estimated buy-now reference cost</dt><dd>{usd(e.buy_now_cost_usd)}</dd></div>
      <div><dt>Estimated full-quantity cost at forecast target</dt><dd>{usd(e.alternative_cost_usd)}</dd></div>
      <div><dt>Alternative minus buy-now (positive costs more)</dt><dd>{usd(e.alternative_minus_now_usd)}</dd></div>
      <div><dt>Selected supported target</dt><dd>{e.supported_target_date ? formatDate(e.supported_target_date) : 'Unavailable'}</dd></div>
      <div><dt>Reference freshness</dt><dd>{e.reference_age_days == null ? 'Unavailable' : `${e.reference_age_days} calendar ${e.reference_age_days === 1 ? 'day' : 'days'} old`}</dd></div></dl>
    {!!e.allocations.length && <div><h4>Illustrative split allocation</h4><ul>{e.allocations.map(a => <li key={a.date}>{a.quantity_mt.toLocaleString('en-GB', { maximumFractionDigits: 20 })} MT on {formatDate(a.date)}</li>)}</ul></div>}
    <details className="rec-forecast rec-assumptions"><summary>Assumptions and limitations</summary><div className="rec-details-body">
      {analysis.reference.status === 'ready' && <p>Reference: USD {analysis.reference.value.price.toLocaleString('en-GB')}/MT, observed {formatDate(analysis.reference.value.observation_date)}.</p>}
      {analysis.forecast.status === 'ready' && <p>Forecast: USD {analysis.forecast.value.central_estimate?.toLocaleString('en-GB') ?? 'unavailable'}/MT on {formatDate(analysis.forecast.value.target_date)}. Experimental range: USD {analysis.forecast.value.prices.lower.toLocaleString('en-GB')}–{analysis.forecast.value.prices.upper.toLocaleString('en-GB')}/MT. {analysis.forecast.value.range_description}</p>}
      <ul>{e.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul><p>Policy: {e.policy_version}. {e.horizon_description}</p></div></details>
  </div>;
}
