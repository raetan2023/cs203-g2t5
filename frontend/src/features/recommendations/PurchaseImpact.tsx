import type { PurchasePlan } from '../purchase-plan/types';
import { formatDate } from '../purchase-plan/dates';
import type { RecommendationService } from './service';
import { useAnalysis } from './useAnalysis';

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const amount = (value: number) => number.format(value);
const signed = (value: number) => value > 0 ? `+${amount(value)}` : amount(value);

/** Display source-supplied totals only; no price/quantity calculations here. */
export function PurchaseImpact({ plan, service }: { plan: PurchasePlan; service: RecommendationService }) {
  const { analysis, loading, error, retry } = useAnalysis(service, plan, 'readImpact');
  const impact = analysis?.cost_impact.status === 'ready' ? analysis.cost_impact.value : undefined;
  const forecast = analysis?.forecast.status === 'ready' ? analysis.forecast.value : undefined;
  const reference = analysis?.reference.status === 'ready' ? analysis.reference.value : undefined;
  const ready = impact && impact.target_date && forecast?.target_date === impact.target_date;
  const savings = impact?.savings_total;
  return <section className="rec-impact" aria-label="Estimated impact" aria-busy={loading}>
    <h2>{ready ? `Estimated impact for forecast date ${formatDate(impact.target_date!)}` : 'Estimated impact'}</h2>
    <p>{ready ? `Cost estimate for ${amount(plan.quantity_mt)} MT · Forecast target, not a purchase recommendation.` : `For your planned purchase of ${amount(plan.quantity_mt)} MT`}</p>
    {loading ? <div role="status"><div className="rec-costs" aria-hidden="true">{['Cost at reference price', 'Forecast cost range', 'Difference from reference'].map(label => <div key={label}><span>{label}</span><div className="rec-skeleton" /></div>)}</div><p>Loading cost impact… Cost estimates appear independently when this request completes.</p></div>
      : error ? <div role="alert"><p>Couldn’t load cost impact. Your recommendation is unaffected.</p><button className="bb-button" onClick={retry}>Retry cost impact</button></div>
      : ready ? <>
        <dl className="rec-costs">
          <div><dt>Cost at reference price</dt><dd>USD {amount(impact.reference_total)}</dd></div>
          <div><dt>Forecast cost range</dt><dd>USD {amount(impact.forecast_total.lower)}–{amount(impact.forecast_total.upper)}</dd></div>
          <div className="rec-cost-highlight"><dt>{savings && savings.lower >= 0 ? 'Potential savings' : 'Difference from reference'}</dt><dd>USD {savings && savings.lower >= 0 ? `${amount(savings.lower)} to ${amount(savings.upper)}` : `${signed(impact.difference_total.lower)} to ${signed(impact.difference_total.upper)}`}</dd></div>
        </dl>
        {impact.central_total !== undefined && <p className="rec-central">Central estimated cost: USD {amount(impact.central_total)}</p>}
      </> : <p>{analysis?.cost_impact.status === 'unavailable' ? analysis.cost_impact.message : 'Cost impact is unavailable for this forecast date.'}</p>}
    {analysis?.source === 'mock' && <p className="rec-demo">Synthetic demo data — estimates, not realized savings.</p>}
    {forecast && <details className="rec-forecast"><summary>Price basis and uncertainty</summary><dl>
      {reference && <div><dt>Reference price · {formatDate(reference.observation_date)}</dt><dd>{reference.basis.commodity} · {reference.basis.currency} {amount(reference.price)}/{reference.basis.unit}</dd></div>}
      <div><dt>Forecast target date</dt><dd>{formatDate(forecast.target_date)}</dd></div>
      {forecast.central_estimate !== undefined && <div><dt>Forecast central estimate</dt><dd>{forecast.basis.currency} {amount(forecast.central_estimate)}/{forecast.basis.unit}</dd></div>}
    </dl><p>Forecast bounds: {forecast.basis.commodity} · {forecast.basis.currency} {amount(forecast.prices.lower)}–{amount(forecast.prices.upper)}/{forecast.basis.unit}</p>
      {forecast.horizon_description && <p>{forecast.horizon_description}</p>}<p>{forecast.range_description}</p>
    </details>}
  </section>;
}
