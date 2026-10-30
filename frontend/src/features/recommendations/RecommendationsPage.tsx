import { PreviousPlanNote } from '../purchase-plan/components/PreviousPlanNote';
import { SubmittedRecommendationView, RecommendationApproval } from './RecommendationApproval';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppLink } from '../../app/router';
import { calendarDays, formatDate } from '../purchase-plan/dates';
import type { CurrentRecommendation, PurchasePlan, PurchasePlanService, Urgency } from '../purchase-plan/types';
import type { RecommendationService } from './service';
import { useAnalysis } from './useAnalysis';
import { CompareBuyingDates, ExploredDetail, WarningIcon, buildColumns, useHorizonComparison, type ColumnId } from './TimingComparison';
import { DataSources, forecastSource } from './PurchaseImpact';
import { actionLabel, amount, change, changeRange, compact, dayDate, price, readableDates, usd } from './format';
import './recommendations.css';
import type { Horizon, ReadyForecast } from '../forecast/apiService';
import { useForecastContext } from '../forecast/ForecastContext';

export function RecommendationsPage({ planService, service, scenarioDate, refreshScenario, planId, canSubmit = false, canDecide = false }: {
  canSubmit?: boolean; canDecide?: boolean; planId?: string | null; planService: PurchasePlanService; service?: RecommendationService; scenarioDate: string; refreshScenario?: () => void;
}) {
  const forecastState = useForecastContext();
  const forecast = forecastState.data?.status === 'ready' ? forecastState.data : undefined;
  const [attempt, setAttempt] = useState(0);
  const reload = () => { forecastState.retry(); refreshScenario?.(); setAttempt(value => value + 1); };
  const scope = useMemo(() => ({}), [planService, service, scenarioDate, attempt, planId]);
  const [result, setResult] = useState<{ scope: object; plan: PurchasePlan | null; error?: boolean }>();
  const requests = useRef<{ scope: object; promise: ReturnType<PurchasePlanService['read']> } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [explored, setExplored] = useState<ColumnId>();
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
  const comparison = useHorizonComparison(plan ? forecastState.service : undefined, scenarioDate, String(forecastState.refreshKey), forecast?.run_id);
  const { experimental, executedRidge } = forecastSource(forecast);
  const quoteAge = forecast ? calendarDays(forecast.anchor_quote_date, scenarioDate) : 0;
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
  if (plan?.status && plan.status !== 'draft') return <SubmittedRecommendationView key={`${plan.plan_id}:${plan.status}:${attempt}`} canDecide={canDecide} canAct={canSubmit} today={scenarioDate}
    onChanged={saved => setResult({ scope, plan: saved })} onReload={reload} plan={plan} planService={planService} />;
  const refreshPrices = () => { forecastState.retry(); comparison.retry(); };
  // Exploring a fitting horizon also chooses the cost detail sent for approval; other columns are explore-only.
  const explore = (id: ColumnId) => { setExplored(id); if (id !== 'today' && fittingHorizons.includes(id)) forecastState.setHorizon(id); };
  const columns = plan && comparison.entries ? buildColumns(comparison.entries, scenarioDate, plan.purchase_deadline) : [];

  return <main className="recommendations">
    <header className="rec-header">
      <AppLink className="rec-back" href="/purchase-plans" aria-label="Back to purchase plans"><ChevronLeft />Purchase plans</AppLink>
      <h1 tabIndex={-1} ref={heading}>Purchase recommendation</h1>
      {plan && <p>{plan.quantity_mt.toLocaleString('en-GB', { maximumFractionDigits: 20 })} MT · due {dayDate(plan.purchase_deadline, true)} · <strong>{remaining(plan.days_remaining)}</strong></p>}
    </header>
    {plan?.previous_plan_id && <PreviousPlanNote plan={plan} service={planService} />}
    {!active ? <section className="rec-card" role="status"><h2>{result ? 'Updating analysis…' : 'Loading purchase plan…'}</h2><p>{result ? 'The plan or current date changed. Previous guidance and cost estimates have been cleared.' : 'Loading your saved purchase plan.'}</p><div className="rec-skeleton" aria-hidden="true" /></section>
      : active.error ? <section className="rec-card rec-error" role="alert"><h2>Couldn’t load analysis</h2><p>Your saved plan could not be loaded for the current planning date.</p><button className="bb-button" onClick={reload}>Retry</button></section>
      : !plan ? <section className="rec-card rec-empty"><h2>No saved purchase plan</h2><p>Choose a saved purchase plan from your plans, or create a new one.</p><AppLink className="bb-button" href="/purchase-plans">Create purchase plan</AppLink></section>
      : <PlanDecision plan={plan} service={service} reload={reload} published={forecast} connected={forecastState.connected} onRefresh={refreshPrices}
        horizonDays={forecastState.connected ? forecastState.horizon : undefined} runId={fitsSelected ? forecast?.run_id : undefined}
        requireEvidence={forecastState.connected && !forecast}
        showGuidance={!forecastState.connected || !!forecast || (forecastState.status !== 'error' && forecastState.status !== 'loading')}
        guidanceWaiting={forecastState.status === 'loading' ? 'loading' : 'error'}
        showImpact={!!service?.readImpact && (!forecastState.connected || (!!forecast && fitsSelected))}
        impactNote={!forecastState.connected ? undefined : noHorizonFits ? 'No forecast lands before your deadline, so buying today is the only priced option.' : 'Cost impact is unavailable until a current forecast is ready for the selected horizon.'}
        approval={canSubmit && plan.status === 'draft' && !!forecast ? { planService, horizon: forecastState.horizon, onSubmitted: (saved: PurchasePlan) => setResult({ scope, plan: saved }) } : undefined}>
        {guidance => {
          const target = guidance?.evidence?.supported_target_date;
          const recommended: ColumnId[] = guidance?.action === 'BUY_NOW' ? ['today']
            : guidance?.action === 'WAIT' ? columns.filter(c => c.date === target && c.id !== 'today').map(c => c.id) : [];
          const usable = (id?: ColumnId) => columns.find(c => c.id === id && (c.observed || c.forecast));
          const shown = usable(explored) ?? usable(recommended[0]) ?? usable(fitsSelected ? forecastState.horizon : 'today') ?? usable('today');
          return <>
            {noHorizonFits && <section className="rec-card rec-deadline-notice" role="status" aria-label="Purchase deadline guidance">
              <h2>{plan.days_remaining < 0 ? 'Your purchase deadline has passed' : 'Your deadline is before the available forecasts'}</h2>
              <p>The model supports 7, 14 and 30 days from its observed quote. The 7-day estimate targets {formatDate(targetFor(7))}, outside your purchase window ending {formatDate(plan.purchase_deadline)}. A shorter forecast is not available.</p>
              {forecast && <p>The buy-today cost above uses the observed {formatDate(forecast.anchor_quote_date)} quote. It is a reference, not a forecast or supplier offer.</p>}
              <p>{plan.days_remaining < 0 ? 'Update your purchase plan and obtain a current supplier quote.' : 'Obtain a current supplier quote for your purchase window. You can edit the deadline in your saved plan if your requirements change.'}</p>
              <AppLink className="bb-button bb-button--secondary" href="/purchase-plans">Review purchase plan</AppLink>
            </section>}
            {forecastState.connected && !forecast && <section className="rec-card" role={forecastState.status === 'error' ? 'alert' : 'status'}>
              <h2>{forecastState.status === 'loading' ? 'Updating estimate…' : 'Price estimate unavailable'}</h2>
              <p>{forecastState.status === 'error' ? forecastState.error : forecastState.data?.status === 'unavailable' ? forecastState.data.message : 'Loading the selected price horizon.'}</p>
              {forecastState.status !== 'loading' && <button className="bb-button" onClick={forecastState.retry}>Retry price estimate</button>}
            </section>}
            {forecastState.service && <CompareBuyingDates entries={comparison.entries} quantity={plan.quantity_mt} today={scenarioDate} deadline={plan.purchase_deadline}
              explored={shown?.id} recommended={recommended} onExplore={explore}
              knownMessage={!forecast ? (forecastState.status === 'error' ? forecastState.error : forecastState.data?.status === 'unavailable' ? forecastState.data.message : undefined) : undefined}
              badge={!experimental && forecast ? (forecast.interval.method === 'gdelt_error_quantiles' ? 'Ridge regression' : 'Published model forecast') : undefined} />}
            {shown && <ExploredDetail column={shown} quantity={plan.quantity_mt} today={scenarioDate} experimental={experimental}
              source={shown.forecast ? `${executedRidge ? 'Ridge model' : experimental ? 'Last quote carried forward' : forecast?.interval.method === 'gdelt_error_quantiles' ? 'Ridge model, published' : 'Model forecast'} · from the ${formatDate(shown.forecast.anchor_quote_date)} quote` : ''} />}
            {experimental && !noHorizonFits && fitsSelected && <aside className="rec-notice" aria-label="Estimate limitations">
              <WarningIcon /><div>
              <h2>{plan.days_remaining < 0 ? 'Your purchase deadline has passed' : afterDeadline ? 'This estimate is after your purchase deadline' : executedRidge ? 'Dated Ridge estimate' : 'Timing guidance unavailable'}</h2>
              <p>{afterDeadline ? 'Choose a shorter horizon if one fits your deadline. ' : ''}{quoteAge > 7 ? `The ${executedRidge ? 'model anchor' : 'latest price'} quote is ${quoteAge} days old (${formatDate(forecast!.anchor_quote_date)}). ` : executedRidge ? `The model targets ${formatDate(forecast!.target_date)} from its ${formatDate(forecast!.forecast_origin_date)} quote anchor. ` : 'No current Ridge forecast is available. '}{executedRidge && quoteAge > 7 ? `The ${forecastState.horizon}-day model targets ${formatDate(forecast!.target_date)} from that anchor. ` : ''}Compare this scenario with a current supplier quote before deciding when to buy.</p>
              <span className="rec-source-label">{executedRidge ? 'Executed Ridge · experimental bounds' : 'Last-quote fallback · Ridge unavailable'}</span>
              </div></aside>}
          </>;
        }}
      </PlanDecision>}
  </main>;
}

