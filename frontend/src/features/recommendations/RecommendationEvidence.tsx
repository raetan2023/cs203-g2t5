import { calendarDays, formatDate } from '../purchase-plan/dates';
import type { PlanAnalysis, PurchasePlan } from '../purchase-plan/types';
import type { Column } from './TimingComparison';
import { plainLimitations, plainReasons } from './recommendationReport';

/** The saved recommendation explained in plain words, from the figures frozen at submission. */
export function EvidenceView({ analysis, plan }: { analysis: PlanAnalysis; plan: PurchasePlan }) {
  const guidance = analysis.recommendation.status === 'ready' ? analysis.recommendation.value : undefined;
  const evidence = guidance?.evidence;
  if (!guidance || !evidence) return null;
  const { scenario_as_of_date: asOf, purchase_deadline: deadline, quantity_mt } = analysis.context;
  // Name the forecasts the decision used by their horizon (7, 14 or 30 days from the planning date).
  const columns: Column[] = (evidence.signal_inputs ?? []).map(input => {
    const days = calendarDays(asOf, input.target_date);
    return { id: days as Column['id'], label: `${days} days`, date: input.target_date, low: input.price, mid: input.price, high: input.price,
      observed: false, late: false, past: false, forecast: { target_date: input.target_date } as Column['forecast'] };
  });
  const saved = { ...plan, quantity_mt, purchase_deadline: deadline, days_remaining: calendarDays(asOf, deadline) };
  return <div className="rec-explain">
    <ol aria-label="Reasons">{plainReasons({ plan: saved, guidance, analysis, columns }).map((reason, i) => <li key={i}>{reason}</li>)}</ol>
    {!!evidence.allocations.length && <>
      <h3>Suggested split</h3>
      <ul>{evidence.allocations.map(a => <li key={a.date}>{a.quantity_mt.toLocaleString('en-GB', { maximumFractionDigits: 20 })} MT on {formatDate(a.date)}</li>)}</ul>
    </>}
    <h3>Things to keep in mind</h3>
    <ul>{plainLimitations({ guidance, analysis }).map((caveat, i) => <li key={i}>{caveat}</li>)}</ul>
  </div>;
}
