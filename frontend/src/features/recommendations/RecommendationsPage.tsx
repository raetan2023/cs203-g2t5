import { PreviousPlanNote } from '../purchase-plan/components/PreviousPlanNote';
import { RecommendationApproval, SUBMIT_LABEL, SubmittedRecommendationView } from './RecommendationApproval';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppLink } from '../../app/router';
import { addCalendarDays, formatDate } from '../purchase-plan/dates';
import type { CurrentRecommendation, PlanAnalysis, PurchasePlan, PurchasePlanService, Urgency } from '../purchase-plan/types';
import type { RecommendationService } from './service';
import { useAnalysis } from './useAnalysis';
import { RecommendationLoading } from './RecommendationLoading';
import { CalculationSteps } from './CalculationSteps';
import { CompareBuyingDates, buildColumns, useHorizonComparison, type Column, type ColumnId, type Entry } from './TimingComparison';
import { forecastSource } from './PurchaseImpact';
import { KeyAssumptions } from './KeyAssumptions';
import { RecommendationReportDownload } from './RecommendationReportDownload';
import { HeroFigures, verdictNote, type HeroPoint } from './RecommendationHero';
import { actionLabel, amount, dayDate, readableDates, usd } from './format';
import './recommendations.css';
import type { Horizon, ReadyForecast } from '../forecast/apiService';
import { useForecastContext } from '../forecast/ForecastContext';