type Approval = { planService: PurchasePlanService; horizon: Horizon; onSubmitted(plan: PurchasePlan): void };

/** Answer, decision rail and fine print; guidance and cost impact load and retry independently. */
function PlanDecision({ plan, service, reload, horizonDays, runId, requireEvidence, approval, showGuidance, guidanceWaiting, showImpact, impactNote, published, connected, onRefresh, children }: {
  plan: PurchasePlan & { urgency?: Urgency }; service?: RecommendationService; reload(): void; horizonDays?: number; runId?: string;
  requireEvidence: boolean; approval?: Approval; showGuidance: boolean; guidanceWaiting: 'loading' | 'error'; showImpact: boolean; impactNote?: string;
  published?: ReadyForecast; connected: boolean; onRefresh(): void; children(guidance?: CurrentRecommendation): ReactNode;
}) {
  const g = useAnalysis(showGuidance ? service : undefined, plan, 'read', horizonDays, runId);
  const i = useAnalysis(showImpact ? service : undefined, plan, 'readImpact', horizonDays, runId);
  const value = g.analysis?.recommendation.status === 'ready' ? g.analysis.recommendation.value : undefined;
  const guidance = value && (!requireEvidence || value.evidence) ? value : undefined;
  const evidence = guidance?.evidence;
  const impact = i.analysis?.cost_impact.status === 'ready' ? i.analysis.cost_impact.value : undefined;
  const impactForecast = i.analysis?.forecast.status === 'ready' ? i.analysis.forecast.value : undefined;
  const impactReady = impact?.target_date && impactForecast?.target_date === impact.target_date ? impact : undefined;
  const buyNow = evidence?.buy_now_cost_usd ?? impactReady?.reference_total ?? (published ? published.anchor_price * plan.quantity_mt : undefined);
  const waitTarget = guidance?.action === 'WAIT' && evidence?.supported_target_date && evidence.alternative_cost_usd != null ? evidence.supported_target_date : undefined;
  const reference = (g.analysis ?? i.analysis)?.reference;
  const quote = published?.anchor_quote_date ?? (reference?.status === 'ready' ? reference.value.observation_date : undefined);
  const demo = !!published?.synthetic || [g.analysis, i.analysis].some(a => a && (a.source === 'mock' || a.provenance === 'fixture'));

  const impactTile = showImpact ? <div className="rec-tile" aria-busy={i.loading}>
    {i.loading ? <div role="status"><span className="rec-tile-label">Estimated cost</span><div className="rec-skeleton" /><p>Loading cost impact for {amount(plan.quantity_mt)} MT…</p></div>
      : i.error ? <div role="alert"><span className="rec-tile-label">Cost estimate unavailable</span><p>{i.message ?? 'Couldn’t load cost impact. Your plan remains saved.'}</p><button className="bb-button bb-button--secondary" onClick={i.changed ? reload : i.retry}>{i.changed ? 'Reload saved plan' : 'Retry cost impact'}</button></div>
      : impactReady ? <>
        <span className="rec-tile-label">If you buy {dayDate(impactReady.target_date!)}</span>
        <strong className="rec-tile-value">USD {compact(impactReady.forecast_total.lower)}–{compact(impactReady.forecast_total.upper)}</strong>
        <span className="rec-tile-note">{changeRange(impactReady.difference_total.lower, impactReady.difference_total.upper)}</span>
        <span className="rec-tile-note">{impactForecast!.basis.currency} {price(impactForecast!.prices.lower)}–{price(impactForecast!.prices.upper)}/{impactForecast!.basis.unit} · {forecastSource(published).experimental ? 'Coverage has not been measured' : 'An estimate, not a supplier quote'}</span>
      </> : <p className="rec-tile-note">{i.analysis?.cost_impact.status === 'unavailable' ? i.analysis.cost_impact.message : 'Cost impact is unavailable for this forecast date.'}</p>}
  </div> : impactNote && <div className="rec-tile rec-tile--note"><p className="rec-tile-note">{impactNote}</p></div>;

  return <div className="rec-layout">
    <section className="rec-answer" aria-label="Recommendation" aria-busy={g.loading}>
      {!showGuidance ? <div role="status"><span className="rec-kicker">Recommended action</span>
        <h2>{guidanceWaiting === 'loading' ? 'Loading recommendation…' : 'Recommendation unavailable'}</h2>
        <p>{guidanceWaiting === 'loading' ? 'Waiting for the latest price estimate.' : 'A current price estimate is needed before a recommendation can be shown.'}</p></div>
      : g.loading ? <div role="status"><span className="rec-kicker">Recommended action</span><h2>Loading recommendation…</h2><p>The recommendation is loading for your selected saved purchase plan and current planning date.</p><div className="rec-skeleton" aria-hidden="true" /></div>
      : g.error ? <div role="alert"><span className="rec-kicker">Recommended action</span><h2>Couldn’t load analysis</h2><p>{g.message ?? 'We couldn’t load the recommendation for this plan and current date. Your plan remains saved.'}</p><button className="bb-button bb-button--secondary" onClick={g.changed ? reload : g.retry}>{g.changed ? 'Reload saved plan' : 'Retry recommendation'}</button></div>
      : !g.connected ? <div><span className="rec-kicker">Recommended action</span><h2>No recommendation available</h2><p>The recommendations service is not connected yet. Your purchase plan remains saved.</p></div>
      : guidance ? <div className="rec-verdict">
        <span className="rec-verdict-icon" aria-hidden="true"><ActionIcon action={guidance.action} /></span>
        <div><span className="rec-kicker">Recommended action</span><h2>{actionLabel(guidance.action)}</h2>
          {tagline(guidance, plan) && <p className="rec-tagline">{tagline(guidance, plan)}</p>}
          <p className="rec-reason">{readableDates(guidance.explanation)}</p></div>
      </div>
      : g.analysis && <div><span className="rec-kicker">Recommended action</span><h2>No recommendation available</h2><p>{g.analysis.recommendation.status === 'unavailable' ? g.analysis.recommendation.message : 'Current forecast evidence is unavailable. Refresh evidence before making a timing decision.'}</p><p>Your purchase plan remains saved.</p></div>}
      {(buyNow != null || waitTarget || impactTile) && <div className="rec-tiles">
        {buyNow != null && <div className={`rec-tile${guidance?.action === 'BUY_NOW' ? ' rec-tile--recommended' : ''}`}>
          <span className="rec-tile-label">{waitTarget ? 'If you buy today' : 'Buy today'}</span>
          <strong className="rec-tile-value">{usd(buyNow)}</strong>
          <span className="rec-tile-note">{amount(plan.quantity_mt)} MT × USD {amount(buyNow / plan.quantity_mt)}/MT</span>
        </div>}
        {waitTarget ? <div className="rec-tile rec-tile--recommended">
          <span className="rec-tile-label">Buy on {dayDate(waitTarget)}</span>
          <strong className="rec-tile-value">{usd(evidence!.alternative_cost_usd!)}</strong>
          <span className="rec-tile-note">{evidence!.alternative_minus_now_usd != null && `About ${change(evidence!.alternative_minus_now_usd)} than buying today · `}weighted forecast signal</span>
        </div> : impactTile}
      </div>}
      {demo && <p className="rec-demo">Synthetic demo data · Illustrative guidance only.</p>}
    </section>

    <aside className="rec-rail" aria-label="Decision">
      <div className="rec-rail-card">
        <div><span className="rec-kicker">Your decision</span><strong className="rec-rail-action">{guidance ? actionLabel(guidance.action) : 'No recommendation yet'}</strong></div>
        <dl className="rec-rail-facts">
          <div><dt>Plan</dt><dd>{plan.quantity_mt.toLocaleString('en-GB', { maximumFractionDigits: 20 })} MT</dd></div>
          <div><dt>Deadline</dt><dd>{dayDate(plan.purchase_deadline)} · {remaining(plan.days_remaining)}</dd></div>
          {waitTarget ? <div><dt>Buy on {dayDate(waitTarget)}</dt><dd>{usd(evidence!.alternative_cost_usd!)}</dd></div>
            : buyNow != null && <div><dt>Buy today</dt><dd>{usd(buyNow)}</dd></div>}
        </dl>
        {approval && guidance && g.analysis && <RecommendationApproval key={`${g.analysis.approval_fingerprint}:${approval.horizon}`} analysis={g.analysis} plan={plan} horizon={approval.horizon} planService={approval.planService} onSubmitted={approval.onSubmitted} />}
        {connected && <button type="button" className="bb-button bb-button--secondary rec-refresh" onClick={onRefresh}><RefreshIcon />Refresh prices</button>}
      </div>
      {quote && <p className="rec-rail-note">Prices use the MGO quote observed {dayDate(quote)}, {quoteAgeText(calendarDays(quote, plan.scenario_as_of_date))}. Confirm a current supplier quote before you buy.</p>}
    </aside>

    <div className="rec-evidence">
      {children(guidance)}
      {evidence && <details className="rec-fine">
        <summary>How this recommendation was calculated</summary>
        <div className="rec-fine-body">
          <ul>
            <li>Only forecasts that land on or before your deadline are used.</li>
            <li>The two eligible forecasts nearest your deadline are blended, weighted by how close each target date is to it. A single eligible forecast is used on its own.</li>
            <li>If the blended price is below today’s, the plan waits for that forecast’s date; otherwise it buys today.</li>
            <li>If the blended range overlaps today’s price, or the quote is more than 7 days old, the advice is to monitor instead. Never wait past your deadline.</li>
          </ul>
          <h3>For this plan</h3>
          <ul>{evidence.reasons.map((reason, n) => <li key={n}>{readableDates(reason)}</li>)}</ul>
        </div>
      </details>}
      <DataSources impact={i.analysis} guidance={g.analysis} published={published} />
    </div>
  </div>;
}

