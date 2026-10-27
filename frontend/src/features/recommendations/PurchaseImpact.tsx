import type { ReadyForecast } from '../forecast/apiService';
import type { PlanAnalysis } from '../purchase-plan/types';
import { formatDate } from '../purchase-plan/dates';
import { amount, price, readableDates } from './format';

/** Which model produced the published estimate; labels only, never a calculation. */
export function forecastSource(published?: ReadyForecast) {
  const experimental = published?.interval.method === 'experimental_gdelt_scaled_quantiles';
  const executedRidge = experimental && !!published?.model_version.includes('-sha256-');
  const label = executedRidge ? 'Ridge regression (executed repository artifact)' : experimental ? 'Last observed quote (persistence)'
    : published?.interval.method === 'gdelt_error_quantiles' ? 'Ridge regression (published)' : published ? 'Published model forecast' : 'Source-supplied estimate';
  return { experimental, executedRidge, label };
}

/** Fine print: data sources, calculation notes, assumptions and policy limitations, each said once. */
export function DataSources({ impact, guidance, published }: { impact?: PlanAnalysis; guidance?: PlanAnalysis; published?: ReadyForecast }) {
  const { experimental, executedRidge, label } = forecastSource(published);
  const forecast = impact?.forecast.status === 'ready' ? impact.forecast.value : undefined;
  const reference = (impact ?? guidance)?.reference;
  const cost = impact?.cost_impact.status === 'ready' ? impact.cost_impact.value : undefined;
  const evidence = guidance?.recommendation.status === 'ready' ? guidance.recommendation.value.evidence : undefined;
  const newsDate = published?.source_dates.gdelt ?? published?.news_window_start.slice(0, 10);
  if (!forecast && !evidence) return null;
  return <details className="rec-fine">
    <summary>Assumptions and data sources</summary>
    <div className="rec-fine-body">
      {forecast && <dl className="rec-sources">
        <div><dt>Estimate source</dt><dd>{label}</dd></div>
        {executedRidge && <div><dt>Ridge artifact SHA-256</dt><dd>{published!.model_version.split('-sha256-')[1]?.slice(0, 12)}…</dd></div>}
        {executedRidge && <div><dt>Model horizon</dt><dd>{published!.horizon_days} days from {formatDate(published!.anchor_quote_date)}</dd></div>}
        {reference?.status === 'ready' && <div><dt>Reference price · {formatDate(reference.value.observation_date)}</dt><dd>{reference.value.basis.currency} {price(reference.value.price)}/{reference.value.basis.unit}</dd></div>}
        <div><dt>Estimate date</dt><dd>{formatDate(forecast.target_date)}</dd></div>
        {newsDate && <div><dt>News used</dt><dd>{formatDate(newsDate)} · UTC day</dd></div>}
        {forecast.central_estimate !== undefined && (!experimental || executedRidge) && <div><dt>Model central estimate</dt><dd>{forecast.basis.currency} {price(forecast.central_estimate)}/{forecast.basis.unit}</dd></div>}
        <div><dt>Full cost range · rounded to dollars</dt><dd>{cost ? `USD ${amount(cost.forecast_total.lower)} to USD ${amount(cost.forecast_total.upper)}` : 'Unavailable'}</dd></div>
      </dl>}
      {forecast && (experimental && !executedRidge ? <div className="rec-method"><h3>How news changes the range</h3><p>Historical MGO price changes provide the base range. Higher article activity or more extreme average tone increases its width. News does not move the reference-based estimate.</p><p>This experimental adjustment has no measured confidence coverage. Ridge is unavailable for this result; the centre uses the last observed quote.</p></div>
        : <p className="rec-method">{forecast.range_description}</p>)}
      {forecast && <p className="rec-source-note">{forecast.basis.commodity} · Price range: {forecast.basis.currency} {price(forecast.prices.lower)}–{price(forecast.prices.upper)}/{forecast.basis.unit}</p>}
      {evidence && <>
        <h3>Assumptions and limitations</h3>
        <ul>{evidence.limitations.map((limit, i) => <li key={i}>{readableDates(limit)}</li>)}</ul>
        <p className="rec-source-note">Policy {evidence.policy_version}{evidence.horizon_description ? ` · ${evidence.horizon_description}` : ''}</p>
      </>}
    </div>
  </details>;
}
