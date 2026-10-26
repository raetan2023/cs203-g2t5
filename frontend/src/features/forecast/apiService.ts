import type { ApiOptions } from '../purchase-plan/apiService';
import { isValidDate } from '../purchase-plan/dates';

export type Horizon = 7 | 14 | 30;
export interface Interval {
  nominal_coverage: number; empirical_coverage: number | null; evaluation_rows: number;
  baseline_coverage: number | null; baseline_mean_width: number | null; mean_width: number | null;
  method: string; evaluation_scope: string; limitations: string;
}
export interface ReadyForecast {
  status: 'ready'; run_id: string; forecast_origin_date: string; target_date: string;
  anchor_quote_date: string; anchor_price: number; forecast: number; low: number; high: number;
  unit: 'USD/metric tonne'; horizon_days: Horizon; interval: Interval;
  news_window_start: string; news_window_end: string; source_dates: Record<string, string | null>;
  model_version: string; published_at: string; top_drivers: { feature: string; contribution: number }[];
  history: { date: string; price: number }[]; synthetic?: boolean;
}
export interface LastSuccessfulRun { run_id: string; origin_date: string; published_at: string; model_version: string }
export interface UnavailableForecast { status: 'unavailable'; reason: string; message: string; last_successful_run?: LastSuccessfulRun }
export type Forecast = ReadyForecast | UnavailableForecast;
export interface ForecastService { read(horizon: Horizon): Promise<Forecast> }

const invalid = () => new Error('The forecast response was invalid. Please retry.');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown) { if (typeof value !== 'string' || !value.trim()) throw invalid(); return value; }
function number(value: unknown, min = -Infinity) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min) throw invalid(); return value; }
function date(value: unknown) { const d = text(value); if (!isValidDate(d)) throw invalid(); return d; }
function timestamp(value: unknown) { const d = text(value); if (!Number.isFinite(Date.parse(d))) throw invalid(); return d; }
function fraction(value: unknown) { const n = number(value, 0); if (n > 1) throw invalid(); return n; }
function nullable(value: unknown, parse: (v: unknown) => number) { return value == null ? null : parse(value); }

export function parseForecast(payload: unknown, horizon: Horizon): Forecast {
  const v = object(payload);
  if (v.status === 'unavailable') {
    const last = v.last_successful_run == null ? undefined : object(v.last_successful_run);
    return { status: 'unavailable', reason: text(v.reason), message: text(v.message), ...(last && { last_successful_run: {
      run_id: text(last.run_id), origin_date: date(last.origin_date), published_at: timestamp(last.published_at), model_version: text(last.model_version),
    } }) };
  }
  if (v.status !== 'ready' || v.horizon_days !== horizon || v.unit !== 'USD/metric tonne') throw invalid();
  const origin = date(v.forecast_origin_date), target = date(v.target_date), anchor = date(v.anchor_quote_date);
  const low = number(v.low, Number.MIN_VALUE), high = number(v.high, Number.MIN_VALUE);
  if (low > high || anchor > origin || target <= origin) throw invalid();
  const i = object(v.interval), rows = number(i.evaluation_rows, 0);
  if (!Number.isInteger(rows)) throw invalid();
  const interval: Interval = { nominal_coverage: fraction(i.nominal_coverage), empirical_coverage: nullable(i.empirical_coverage, fraction),
    evaluation_rows: rows, baseline_coverage: nullable(i.baseline_coverage, fraction),
    baseline_mean_width: nullable(i.baseline_mean_width, x => number(x, 0)), mean_width: nullable(i.mean_width, x => number(x, 0)),
    method: text(i.method), evaluation_scope: text(i.evaluation_scope), limitations: text(i.limitations) };
  if ((interval.empirical_coverage != null || interval.baseline_coverage != null) && rows === 0) throw invalid();
  const start = timestamp(v.news_window_start), end = timestamp(v.news_window_end);
  const published = timestamp(v.published_at);
  if (Date.parse(end) > Date.parse(published) || Date.parse(published) - Date.parse(end) > 7 * 86_400_000
      || Date.parse(end) - Date.parse(start) !== 86_400_000) throw invalid();
  const sourceDates = object(v.source_dates);
  const source_dates = Object.fromEntries(Object.entries(sourceDates).map(([key, value]) => [key, value == null ? null : date(value)]));
  if (Object.values(source_dates).some(value => value != null && value > origin)) throw invalid();
  if (!Array.isArray(v.top_drivers) || !Array.isArray(v.history)) throw invalid();
  return { status: 'ready', run_id: text(v.run_id), forecast_origin_date: origin, target_date: target,
    anchor_quote_date: anchor, anchor_price: number(v.anchor_price, Number.MIN_VALUE), forecast: number(v.forecast, Number.MIN_VALUE),
    low, high, unit: 'USD/metric tonne', horizon_days: horizon, interval, news_window_start: start, news_window_end: end,
    source_dates, model_version: text(v.model_version), published_at: timestamp(v.published_at),
    top_drivers: v.top_drivers.map(d => { const x = object(d); return { feature: text(x.feature), contribution: number(x.contribution) }; }),
    history: v.history.map(d => { const x = object(d); const observed = date(x.date); if (observed > origin) throw invalid(); return { date: observed, price: number(x.price, Number.MIN_VALUE) }; }),
  };
}

/** Normal routes only call the authenticated backend; no synthetic fallback. */
export function createApiForecastService(options: ApiOptions = {}): ForecastService {
  const base = (options.baseUrl ?? import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
  return { async read(horizon) {
    const token = await options.getToken?.();
    if (!token) throw new Error('Please sign in again to load the forecast.');
    let response: Response;
    try { response = await fetch(`${base}/api/v1/forecast?horizon_days=${horizon}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }); }
    catch { throw new Error('Could not reach the forecast service. Please retry.'); }
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new Error('The forecast service returned an unreadable response.'); }
    if (!response.ok) throw new Error('Could not load the forecast. Please retry.');
    return parseForecast(payload, horizon);
  } };
}
