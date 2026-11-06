import type { Forecast, Horizon, ReadyForecast } from '../forecast/apiService';
import { driverLabel } from '../forecast/utils';
import { perMt, readableDates } from '../recommendations/format';
import type { ReportSection } from '../recommendations/reportPdf';

export type HorizonResult = { horizon: Horizon; forecast?: Forecast; error?: string };

const ready = (result: HorizonResult): result is HorizonResult & { forecast: ReadyForecast } => result.forecast?.status === 'ready';
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

function horizonLine({ horizon, forecast, error }: HorizonResult) {
  if (forecast?.status === 'ready') {
    const change = (forecast.forecast - forecast.anchor_price) / forecast.anchor_price * 100;
    return `${horizon} days (${readableDates(forecast.target_date)}): USD ${perMt(forecast.forecast)}/MT, range USD ${perMt(forecast.low)} to ${perMt(forecast.high)}, ${change > 0 ? '+' : ''}${change.toFixed(1)}% against the latest quote.`;
  }
  return `${horizon} days: unavailable. ${forecast?.status === 'unavailable' ? forecast.message : error ?? 'The forecast could not be loaded.'}`;
}

function coverageLines(forecast: ReadyForecast) {
  const { interval } = forecast;
  const lines = [interval.nominal_coverage != null ? `Target coverage: ${Math.round(interval.nominal_coverage * 100)}% prediction interval.` : 'Experimental range: coverage not stated.',
    interval.empirical_coverage != null && interval.evaluation_rows > 0
      ? `Observed coverage: ${percent(interval.empirical_coverage)} across ${interval.evaluation_rows} chronological forecasts.`
      : 'Observed coverage: unavailable. No measured coverage is provided.'];
  if (interval.baseline_coverage != null) lines.push(`Persistence baseline coverage: ${percent(interval.baseline_coverage)} on the same forecasts.`);
  if (interval.mean_width != null && interval.baseline_mean_width != null) lines.push(`Mean interval width: USD ${perMt(interval.mean_width)}/MT; baseline USD ${perMt(interval.baseline_mean_width)}/MT.`);
  if (interval.evaluation_rows > 0) lines.push(interval.evaluation_scope);
  if (forecast.evidence === 'no_edge') lines.push('No measurable edge over carrying the last price forward at this horizon.');
  else if (forecast.mae_skill_vs_persistence != null) lines.push(`About ${Math.round(forecast.mae_skill_vs_persistence * 100)}% more accurate than carrying the last price forward.`);
  lines.push(interval.limitations);
  return lines;
}

function driverLines(forecast: ReadyForecast) {
  if (!forecast.top_drivers.length) return ['No driver breakdown was returned for this horizon.'];
  if (forecast.top_drivers.every(driver => Math.abs(driver.contribution) < 1e-9)) return ['No single market signal is moving the forecast at this horizon.'];
  return [...forecast.top_drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .map(driver => `${driverLabel(driver.feature)}: pushing the forecast ${driver.contribution > 0 ? 'up' : 'down'} (${driver.contribution > 0 ? '+' : ''}${driver.contribution.toFixed(4)}).`);
}

/** Everything the page leaves out: per-horizon ranges, coverage, drivers and provenance, from the same reads the page shows. */
export function forecastReportSections(results: HorizonResult[]): ReportSection[] {
  const available = results.filter(ready);
  const first = available[0]?.forecast;
  const sections: ReportSection[] = [];
  if (first) sections.push({ heading: 'Summary', lines: [
    `Latest MGO quote: USD ${perMt(first.anchor_price)}/MT, observed ${readableDates(first.anchor_quote_date)}.`,
    `Forecast date: ${readableDates(first.forecast_origin_date)}.`,
    first.synthetic ? 'Synthetic preview data, not a live forecast.' : 'Experimental forecast. Market and news signals; purchasing outcomes are uncertain.',
  ] });
  sections.push({ heading: 'Forecast by horizon', lines: results.map(horizonLine) });
  for (const { horizon, forecast } of available) {
    sections.push({ heading: `${horizon}-day range`, lines: coverageLines(forecast) });
    sections.push({ heading: `${horizon}-day drivers`, lines: driverLines(forecast) });
  }
  if (first) {
    sections.push({ heading: 'Where it comes from', lines: [
      `Published: ${first.published_at}.`,
      `News window (UTC, end exclusive): ${first.news_window_start} to ${first.news_window_end}.`,
      `Source dates: ${Object.entries(first.source_dates).map(([key, date]) => `${key} ${date ?? 'unavailable'}`).join(', ')}.`,
      `Run: ${first.run_id}.`, `Model: ${first.model_version}.`,
    ] });
    if (first.history.length) sections.push({ heading: 'Recent MGO quotes', lines: first.history.slice(-7).reverse().map(row => `${readableDates(row.date)}: USD ${perMt(row.price)}/MT`) });
  }
  return sections;
}
