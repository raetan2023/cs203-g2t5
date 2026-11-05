import { getStored } from './storedApi';

export type AlertState = 'alert' | 'normal' | 'insufficient';

/** The latest GDELT keyword-filtered window compared with recent windows. */
export interface NewsSpike {
  state: AlertState;
  articleCount: number;
  /** Median article count of recent windows, or null when too few are stored to compare. */
  baselineCount: number | null;
  windowEnd: string;
  topTopics: { topic: string; count: number }[];
}

/** Singapore MGO's latest daily move compared with its recent daily moves. */
export interface PriceMove {
  state: AlertState;
  observedDate: string;
  /** Percent change from the previous observation, or null with only one stored price. */
  changePct: number | null;
  /** Standard deviation of recent daily moves, in percent, or null when too few are stored. */
  typicalChangePct: number | null;
}

/** Each signal is null when nothing is stored for it yet. */
export interface MarketAlerts { news: NewsSpike | null; price: PriceMove | null }

export type ReadAlerts = () => Promise<MarketAlerts>;

const STATES: Record<string, AlertState> = { ALERT: 'alert', NORMAL: 'normal', INSUFFICIENT_DATA: 'insufficient' };
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isTime = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const numberOrNull = (value: unknown) => isNumber(value) ? value : null;

function invalid(): never {
  throw new Error('The stored alerts response was invalid.');
}

function state(value: unknown) {
  return typeof value === 'string' && value in STATES ? STATES[value] : invalid();
}

function news(data: unknown): NewsSpike | null {
  if (data == null) return null;
  const body = data as Record<string, unknown>;
  if (!isNumber(body.articleCount) || !isTime(body.windowEnd)) invalid();
  const topics = Array.isArray(body.topTopics) ? body.topTopics as Record<string, unknown>[] : [];
  return {
    state: state(body.state), articleCount: body.articleCount, baselineCount: numberOrNull(body.baselineCount), windowEnd: body.windowEnd,
    topTopics: topics.flatMap(t => t && typeof t.topic === 'string' && isNumber(t.count) ? [{ topic: t.topic, count: t.count }] : []),
  };
}

function price(data: unknown): PriceMove | null {
  if (data == null) return null;
  const body = data as Record<string, unknown>;
  if (!isDay(body.observedDate)) invalid();
  return { state: state(body.state), observedDate: body.observedDate, changePct: numberOrNull(body.changePct), typicalChangePct: numberOrNull(body.typicalChangePct) };
}

/** Throws when the response is malformed, so the tile reports an error rather than a calm market. */
export function parseMarketAlerts(data: unknown): MarketAlerts {
  const body = data as { storage?: unknown; news?: unknown; price?: unknown } | null;
  if (!body || body.storage !== 'supabase') invalid();
  return { news: news(body.news), price: price(body.price) };
}

export function createStoredAlertsReader(): ReadAlerts {
  return async () => parseMarketAlerts(await getStored('/api/v1/news/alerts', 'Could not read market alerts.'));
}