function tagline(guidance: CurrentRecommendation, plan: PurchasePlan) {
  const target = guidance.evidence?.supported_target_date;
  const age = guidance.evidence?.reference_age_days;
  if (guidance.action === 'BUY_NOW') return `Buy all ${plan.quantity_mt.toLocaleString('en-GB', { maximumFractionDigits: 20 })} MT today.`;
  if (guidance.action === 'WAIT') return target ? `Hold off and buy on ${dayDate(target)}.` : 'Hold off for now.';
  if (guidance.action !== 'MONITOR') return undefined;
  if (plan.days_remaining < 0) return 'Your deadline has passed. Update the plan before deciding.';
  if (age != null && age > 7) return 'Get a current supplier quote before deciding.';
  if (target && target > plan.scenario_as_of_date) return `Hold off and re-check prices by ${dayDate(target)}.`;
  return `Hold off and re-check prices before your deadline, ${dayDate(plan.purchase_deadline)}.`;
}

const remaining = (days: number) => days < 0 ? `Overdue by ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'}` : `${days} ${days === 1 ? 'day' : 'days'} left`;
const quoteAgeText = (days: number) => days === 0 ? 'today' : `${days} ${days === 1 ? 'day' : 'days'} ago`;

function ActionIcon({ action }: { action: string }) {
  const path = action === 'BUY_NOW' ? <path d="M5 12.5l4.5 4.5L19 7.5" />
    : action === 'WAIT' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>
    : action === 'MONITOR' ? <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>
    : <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></>;
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
}
function ChevronLeft() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>;
}
function RefreshIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>;
}
