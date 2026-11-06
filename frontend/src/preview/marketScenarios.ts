import { buildMockForecast } from '../features/forecast/mockService';
import type { Forecast, ForecastService, Horizon, ReadyForecast } from '../features/forecast/apiService';

/** Latest values, dates, sources and units are from the stored read of 6 Nov 2026. Histories and forecasts are sample data. */
export const MARKET_SCENARIO_DATE = '2026-11-06';
export type MarketScenario = 'ready' | 'no-forecast' | 'read-error';

const isoDay = (end: string, offset: number) => new Date(Date.parse(`${end}T00:00:00Z`) - offset * 86_400_000).toISOString().slice(0, 10);

/** A deterministic sample path of weekday observations that ends on the stored value. */
function sampleHistory(end: string, value: number) {
  const days = Array.from({ length: 84 }, (_, offset) => isoDay(end, offset))
    .filter(date => ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())).slice(0, 60);
  return days.map((date, index) => ({ date, value: Number((value * (1 - index * .0016 + Math.sin(index / 3) * .018 * Math.min(1, index / 4))).toFixed(2)) })).reverse();
}

function priceSeries(seriesKey: string, label: string, value: number, unit: string, currency: string | null, observedDate: string, source: string, changePct: number) {
  return { category: 'prices', history: sampleHistory(observedDate, value), ticker: { seriesKey, label, value, unit, currency, observedDate, source,
    valueType: 'OBSERVED', changePct, changeAbs: Number((value * changePct / 100).toFixed(4)) } };
}

const SALES: [string, number][] = [['LOW SULPHUR FUEL OIL', 2218.11], ['MARINE FUEL OIL', 1993.2], ['LOW SULPHUR MARINE GAS OIL', 378.84], ['BIO BLENDED LOW SULPHUR FUEL OIL', 76.2],
  ['LNG', 51.51], ['BIO BLENDED MARINE GAS OIL', 4.33], ['B100', 2.58], ['MARINE GAS OIL', 1.12], ['ULTRA LOW SULPHUR FUEL OIL', .4], ['BIO BLENDED LOW SULPHUR MARINE GAS OIL', .1],
  ['AMMONIA', 0], ['BIO BLENDED MARINE DIESEL OIL', 0], ['BIO BLENDED MARINE FUEL OIL', 0], ['BIO BLENDED ULTRA LOW SULPHUR FUEL OIL', 0], ['MARINE DIESEL OIL', 0], ['METHANOL', 0]];

export const MARKET_SNAPSHOT = {
  storage: 'supabase', fetchedAt: `${MARKET_SCENARIO_DATE}T08:25:00Z`, missing: [],
  series: [
    priceSeries('SGP_MGO_OBSERVED', 'Singapore MGO', 1351.5, 'USD/MT', 'USD', '2026-10-26', 'The Maritime', 0),
    priceSeries('SGP_GASOIL_FUT', 'Singapore gasoil futures', 173.02, 'source-defined', null, '2026-10-30', 'Investing.com manual export', .0463),
    priceSeries('BRENT_CRUDE', 'Brent crude', 123.1, 'USD/barrel', 'USD', '2026-10-27', 'FRED', -3.9182),
    priceSeries('DUBAI_CRUDE', 'Dubai crude futures', 110.73, 'source-defined', null, '2026-10-30', 'Investing.com manual export', .2444),
    priceSeries('USD_INDEX', 'Broad USD index', 121.6656, 'index', null, '2026-10-30', 'FRED', -.0579),
    ...SALES.map(([name, value]) => ({ category: 'sales', history: [], ticker: { seriesKey: `MPA_BUNKER_SALES_${name.replace(/ /g, '_')}`, label: `Bunker sales: ${name}`, value,
      unit: 'thousand tonnes (as published)', currency: null, observedDate: '2026-09-01', source: 'MPA', valueType: 'OBSERVED', changePct: null, changeAbs: null } })),
    { category: 'news', history: [], ticker: { seriesKey: 'GDELT_ARTICLE_COUNT', label: 'GDELT daily article count', value: 187, unit: 'articles', currency: null, observedDate: '2026-10-27', source: 'GDELT', valueType: 'OBSERVED', changePct: -41.195, changeAbs: -131 } },
    { category: 'news', history: [], ticker: { seriesKey: 'GDELT_AVERAGE_TONE', label: 'GDELT average tone', value: -1.189, unit: 'tone', currency: null, observedDate: '2026-10-27', source: 'GDELT', valueType: 'OBSERVED', changePct: -14.5158, changeAbs: .2 } },
  ],
};

const SAMPLE_FORECASTS: Record<Horizon, { forecast: number; low: number; high: number }> = {
  7: { forecast: 1338, low: 1240, high: 1436 }, 14: { forecast: 1351.5, low: 953, high: 1684 }, 30: { forecast: 1351.5, low: 985, high: 1835 },
};

export function marketForecast(horizon: Horizon): ReadyForecast {
  const base = buildMockForecast(horizon) as ReadyForecast;
  return { ...base, ...SAMPLE_FORECASTS[horizon], run_id: 'market-preview', anchor_price: 1351.5, anchor_quote_date: '2026-10-26', forecast_origin_date: MARKET_SCENARIO_DATE,
    target_date: isoDay(MARKET_SCENARIO_DATE, -horizon), model_version: 'ridge-decision-gdelt-preview', source_dates: { ...base.source_dates, mgo: '2026-10-26', gdelt: '2026-11-05', gdelt_estimated: '2026-11-05' },
    interval: { ...base.interval, method: 'experimental_gdelt_scaled_quantiles', nominal_coverage: null, empirical_coverage: null, baseline_coverage: null, mean_width: null, baseline_mean_width: null, evaluation_rows: 0 },
    evidence: 'unevaluated', mae_skill_vs_persistence: null, synthetic: undefined };
}

export function createMarketForecastService(scenario: MarketScenario): ForecastService {
  return { read: async (horizon: Horizon): Promise<Forecast> => scenario === 'no-forecast'
    ? { status: 'unavailable', reason: 'stale_reference', message: 'The latest observed MGO quote is older than 30 days.' } : marketForecast(horizon) };
}

let active: MarketScenario | null = null;
const browserFetch = typeof window === 'undefined' ? undefined : window.fetch.bind(window);

/** The stored-market hook reads the network directly, so the preview answers that one route with the snapshot. */
export function useStoredMarketFixture(scenario: MarketScenario | null) {
  if (active === scenario || !browserFetch) return;
  active = scenario;
  window.fetch = async (input, init) => {
    if (!active || !String(input).endsWith('/api/v1/market/stored')) return browserFetch(input, init);
    return active === 'read-error' ? new Response(null, { status: 503 }) : new Response(JSON.stringify(MARKET_SNAPSHOT), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}
