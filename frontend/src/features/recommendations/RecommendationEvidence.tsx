import { formatDate } from '../purchase-plan/dates';
import type { PlanAnalysis } from '../purchase-plan/types';

export function EvidenceView({ analysis }: { analysis: PlanAnalysis }) {
  const e = analysis.recommendation.status === 'ready' ? analysis.recommendation.value.evidence : undefined;
  if (!e) return null;
  const usd = (v: number | null) => v == null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
  return <div className="rec-evidence">
    <ul className="rec-reasons">{e.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
    <dl className="rec-evidence-grid"><div><dt>Estimated buy-now reference cost</dt><dd>{usd(e.buy_now_cost_usd)}</dd></div>
      <div><dt>Estimated cost from recommendation signal</dt><dd>{usd(e.alternative_cost_usd)}</dd></div>
      <div><dt>Potential savings from signal for full quantity</dt><dd>{usd(e.alternative_minus_now_usd == null ? null : e.alternative_minus_now_usd === 0 ? 0 : -e.alternative_minus_now_usd)}</dd></div>
      <div><dt>Suggested date</dt><dd>{e.supported_target_date ? formatDate(e.supported_target_date) : 'Unavailable'}</dd></div>
      <div><dt>Reference freshness</dt><dd>{e.reference_age_days == null ? 'Unavailable' : `${e.reference_age_days} calendar ${e.reference_age_days === 1 ? 'day' : 'days'} old`}</dd></div></dl>
    {!!e.allocations.length && <div><h4>Illustrative split allocation</h4><ul>{e.allocations.map(a => <li key={a.date}>{a.quantity_mt.toLocaleString('en-GB', { maximumFractionDigits: 20 })} MT on {formatDate(a.date)}</li>)}</ul></div>}
    <details className="rec-forecast rec-assumptions"><summary>Assumptions and limitations</summary><div className="rec-details-body">
      {analysis.reference.status === 'ready' && <p>Reference: USD {analysis.reference.value.price.toLocaleString('en-GB')}/MT, observed {formatDate(analysis.reference.value.observation_date)}.</p>}
      {analysis.forecast.status === 'ready' && <p>Forecast: USD {analysis.forecast.value.central_estimate?.toLocaleString('en-GB') ?? 'unavailable'}/MT on {formatDate(analysis.forecast.value.target_date)}. Experimental range: USD {analysis.forecast.value.prices.lower.toLocaleString('en-GB')}–{analysis.forecast.value.prices.upper.toLocaleString('en-GB')}/MT. {analysis.forecast.value.range_description}</p>}
      <ul>{e.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul><p>Policy: {e.policy_version}. {e.horizon_description}</p></div></details>
  </div>;
}
