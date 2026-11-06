import type { ReadyForecast } from '../forecast/apiService';
import { calendarDays, formatDate } from '../purchase-plan/dates';
import { forecastSource } from './PurchaseImpact';
import { WarningIcon } from './TimingComparison';
import { dayDate } from './format';

const STALE_AFTER_DAYS = 7;

function newsLimits(sourceDates: ReadyForecast['source_dates']) {
  const older = sourceDates.gdelt_fallback, estimated = sourceDates.gdelt_estimated;
  const notes: string[] = [];
  if (older) notes.push(`The latest completed GDELT day is missing, so news uses article count and tone from ${formatDate(older)}. News older than seven days is excluded.`);
  if (estimated) notes.push(`News inputs for ${formatDate(estimated)} include API-supplied estimates, which widen the range but don’t move the central price.`);
  return notes;
}

/** Everything about the age and quality of the page's inputs, said once above the answer. Warns only when something is off. */
export function DataNotice({ forecast, today, onRefresh }: { forecast?: ReadyForecast; today: string; onRefresh?(): void }) {
  if (!forecast) return null;
  const { experimental, executedRidge } = forecastSource(forecast);
  const age = calendarDays(forecast.anchor_quote_date, today);
  const news = newsLimits(forecast.source_dates);
  const lastQuote = experimental && !executedRidge;
  const warn = !!forecast.synthetic || age > STALE_AFTER_DAYS || news.length > 0 || lastQuote;
  const quote = forecast.synthetic && !forecast.source_dates.mgo ? 'No observed MGO quote could be loaded, so prices use an illustrative baseline.'
    : `Prices use the MGO quote from ${dayDate(forecast.anchor_quote_date)}${age < 0 ? '' : ` (${age === 0 ? 'today' : `${age} ${age === 1 ? 'day' : 'days'} old`})`}.`;
  const body = [
    ...(forecast.synthetic ? ['Fallback estimate: prices and timing use illustrative trend logic, not the model.'] : []),
    quote, ...news,
    ...(lastQuote ? ['No current Ridge forecast is available, so the central price is the last observed quote.'] : []),
    ...(experimental ? ['The range is experimental and its coverage hasn’t been measured.'] : []),
    ...(warn ? [] : ['Confirm a current supplier quote before you buy.']),
  ].join(' ');
  if (!warn) return <p className="rec-data-line" role="note" aria-label="Data freshness">{body}</p>;
  return <section className="rec-notice" role="note" aria-label="Data freshness">
    <WarningIcon />
    <div>
      <h2>Get a current supplier quote before you buy</h2>
      <p>{body}</p>
    </div>
    {onRefresh && <button type="button" className="rec-notice-action" onClick={onRefresh}>Refresh prices</button>}
  </section>;
}
