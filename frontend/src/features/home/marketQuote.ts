/** The Home price card reads the same stored observations as the Market dashboard. */
export const MGO_SERIES_KEY = 'SGP_MGO_OBSERVED';

export interface MgoQuote {
  value: number;
  unit: string;
  currency: string;
  changeAbs: number | null;
  changePct: number | null;
  /** Date of the latest stored quote. Quotes are sparse, so this is often before today. */
  observedDate: string;
  /** Oldest first, for the sparkline. */
  history: number[];
}

export type ReadMgoQuote = () => Promise<MgoQuote | null>;

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const optionalNumber = (value: unknown) => value == null ? null : isNumber(value) ? value : undefined;

/** Returns null when no MGO quote is stored yet; throws when the response is malformed. */
export function parseMgoQuote(data: unknown): MgoQuote | null {
  const body = data as { storage?: unknown; series?: unknown } | null;
  if (!body || body.storage !== 'supabase' || !Array.isArray(body.series)) throw new Error('The stored market response was invalid.');
  const series = (body.series as { ticker?: Record<string, unknown>; history?: unknown }[])
    .find(item => item?.ticker?.seriesKey === MGO_SERIES_KEY);
  if (!series) return null;
  const { ticker, history } = series as { ticker: Record<string, unknown>; history: unknown };
  const changeAbs = optionalNumber(ticker.changeAbs);
  const changePct = optionalNumber(ticker.changePct);
  if (!isNumber(ticker.value) || !isDate(ticker.observedDate) || changeAbs === undefined || changePct === undefined
      || !Array.isArray(history) || history.some(point => !isNumber(point?.value) || !isDate(point?.date))) {
    throw new Error('The stored MGO quote was invalid.');
  }
  return {
    value: ticker.value, changeAbs, changePct, observedDate: ticker.observedDate,
    unit: typeof ticker.unit === 'string' ? ticker.unit : '',
    currency: typeof ticker.currency === 'string' ? ticker.currency : '',
    history: [...(history as { date: string; value: number }[])].sort((a, b) => a.date.localeCompare(b.date)).map(point => point.value),
  };
}

export function createStoredMgoQuoteReader(): ReadMgoQuote {
  const env = import.meta.env ?? {};
  const base = (env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
  return async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${base}/api/v1/market/stored`, {
        cache: 'no-store', signal: controller.signal,
        headers: { ...(env.VITE_API_KEY && { 'X-API-Key': env.VITE_API_KEY }) },
      });
      if (!response.ok) throw new Error('Could not read the stored MGO price.');
      return parseMgoQuote(await response.json());
    } finally {
      clearTimeout(timeout);
    }
  };
}