export function RecommendationsPage({ planService, service, scenarioDate, refreshScenario, planId, canSubmit = false, canDecide = false }: {
  canSubmit?: boolean; canDecide?: boolean; planId?: string | null; planService: PurchasePlanService; service?: RecommendationService; scenarioDate: string; refreshScenario?: () => void;
}) {
  const forecastState = useForecastContext();
  const contextForecast = forecastState.data?.status === 'ready' ? forecastState.data : undefined;
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
  const comparison = useHorizonComparison(plan ? forecastState.service : undefined, scenarioDate, String(forecastState.refreshKey), contextForecast?.run_id);
  const entryFor = (h: Horizon) => comparison.entries?.find(entry => entry.horizon === h);
  // While the shared provider switches horizon, the comparison already holds the same forecast.
  const selectedForecast = contextForecast ?? (forecastState.status === 'loading' ? entryFor(forecastState.horizon)?.forecast : undefined);
  const upcoming = (f?: ReadyForecast) => f && f.target_date > scenarioDate ? f : undefined;
  const forecast = upcoming(selectedForecast);
  const referenceForecast = selectedForecast ?? comparison.entries?.find(entry => entry.forecast)?.forecast;
  const { experimental, executedRidge, newsAware } = forecastSource(forecast);
  // Each model has its own origin date, so a forecast is judged on its own target date.
  const targetFor = (h: Horizon) => entryFor(h)?.forecast?.target_date ?? (selectedForecast?.horizon_days === h ? selectedForecast.target_date
    : addCalendarDays(referenceForecast?.forecast_origin_date ?? scenarioDate, h));
  const horizons = [7, 14, 30] as const;
  const fittingHorizons = plan ? horizons.filter(h => (!comparison.entries || upcoming(entryFor(h)?.forecast))
    && targetFor(h) <= plan.purchase_deadline && targetFor(h) > scenarioDate) : [];
  const noHorizonFits = !!plan && !!forecast && forecastState.connected && fittingHorizons.length === 0;
  const outdatedForecast = !!referenceForecast && !forecast;
  const fitsSelected = fittingHorizons.includes(forecastState.horizon);
  // The buyer doesn't choose a window. The date nearest the deadline is the cost detail: it carries the most weight,
  // and it is the date a Wait targets. One expired or unavailable horizon must not hide the other usable forecasts.
  const preferred = !comparison.entries ? undefined : fittingHorizons.at(-1) ?? comparison.entries.find(entry => upcoming(entry.forecast))?.horizon;
  useEffect(() => {
    if (plan && preferred && preferred !== forecastState.horizon) forecastState.setHorizon(preferred);
  }, [plan, preferred, forecastState.horizon, forecastState.setHorizon]);
  // Waiting for the default date keeps the first answer from being requested twice.
  const settled = !forecastState.connected || (!!comparison.entries && (!preferred || preferred === forecastState.horizon));
  if (plan?.status && plan.status !== 'draft') return <SubmittedRecommendationView key={`${plan.plan_id}:${plan.status}:${attempt}`} canDecide={canDecide} canAct={canSubmit} today={scenarioDate}
    onChanged={saved => setResult({ scope, plan: saved })} onReload={reload} plan={plan} planService={planService} />;
  const refreshPrices = () => { forecastState.retry(); comparison.retry(); };
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
      : <PlanDecision plan={plan} planService={planService} service={service} reload={reload} published={referenceForecast} entries={comparison.entries} columns={columns} connected={forecastState.connected} onRefresh={refreshPrices} readOnly={!canSubmit}
        horizonDays={forecastState.connected ? forecastState.horizon : undefined} targetDate={forecast?.target_date} runId={fitsSelected ? forecast?.run_id : undefined}
        requireEvidence={forecastState.connected && !forecast}
        showGuidance={!forecastState.connected || (!!forecast && settled)}
        guidanceWaiting={forecastState.status === 'loading' || !settled ? 'loading' : 'error'}
        showImpact={!!service?.readImpact && (!forecastState.connected || (!!forecast && fitsSelected && settled))}
        impactNote={!forecastState.connected || noHorizonFits ? undefined : 'Cost impact is unavailable until a current forecast is ready for the selected date.'}
        approval={canSubmit && plan.status === 'draft' && !!forecast ? { planService, horizon: forecastState.horizon, onSubmitted: (saved: PurchasePlan) => setResult({ scope, plan: saved }) } : undefined}>
        {(guidance, preparing) => {
          const target = guidance?.evidence?.supported_target_date;
          const recommended: ColumnId[] = guidance?.action === 'BUY_NOW' ? ['today']
            : guidance?.action === 'WAIT' ? columns.filter(c => c.date === target && c.id !== 'today').map(c => c.id) : [];
          return <>
            {noHorizonFits && <section className="rec-card rec-deadline-notice" role="status" aria-label="Purchase deadline guidance">
              <h2>{plan.days_remaining < 0 ? 'Your purchase deadline has passed' : 'Your deadline is before the available forecasts'}</h2>
              <p>No available 7, 14 or 30-day forecast lands on or before your deadline of {formatDate(plan.purchase_deadline)}. A shorter forecast is not available.</p>
              {forecast && <p>The buy-today cost above uses the observed {formatDate(forecast.anchor_quote_date)} quote. It is a reference, not a forecast or supplier offer.</p>}
              <p>{plan.days_remaining < 0 ? 'Update your purchase plan and obtain a current supplier quote.' : 'Obtain a current supplier quote for your purchase window. You can edit the deadline in your saved plan if your requirements change.'}</p>
              <AppLink className="bb-button bb-button--secondary" href="/purchase-plans">Review purchase plan</AppLink>
            </section>}
            {/* While the estimate loads, the recommendation's progress view covers it. */}
            {forecastState.connected && !forecast && forecastState.status !== 'loading' && <section className="rec-card" role={forecastState.status === 'error' ? 'alert' : 'status'}>
              <h2>Price estimate unavailable</h2>
              <p>{outdatedForecast
                ? `The ${forecastState.horizon}-day forecast date, ${formatDate(targetFor(forecastState.horizon))}, has passed and a newer quote is needed. Older estimates are excluded from costs, recommendations and approval requests.`
                : forecastState.status === 'error' ? forecastState.error : forecastState.data?.status === 'unavailable' ? forecastState.data.message : 'The selected price horizon could not be loaded.'}</p>
              <button className="bb-button" onClick={forecastState.retry}>Retry price estimate</button>
            </section>}
            {preparing ? <CompareSkeleton /> : forecastState.service && <CompareBuyingDates entries={comparison.entries} quantity={plan.quantity_mt} today={scenarioDate} deadline={plan.purchase_deadline}
              recommended={recommended}
              knownMessage={!forecast ? (forecastState.status === 'error' ? forecastState.error : forecastState.data?.status === 'unavailable' ? forecastState.data.message : undefined) : undefined}
              badge={newsAware ? 'News-aware Ridge · experimental bounds' : executedRidge ? 'Executed Ridge · experimental bounds' : experimental ? 'Last-quote fallback · Ridge unavailable'
                : forecast ? (forecast.interval.method === 'gdelt_error_quantiles' ? 'Ridge regression' : 'Published model forecast') : undefined} />}
          </>;
        }}
      </PlanDecision>}
  </main>;
}

