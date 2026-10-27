import type { ReadyForecast } from '../forecast/apiService';
import type { PurchasePlan } from '../purchase-plan/types';
import { formatDate } from '../purchase-plan/dates';
import type { RecommendationService } from './service';
import { useAnalysis } from './useAnalysis';

const amount = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
const price = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const compact = (value: number) => {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000_000) return `${price(value / 1_000_000_000)}bn`;
  if (magnitude >= 1_000_000) return `${price(value / 1_000_000)}m`;
  return amount(value);
};
const change = (value: number) => {
  if (value === 0) return 'no change';
  const magnitude = Math.abs(value);
  const formatted = magnitude >= 100_000 && magnitude < 1_000_000
    ? `${amount(Math.round(magnitude / 1_000))}k` : compact(magnitude);
  return `USD ${formatted} ${value < 0 ? 'less' : 'more'}`;
};

/** Display backend totals; formatting never changes the plan or forecast calculation. */
export function PurchaseImpact({ plan, service, reload, horizonDays, runId, published }: {
  horizonDays?: number; runId?: string; plan: PurchasePlan; service: RecommendationService; reload?: () => void; published?: ReadyForecast;
}) {
  const { analysis, loading, error, message, changed, retry } = useAnalysis(service, plan, 'readImpact', horizonDays, runId);
  const impact = analysis?.cost_impact.status === 'ready' ? analysis.cost_impact.value : undefined;
  const forecast = analysis?.forecast.status === 'ready' ? analysis.forecast.value : undefined;
  const reference = analysis?.reference.status === 'ready' ? analysis.reference.value : undefined;
  const ready = impact && forecast && impact.target_date && forecast.target_date === impact.target_date;
  const experimental = published?.interval.method === 'experimental_gdelt_scaled_quantiles';
  const newsDate = published?.source_dates.gdelt ?? published?.news_window_start.slice(0, 10);
  const executedRidge = experimental && published?.model_version.includes('-sha256-');
  const source = executedRidge ? 'Ridge regression (executed repository artifact)' : experimental ? 'Last observed quote (persistence)' : published?.interval.method === 'gdelt_error_quantiles' ? 'Ridge regression (published)' : published ? 'Published model forecast' : 'Source-supplied estimate';
  return <section className="rec-impact" aria-label="Estimated impact" aria-busy={loading}>
    <div className="rec-result-heading"><div><p className="rec-eyebrow">Cost scenario</p><h2>{ready ? `Estimated cost on ${formatDate(impact.target_date!)}` : 'Estimated purchase cost'}</h2></div>
      {ready && <span className="rec-badge">{experimental ? 'Experimental range' : 'Forecast range'}</span>}</div>
    {loading ? <div role="status" className="rec-result-loading"><div className="rec-skeleton" /><p>Loading cost impact for {amount(plan.quantity_mt)} MT…</p></div>
      : error ? <div role="alert" className="rec-result-error"><h3>Cost estimate unavailable</h3><p>{message ?? 'Couldn’t load cost impact. Your plan remains saved.'}</p><button className="bb-button" onClick={changed && reload ? reload : retry}>{changed && reload ? 'Reload saved plan' : 'Retry cost impact'}</button></div>
      : ready ? <>
        <div className="rec-total"><p>Estimated total cost · {amount(plan.quantity_mt)} MT</p>
          <p className="rec-total-value">USD {compact(impact.forecast_total.lower)}–{compact(impact.forecast_total.upper)}</p>
          <p className="rec-price-line">{forecast.basis.currency} {price(forecast.prices.lower)}–{price(forecast.prices.upper)}/{forecast.basis.unit}
            <span> · {experimental ? 'Coverage has not been measured' : 'An estimate, not a supplier quote'}</span></p>
        </div>
        <dl className="rec-costs">
          <div><dt>Reference cost</dt><dd>USD {amount(impact.reference_total)}</dd><p>Based on the {reference ? formatDate(reference.observation_date) : 'reference'} quote</p></div>
          <div><dt>Possible cost change</dt><dd className="rec-change">{change(impact.difference_total.lower)} to {change(impact.difference_total.upper)}</dd><p>Compared with the reference cost</p></div>
        </dl>
        {impact.central_total !== undefined && impact.central_total !== impact.reference_total && <p className="rec-central">Model central estimated cost: USD {amount(impact.central_total)}</p>}
      </> : <p className="rec-result-empty">{analysis?.cost_impact.status === 'unavailable' ? analysis.cost_impact.message : 'Cost impact is unavailable for this forecast date.'}</p>}
    {(analysis?.source === 'mock' || analysis?.provenance === 'fixture') && <p className="rec-demo">Synthetic demo data · Estimates, not realized savings.</p>}
    {forecast && <details className="rec-forecast"><summary>Data sources and calculation</summary>
      <div className="rec-details-body"><dl>
        <div><dt>Estimate source</dt><dd>{source}</dd></div>
        {executedRidge && <div><dt>Ridge artifact SHA-256</dt><dd>{published!.model_version.split('-sha256-')[1]?.slice(0, 12)}…</dd></div>}
        {executedRidge && <div><dt>Model horizon</dt><dd>{published!.horizon_days} days from {formatDate(published!.anchor_quote_date)}</dd></div>}
        {reference && <div><dt>Reference price · {formatDate(reference.observation_date)}</dt><dd>{reference.basis.currency} {price(reference.price)}/{reference.basis.unit}</dd></div>}
        <div><dt>Estimate date</dt><dd>{formatDate(forecast.target_date)}</dd></div>
        {newsDate && <div><dt>News used</dt><dd>{formatDate(newsDate)} · UTC day</dd></div>}
        {forecast.central_estimate !== undefined && (!experimental || executedRidge) && <div><dt>Model central estimate</dt><dd>{forecast.basis.currency} {price(forecast.central_estimate)}/{forecast.basis.unit}</dd></div>}
        <div><dt>Full cost range · rounded to dollars</dt><dd>{impact ? `USD ${amount(impact.forecast_total.lower)} to USD ${amount(impact.forecast_total.upper)}` : 'Unavailable'}</dd></div>
      </dl>
      {experimental && !executedRidge ? <div className="rec-method"><h3>How news changes the range</h3><p>Historical MGO price changes provide the base range. Higher article activity or more extreme average tone increases its width. News does not move the reference-based estimate.</p><p>This experimental adjustment has no measured confidence coverage. Ridge is unavailable for this result; the centre uses the last observed quote.</p></div>
        : <p className="rec-method">{forecast.range_description}</p>}
      <p className="rec-source-note">{forecast.basis.commodity} · Price range: {forecast.basis.currency} {price(forecast.prices.lower)}–{price(forecast.prices.upper)}/{forecast.basis.unit}</p>
      </div>
    </details>}
  </section>;
}
