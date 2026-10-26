import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLink } from '../../app/router';
import { formatDate } from '../purchase-plan/dates';
import type { PurchasePlan, PurchasePlanService } from '../purchase-plan/types';
import type { RecommendationService } from './service';
import { useAnalysis } from './useAnalysis';
import { PurchaseImpact } from './PurchaseImpact';
import './recommendations.css';
import ForecastWidget from '../forecast/ForecastWidget';
import { useForecastContext } from '../forecast/ForecastContext';

export function RecommendationsPage({ planService, service, scenarioDate, refreshScenario, planId }: {
  planId?: string | null; planService: PurchasePlanService; service?: RecommendationService; scenarioDate: string; refreshScenario?: () => void;
}) {
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
  return <main className="recommendations">
    <header className="rec-header"><div><h1 tabIndex={-1} ref={heading}>Purchase recommendation</h1><p>Review the recommendation for your selected purchase plan and current application date.</p></div><AppLink className="rec-back" href="/purchase-plans">Back to purchase plans</AppLink></header>
    <section aria-label="Purchase plan price range">{forecast?.interval.method === 'experimental_gdelt_scaled_quantiles'
      ? <ExperimentalRange /> : <ForecastWidget />}</section>
    {plan && <section className="rec-card rec-plan" aria-labelledby="rec-plan-title"><h2 id="rec-plan-title">Selected purchase plan</h2><dl>
      <div><dt>Quantity</dt><dd>{plan.quantity_mt.toLocaleString('en-GB', { maximumFractionDigits: 20 })} MT</dd></div>
      <div><dt>Purchase deadline</dt><dd>{formatDate(plan.purchase_deadline)}</dd></div>
      <div><dt>Application date</dt><dd>{formatDate(plan.scenario_as_of_date)}</dd></div>
      <div><dt>Time remaining</dt><dd>{plan.days_remaining < 0 ? `Overdue by ${Math.abs(plan.days_remaining)} days` : `${plan.days_remaining} ${plan.days_remaining === 1 ? 'day' : 'days'}`}</dd></div>
    </dl></section>}
    {!active ? <section className="rec-card" role="status"><h2>{result ? 'Updating analysis…' : 'Loading purchase plan…'}</h2><p>{result ? 'The plan or scenario changed. Previous guidance and cost estimates have been cleared.' : 'Loading your saved purchase plan.'}</p><div className="rec-skeleton" aria-hidden="true" /></section>
      : active.error ? <section className="rec-card rec-error" role="alert"><h2>Couldn’t load analysis</h2><p>Your saved plan could not be loaded for the current application date.</p><button className="bb-button" onClick={reload}>Retry</button></section>
      : !plan ? <section className="rec-card rec-empty"><h2>No saved purchase plan</h2><p>Choose a saved purchase plan from your plans, or create a new one.</p><AppLink className="bb-button" href="/purchase-plans">Create purchase plan</AppLink></section>
      : <section className="rec-card rec-analysis" aria-label="Purchase analysis">
        {(!forecastState.connected || forecast) && <Recommendation plan={plan} service={service} reload={reload}
          horizonDays={forecastState.connected ? forecastState.horizon : undefined} runId={forecast?.run_id} />}
        {service?.readImpact && (!forecastState.connected || forecast) ? <PurchaseImpact plan={plan} service={service!} reload={reload} horizonDays={forecastState.connected ? forecastState.horizon : undefined} runId={forecast?.run_id} /> : forecastState.connected && <p>Cost impact is unavailable until a current forecast is ready for the selected horizon.</p>}
      </section>}
  </main>;
}

function Recommendation({ plan, service, reload, horizonDays, runId }: { horizonDays?: number; runId?: string; plan: PurchasePlan; service?: RecommendationService; reload(): void }) {
  const { analysis, loading, error, message, changed, connected, retry } = useAnalysis(service, plan, 'read', horizonDays, runId);
  return <section className="rec-guidance" aria-label="Recommendation" aria-busy={loading}>
    <h2><span className="rec-symbol" aria-hidden="true">▦</span> Recommendation</h2>
    {loading ? <div role="status"><h3>Loading recommendation…</h3><p>The recommendation is loading for your selected saved purchase plan and application date.</p><div className="rec-skeleton" aria-hidden="true" /><div className="rec-skeleton rec-skeleton-long" aria-hidden="true" /></div>
      : error ? <div className="rec-empty rec-error" role="alert"><h3>Couldn’t load analysis</h3><p>{message ?? 'We couldn’t load the recommendation for this plan and scenario. Your plan remains saved.'}</p><button className="bb-button" onClick={changed ? reload : retry}>{changed ? 'Reload saved plan' : 'Retry recommendation'}</button></div>
      : !connected ? <div className="rec-unavailable"><h3>No recommendation available</h3><p>The recommendations service is not connected yet. Your purchase plan remains saved.</p></div>
      : analysis && <>
        {analysis.recommendation.status === 'ready' ? <><h3>{analysis.recommendation.value.action}</h3><p>{analysis.recommendation.value.explanation}</p><p className="rec-context">Based on the {formatDate(analysis.context.scenario_as_of_date)} scenario</p></> : <div className="rec-unavailable"><h3>No recommendation available</h3><p>{analysis.recommendation.message}</p><p>Your purchase plan remains saved.</p></div>}
        {(analysis.source === 'mock' || analysis.provenance === 'fixture') && <p className="rec-demo">Synthetic demo data · Illustrative guidance; recommendation policy pending confirmation.</p>}
      </>}
  </section>;
}

/** Plan-only display avoids presenting the experimental bounds as confidence coverage. */
function ExperimentalRange() {
  const state = useForecastContext();
  const data = state.data?.status === 'ready' ? state.data : undefined;
  if (!data) return null;
  const money = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const quoteAge = Math.round((Date.parse(data.forecast_origin_date) - Date.parse(data.anchor_quote_date)) / 86_400_000);
  const newsDate = data.source_dates.gdelt ?? data.news_window_start.slice(0, 10);
  return <section className="rec-card" aria-label="Experimental news-adjusted range">
    <h2>Experimental news-adjusted price range</h2>
    <div className="forecast-seg" role="group" aria-label="Forecast horizon">{([7, 14, 30] as const).map(h =>
      <button key={h} className={h === state.horizon ? 'active' : ''} aria-pressed={h === state.horizon} onClick={() => state.setHorizon(h)}>{h}d</button>)}</div>
    <p><strong>USD {money(data.low)}–{money(data.high)}/MT</strong> · target {formatDate(data.target_date)}</p>
    <p>Central estimate: USD {money(data.forecast)}/MT · last observed quote from {formatDate(data.anchor_quote_date)}.</p>
    <p>Experimental estimate, not calibrated confidence. Coverage has not been measured.</p>
    <p>Uses {formatDate(newsDate)} UTC news. News activity and tone adjust the range, not the central estimate.</p>
    {quoteAge > 7 && <p role="note"><strong>Price reference is {quoteAge} days old.</strong> Compare this scenario with a current supplier quote.</p>}
    <details><summary>News inputs and methodology</summary><p>{data.interval.limitations}</p><p>{data.interval.evaluation_scope}</p></details>
  </section>;
}