type Approval = { planService: PurchasePlanService; horizon: Horizon; onSubmitted(plan: PurchasePlan): void };

/** Answer, comparison, method, then the decision; guidance and cost impact load and retry independently. */
function PlanDecision({ plan, planService, service, reload, horizonDays, targetDate, runId, requireEvidence, approval, showGuidance, guidanceWaiting, showImpact, impactNote, published, entries, columns, connected, onRefresh, readOnly = false, children }: {
  plan: PurchasePlan & { urgency?: Urgency }; planService: PurchasePlanService; service?: RecommendationService; reload(): void; horizonDays?: number; targetDate?: string; runId?: string;
  requireEvidence: boolean; approval?: Approval; showGuidance: boolean; guidanceWaiting: 'loading' | 'error'; showImpact: boolean; impactNote?: string;
  published?: ReadyForecast; entries?: Entry[]; columns: Column[]; connected: boolean; onRefresh(): void; readOnly?: boolean; children(guidance: CurrentRecommendation | undefined, preparing: boolean): ReactNode;
}) {
  const g = useAnalysis(showGuidance ? service : undefined, plan, 'read', horizonDays, runId);
  const i = useAnalysis(showImpact ? service : undefined, plan, 'readImpact', horizonDays, runId);
  // The action doesn't depend on the selected date, so the last answer stays up while another date or a refresh loads.
  const held = g.loading ? g.held : undefined;
  const analysis = g.analysis ?? held;
  const currentAnalysis = !connected || !!held || g.analysis?.forecast.status === 'ready' && g.analysis.forecast.value.target_date === targetDate;
  const value = analysis?.recommendation.status === 'ready' ? analysis.recommendation.value : undefined;
  const guidance = currentAnalysis && value && (!requireEvidence || value.evidence) ? value : undefined;
  const evidence = guidance?.evidence;
  const impact = i.analysis?.cost_impact.status === 'ready' ? i.analysis.cost_impact.value : undefined;
  const impactForecast = i.analysis?.forecast.status === 'ready' ? i.analysis.forecast.value : undefined;
  const impactReady = impact?.target_date && impactForecast?.target_date === impact.target_date
    && (!connected || impact.target_date === targetDate) ? impact : undefined;
  const buyNow = evidence?.buy_now_cost_usd ?? impactReady?.reference_total ?? (published ? published.anchor_price * plan.quantity_mt : undefined);
  const waitTarget = guidance?.action === 'WAIT' && evidence?.supported_target_date && evidence.alternative_cost_usd != null ? evidence.supported_target_date : undefined;
  // With live forecasts, show step-by-step progress until the answer (or an error) replaces it.
  const preparing = connected && !held && (showGuidance ? g.loading : guidanceWaiting === 'loading');
  const demo = !!published?.synthetic || [analysis, i.analysis].some(a => a && (a.source === 'mock' || a.provenance === 'fixture'));
  const costDetail = runId && horizonDays && targetDate ? `${horizonDays}-day forecast · ${dayDate(targetDate)}` : undefined;
  // The hero is fixed to the recommendation: a Wait shows its own date's forecast, a Buy now the date it passes up,
  // and Monitor the cost-detail date.
  const pointOf = (column?: Column): HeroPoint | undefined => column?.forecast
    ? { date: column.date!, name: column.label.replace(' days', '-day'), mid: column.mid, low: column.low, high: column.high } : undefined;
  const impactPoint: HeroPoint | undefined = impactReady && impactForecast
    ? { date: impactReady.target_date!, name: horizonDays ? `${horizonDays}-day` : undefined, mid: impactForecast.central_estimate, low: impactForecast.prices.lower, high: impactForecast.prices.upper } : undefined;
  const signalPoint: HeroPoint | undefined = waitTarget ? { date: waitTarget, mid: evidence!.alternative_cost_usd! / plan.quantity_mt } : undefined;
  const point = guidance?.action === 'WAIT' ? pointOf(columns.find(column => column.date === waitTarget)) ?? signalPoint ?? impactPoint
    : guidance?.action === 'BUY_NOW' ? pointOf(columns.filter(column => column.forecast && !column.late).at(-1)) ?? impactPoint
    : pointOf(columns.find(column => column.id === horizonDays)) ?? impactPoint;
  const quote = buyNow == null ? undefined : buyNow / plan.quantity_mt;
  const reference = (analysis ?? i.analysis)?.reference;
  const quoteDate = published?.anchor_quote_date ?? (reference?.status === 'ready' ? reference.value.observation_date : undefined);
  const note = guidance && verdictNote(guidance.action, plan.purchase_deadline, plan.days_remaining, waitTarget, quote, point);

  const impactTile = showImpact ? <div className="rec-tile" aria-busy={i.loading}>
    {i.loading ? <div role="status"><span className="rec-tile-label">Estimated cost</span><div className="rec-skeleton" /><p>Loading cost impact for {amount(plan.quantity_mt)} MT…</p></div>
      : i.error ? <div role="alert"><span className="rec-tile-label">Cost estimate unavailable</span><p>{i.message ?? 'Couldn’t load cost impact. Your plan remains saved.'}</p><button className="bb-button bb-button--secondary" onClick={i.changed ? reload : i.retry}>{i.changed ? 'Reload saved plan' : 'Retry cost impact'}</button></div>
      : <p className="rec-tile-note">{i.analysis?.cost_impact.status === 'unavailable' ? i.analysis.cost_impact.message : 'Cost impact is unavailable for this forecast date.'}</p>}
  </div> : impactNote && <div className="rec-tile rec-tile--note"><p className="rec-tile-note">{impactNote}</p></div>;
  const refresh = connected && <button type="button" className="bb-button bb-button--secondary rec-refresh" onClick={onRefresh}><RefreshIcon />Refresh prices</button>;
  // Phones (docs/ui-revamp/MOBILE_PLAN.md): the decision sits far down the page, so a bar fixed to the bottom
  // jumps to it. It only scrolls; submitting still happens in the decision section. Hidden once that section is on screen.
  const decision = useRef<HTMLElement>(null);
  const [decisionInView, setDecisionInView] = useState(false);
  const canJump = !!(approval && guidance && g.analysis);
  useEffect(() => {
    const target = decision.current;
    if (!canJump || !target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setDecisionInView(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [canJump]);
  const jumpToDecision = () => {
    decision.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    decision.current?.focus({ preventScroll: true });
  };

  return <div className="rec-flow">
    <section className="rec-answer" aria-label="Recommendation" aria-busy={preparing || g.loading}>
      {preparing ? <RecommendationLoading entries={entries} published={published} today={plan.scenario_as_of_date} deadline={plan.purchase_deadline} onRetry={showGuidance ? g.retry : onRefresh} />
      : !showGuidance ? <div role="status"><span className="rec-kicker">Recommended action</span>
        <h2>{guidanceWaiting === 'loading' ? 'Loading recommendation…' : 'Recommendation unavailable'}</h2>
        <p>{guidanceWaiting === 'loading' ? 'Waiting for the latest price estimate.' : 'A current price estimate is needed before a recommendation can be shown.'}</p></div>
      : g.loading && !held ? <div role="status"><span className="rec-kicker">Recommended action</span><h2>Loading recommendation…</h2><p>The recommendation is loading for your selected saved purchase plan and current planning date.</p><div className="rec-skeleton" aria-hidden="true" /></div>
      : g.error ? <div role="alert"><span className="rec-kicker">Recommended action</span><h2>Couldn’t load analysis</h2><p>{g.message ?? 'We couldn’t load the recommendation for this plan and current date. Your plan remains saved.'}</p><button className="bb-button bb-button--secondary" onClick={g.changed ? reload : g.retry}>{g.changed ? 'Reload saved plan' : 'Retry recommendation'}</button></div>
      : !g.connected ? <div><span className="rec-kicker">Recommended action</span><h2>No recommendation available</h2><p>The recommendations service is not connected yet. Your purchase plan remains saved.</p></div>
      : guidance ? <div className={`rec-hero${actionLabel(guidance.action).length > 16 ? ' rec-hero--long' : ''}`}>
        <span className="rec-kicker">Recommended action</span>
        <div className="rec-hero-line">
          <span className="rec-hero-action"><span className="rec-verdict-icon" aria-hidden="true"><ActionIcon action={guidance.action} /></span><h2>{actionLabel(guidance.action)}</h2></span>
          {waitTarget && <span className="rec-hero-date">and buy on {dayDate(waitTarget)}</span>}
        </div>
        {note ? <p className="rec-reason">{note}</p> : <>
          {tagline(guidance, plan) && <p className="rec-tagline">{tagline(guidance, plan)}</p>}
          <p className="rec-reason">{readableDates(guidance.explanation)}</p>
        </>}
      </div>
      : analysis && <div><span className="rec-kicker">Recommended action</span><h2>No recommendation available</h2><p>{analysis.recommendation.status === 'unavailable' ? analysis.recommendation.message : 'Current forecast evidence is unavailable. Refresh evidence before making a timing decision.'}</p><p>Your purchase plan remains saved.</p></div>}
      {!preparing && <HeroFigures action={guidance?.action} quote={quote} quoteDate={quoteDate} quantity={plan.quantity_mt} point={point} published={published} pending={impactTile || undefined} />}
      {/* The forecast figures can be ready when the cost analysis isn't; its reason still has to show. */}
      {!preparing && point && showImpact && !i.loading && !impactReady && impactTile}
      {demo && <p className="rec-demo">Synthetic demo data · Illustrative guidance only.</p>}
    </section>

    {children(guidance, preparing)}

    {!preparing && (evidence || impactReady) && <div className="rec-evidence">
      {evidence && <CalculationSteps evidence={evidence} action={guidance!.action} columns={columns} deadline={plan.purchase_deadline} quantity={plan.quantity_mt} />}
      <KeyAssumptions evidence={evidence} reference={reference} published={published} today={plan.scenario_as_of_date} />
    </div>}

    {canJump && !decisionInView && <div className="rec-jump-bar"><button type="button" className="bb-button" onClick={jumpToDecision}>Review and submit</button></div>}
    <section ref={decision} tabIndex={-1} className="rec-summary" aria-label={readOnly ? 'Recommendation summary' : 'Decision'}>
      <div className="rec-summary-main">
        <div><h2 className="rec-kicker">Recommendation summary</h2>{preparing ? <span className="rec-shimmer rec-rail-pending" aria-hidden="true" />
          : <strong className="rec-summary-action">{guidance ? actionLabel(guidance.action) : 'No recommendation yet'}</strong>}</div>
        <dl className="rec-summary-facts">
          <div><dt>Plan</dt><dd>{plan.quantity_mt.toLocaleString('en-GB', { maximumFractionDigits: 20 })} MT</dd></div>
          <div><dt>Deadline</dt><dd>{dayDate(plan.purchase_deadline)} · {remaining(plan.days_remaining)}</dd></div>
          {waitTarget ? <div><dt>Buy on {dayDate(waitTarget)}</dt><dd>{usd((point?.mid ?? 0) * plan.quantity_mt)}</dd></div>
            : buyNow != null && <div><dt>Buy today</dt><dd>{usd(buyNow)}</dd></div>}
          {costDetail && <div><dt>Cost detail</dt><dd>{costDetail}</dd></div>}
        </dl>
        {approval && guidance && g.analysis ? <RecommendationApproval key={`${g.analysis.approval_fingerprint}:${approval.horizon}`} analysis={g.analysis} plan={plan} horizon={approval.horizon} planService={approval.planService} onSubmitted={approval.onSubmitted} refresh={refresh} />
          : approval && (preparing || held) ? <div className="rec-approval-pending"><div className="rec-approval-row"><button type="button" className="bb-button rec-submit" disabled>{SUBMIT_LABEL}</button>{refresh}</div><p>Available when the recommendation is ready</p></div>
          : refresh && <div className="rec-approval-row">{refresh}</div>}
      </div>
      <RecommendationReportDownload report={guidance && analysis ? { plan, guidance, analysis, columns, buyNow,
        waitCost: waitTarget && point?.mid != null ? point.mid * plan.quantity_mt : undefined, costDetail, demo } : undefined} />
    </section>
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

function ActionIcon({ action }: { action: string }) {
  const path = action === 'BUY_NOW' ? <path d="M5 12.5l4.5 4.5L19 7.5" />
    : action === 'WAIT' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>
    : action === 'MONITOR' ? <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>
    : <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></>;
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
}
/** Holds the comparison's place while the recommendation is prepared; the real cards return with the answer. */
function CompareSkeleton() {
  return <section className="rec-compare-skeleton" aria-hidden="true">
    <h2>Compare buying dates</h2>
    <div className="rec-compare-skeleton-cols"><span className="rec-shimmer" /><span className="rec-shimmer" /><span className="rec-shimmer" /><span className="rec-shimmer" /></div>
  </section>;
}
function ChevronLeft() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>;
}
function RefreshIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>;
}
