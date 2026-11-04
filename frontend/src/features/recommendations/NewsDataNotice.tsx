import type { ReadyForecast } from '../forecast/apiService';
import { formatDate } from '../purchase-plan/dates';
import { WarningIcon } from './TimingComparison';

/** Keep related news limitations together without hiding either the date or estimated provenance. */
export function NewsDataNotice({ sourceDates }: { sourceDates?: ReadyForecast['source_dates'] }) {
  const older = sourceDates?.gdelt_fallback;
  const estimated = sourceDates?.gdelt_estimated;
  if (!older && !estimated) return null;

  const news = older
    ? `The latest completed GDELT day is missing. Using article count and tone from ${formatDate(older)}${estimated === older ? ', including API-supplied estimates' : ''}.`
    : `GDELT article count and tone for ${formatDate(estimated!)} include API-supplied estimates.`;
  const separateEstimate = older && estimated && older !== estimated
    ? ` Inputs for ${formatDate(estimated)} include API-supplied estimates.` : '';

  return <section className="rec-notice" role="note" aria-label="News data limitations">
    <WarningIcon />
    <div>
      <h2>{older && estimated ? 'Using older, estimated news data' : older ? 'Using the last available news data' : 'Using estimated news data'}</h2>
      <p>{news}{separateEstimate}{estimated && ' These estimates affect the experimental price range, not the Ridge central estimate.'}{older && ' News older than seven days is excluded.'} Confirm a current supplier quote before buying.</p>
    </div>
  </section>;
}
