import type { ReadyForecast } from '../forecast/apiService';
import type { PlanAnalysis, RecommendationEvidence } from '../purchase-plan/types';
import { calendarDays, formatDate } from '../purchase-plan/dates';
import { forecastSource } from './PurchaseImpact';
import { dayDate, readableDates } from './format';

/** Backend caveats the bullets below already make in plain words, or that the report covers in full. */
const COVERED = [/^Forecast savings are estimates/i, /^Reference prices are dated observations/i, /^Only available 7, 14 and 30 day forecasts/i,
  /^The reference observation is \d+ days old/i, /^Weighted uncertainty bounds/i, /^The blend is a timing signal/i, /news-aware Ridge central estimate/i,
  /^No available forecast fits the deadline/i];

const ageText = (age: number) => age === 0 ? 'today' : `${age} ${age === 1 ? 'day' : 'days'} old`;

/** The few caveats a buyer must read before acting, plus where the figures came from. The full method lives in the report. */
export function KeyAssumptions({ evidence, reference, published, today }: {
  evidence?: RecommendationEvidence; reference?: PlanAnalysis['reference']; published?: ReadyForecast; today: string;
}) {
  const backend = evidence?.limitations ?? [];
  const says = (pattern: RegExp) => backend.some(limitation => pattern.test(limitation));
  const { experimental, name } = forecastSource(published);
  const quote = reference?.status === 'ready' ? reference.value : undefined;
  const quoteDate = quote?.observation_date ?? published?.anchor_quote_date;
  const age = evidence?.reference_age_days ?? (quoteDate ? calendarDays(quoteDate, today) : undefined);
  const dated = quoteDate ? ` (latest ${dayDate(quoteDate).slice(4)}${age != null && age >= 0 ? `, ${ageText(age)}` : ''})` : '';
  const newsDate = published?.source_dates.gdelt ?? published?.source_dates.gdelt_estimated;

  const items = [
    'Forecast savings are estimates, not guaranteed. Get a current supplier quote before buying.',
    `Prices are dated observations${dated}, not executable quotes. Costs exclude freight, fees and taxes.`,
    ...(experimental || says(/^Weighted uncertainty bounds/i) ? ['Price ranges are experimental, not calibrated confidence intervals.'] : []),
    ...(published && published.evidence !== 'supported' ? ['The model hasn’t yet shown a purchasing advantage in back-testing.'] : []),
    ...backend.filter(limitation => !COVERED.some(pattern => pattern.test(limitation))).map(readableDates),
  ];
  const source = [
    published && name,
    quoteDate && `${quote?.basis.commodity ?? 'MGO'} quote ${formatDate(quoteDate)}`,
    newsDate && `GDELT news ${formatDate(newsDate)}`,
    evidence && `policy ${evidence.policy_version}`,
  ].filter(Boolean).join(' · ');

  return <section className="rec-assumptions" aria-labelledby="rec-assumptions-title">
    <div className="rec-section-head">
      <div><h2 id="rec-assumptions-title">Key assumptions and limitations</h2></div>
      <p className="rec-assumptions-pointer">Full method, data sources and model details are in the report.</p>
    </div>
    <ul>{items.map((item, n) => <li key={n}>{item}</li>)}</ul>
    {source && <p className="rec-source-note">Source: {source}</p>}
  </section>;
}
