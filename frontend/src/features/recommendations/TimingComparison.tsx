import { useEffect, useId, useState } from 'react';
import type { Forecast, ForecastService, Horizon, ReadyForecast } from '../forecast/apiService';
import { calendarDays, formatDate } from '../purchase-plan/dates';
import { amount, change, changeRange, compact, dayDate, total, totalRange, usd } from './format';

const horizons = [7, 14, 30] as const;
export type Entry = { horizon: Horizon; forecast?: ReadyForecast; message?: string };
export type ColumnId = 'today' | Horizon;
export interface Column {
  id: ColumnId; label: string; date?: string; low: number; mid: number; high: number;
  /** Observation date of the shared reference quote every column is anchored to. */
  quote?: string; observed: boolean; late: boolean; past: boolean; message?: string; forecast?: ReadyForecast;
}

/** Read every horizon as a group; never combine forecasts from different snapshots. */
export function useHorizonComparison(service: ForecastService | undefined, today: string, revision?: string, selectedRun?: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ service: ForecastService; today: string; revision?: string; attempt: number; entries: Entry[] }>();
  useEffect(() => {
    if (!service) return;
    let active = true;
    Promise.allSettled(horizons.map(h => service.read(h))).then(results => {
      if (!active) return;
      const entries: Entry[] = results.map((r, i) => {
        const value: Forecast | undefined = r.status === 'fulfilled' ? r.value : undefined;
        return { horizon: horizons[i], ...(value?.status === 'ready' ? { forecast: value }
          : { message: value?.status === 'unavailable' ? value.message : 'Could not load this estimate.' }) };
      });
      const runs = new Set(entries.flatMap(e => e.forecast ? [e.forecast.run_id] : []));
      setResult({ service, today, revision, attempt, entries: runs.size > 1 ? changed() : entries });
    });
    return () => { active = false; };
  }, [service, today, revision, attempt]);
  const current = service && result?.service === service && result.today === today && result.revision === revision && result.attempt === attempt ? result.entries : undefined;
  const entries = current && selectedRun && current.some(e => e.forecast && e.forecast.run_id !== selectedRun) ? changed() : current;
  return { entries, retry: () => setAttempt(n => n + 1) };
}
const changed = (): Entry[] => horizons.map(horizon => ({ horizon, message: 'Source data changed. Refresh the comparison.' }));

/** Today's observed price followed by each horizon, classified against the plan window. */
export function buildColumns(entries: Entry[], today: string, deadline: string): Column[] {
  const anchor = entries.find(e => e.forecast)?.forecast;
  const columns: Column[] = anchor ? [{ id: 'today', label: 'Today', date: today, low: anchor.anchor_price, mid: anchor.anchor_price,
    high: anchor.anchor_price, quote: anchor.anchor_quote_date, observed: true, late: deadline < today, past: false }] : [];
  for (const e of entries) {
    const f = e.forecast;
    // Unavailable horizons are placed by the target they would have had from the shared quote.
    const date = f?.target_date ?? (anchor ? new Date(Date.parse(anchor.anchor_quote_date) + e.horizon * 86_400_000).toISOString().slice(0, 10) : undefined);
    columns.push({ id: e.horizon, label: `${e.horizon} days`, date, low: f?.low ?? 0, mid: f?.forecast ?? 0, high: f?.high ?? 0,
      quote: anchor?.anchor_quote_date, observed: false, late: !!date && date > deadline, past: !!date && date <= today, message: e.message, forecast: f });
  }
  return columns;
}

export function CompareBuyingDates({ entries, quantity, today, deadline, explored, recommended, badge, knownMessage, onExplore }: {
  entries?: Entry[]; quantity: number; today: string; deadline: string; explored?: ColumnId; recommended: ColumnId[];
  /** A forecast failure the page already shows, so the comparison need not repeat it. */
  badge?: string; knownMessage?: string; onExplore(id: ColumnId): void;
}) {
  const id = useId();
  const [unit, setUnit] = useState<'total' | 'mt'>('total');
  const columns = entries ? buildColumns(entries, today, deadline) : [];
  const ready = columns.filter(c => c.observed || c.forecast);
  const lo = Math.min(...ready.map(c => c.low)), hi = Math.max(...ready.map(c => c.high));
  const pad = Math.max(hi - lo, 1) * .08;
  // Horizontal position of a price on the shared scale; 0% is the cheap end.
  const left = (v: number) => `${(((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100).toFixed(2)}%`;
  const reference = columns.find(c => c.observed);
  const quoteDate = entries?.find(e => e.forecast)?.forecast?.anchor_quote_date;
  const before = columns.filter(c => !c.late), after = columns.filter(c => c.late);
  const value = (n: number) => unit === 'total' ? total(n * quantity) : `${usd(n)}/MT`;
  const messages = entries && !entries.some(e => e.forecast) ? new Set(entries.map(e => e.message)) : undefined;
  const sharedMessage = messages?.size === 1 ? [...messages][0] : undefined;
  const ticks = (): number[] => {
    if (!ready.length) return [];
    const domainLo = lo - pad, rawStep = ((hi + pad) - domainLo) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep))), norm = rawStep / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag, out: number[] = [];
    for (let t = Math.ceil(domainLo / step) * step; t <= hi + pad + 1e-6; t += step) out.push(t);
    return out;
  };
  const row = (c: Column) => {
    const available = c.observed || !!c.forecast;
    const status = !available ? 'Unavailable' : c.late ? 'After deadline' : c.past ? 'Past target'
      : recommended.includes(c.id) ? 'Recommended' : c.observed ? 'Observed' : 'Eligible';
    const key = `${id}-${c.id}`;
    return <button key={c.id} type="button" className={`rec-row${c.late ? ' rec-row--late' : ''}${status === 'Recommended' ? ' rec-row--recommended' : ''}`}
      aria-pressed={explored === c.id} aria-labelledby={`${key}-label`} aria-describedby={`${key}-status ${key}-values`}
      disabled={!available} onClick={() => onExplore(c.id)}>
      <span className="rec-row-head">
        <span id={`${key}-label`} className="rec-row-label">{c.label}</span>
        {c.date && <span className="rec-row-date">{dayDate(c.date)}</span>}
        <span id={`${key}-status`} className="rec-chip">{status}</span>
      </span>
      <span className="rec-row-plot" aria-hidden="true">
        {available && (c.observed
          ? <span className="rec-row-dot" style={{ left: left(c.mid) }} />
          : <><span className="rec-row-bar" style={{ left: left(c.low), right: `calc(100% - ${left(c.high)})` }} /><span className="rec-row-dot" style={{ left: left(c.mid) }} /></>)}
      </span>
      <span id={`${key}-values`} className="rec-row-values">
        {available ? <><strong>{value(c.mid)}</strong><span>{c.observed
          ? `Quote from ${dayDate(c.quote ?? today)}`
          : `Range ${unit === 'total' ? `${compact(c.low * quantity)}–${compact(c.high * quantity)}` : `${amount(c.low)}–${amount(c.high)}/MT`}`}</span></>
          : <><strong>Unavailable</strong><span>Model status: {c.message}</span></>}
      </span>
    </button>;
  };
  return <section className="rec-compare" aria-labelledby={`${id}-title`} aria-busy={!entries}>
    <div className="rec-section-head">
      <div><h2 id={`${id}-title`}>Compare buying dates</h2>
        <p>Today’s observed price and the model’s 7, 14 and 30-day forecasts. Each is a separate estimate for its own date.</p></div>
      {sharedMessage === undefined && <div className="rec-compare-tools">
        {badge && <span className="rec-badge">{badge}</span>}
        <div className="rec-toggle" role="group" aria-label="Show prices as">
          <button type="button" aria-pressed={unit === 'total'} onClick={() => setUnit('total')}>Total</button>
          <button type="button" aria-pressed={unit === 'mt'} onClick={() => setUnit('mt')}>Per MT</button>
        </div>
      </div>}
    </div>
    {!entries ? <div className="rec-skeleton rec-skeleton--block" role="status" aria-label="Loading forecasts" />
      : sharedMessage !== undefined ? <p className="rec-compare-unavailable">
        <WarningIcon />No 7, 14 or 30-day forecast is available{sharedMessage === knownMessage ? ', for the reason shown above.' : <>. Model status: {sharedMessage}</>}
      </p>
      : <>
        <div className="rec-rows">
          {reference && ready.length > 0 && <div className="rec-rows-plot" aria-hidden="true">
            <span className="rec-rows-today" style={{ left: left(reference.mid) }} />
          </div>}
          {before.map(row)}
          {after.length > 0 && <div className="rec-row-deadline" aria-label={`Purchase deadline ${formatDate(deadline)}`}>
            <span>Deadline · {dayDate(deadline)}</span>
          </div>}
          {after.map(row)}
        </div>
        {ready.length > 0 && <div className="rec-axis" aria-hidden="true">
          {ticks().map(t => <span key={t} className="rec-axis-tick" style={{ left: left(t) }}>{unit === 'total' ? compact(t * quantity) : amount(t)}</span>)}
        </div>}
        <p className="rec-footnote">Each bar is the forecast’s range on a shared price scale; the dot is the central estimate and the dashed line is today’s price.
          {quoteDate && ` Forecast dates count from the ${formatDate(quoteDate)} quote, not from today.`} Select a row to see its detail.</p>
      </>}
  </section>;
}

/** What one explored date could cost; reads the same forecasts as the columns. */
export function ExploredDetail({ column, quantity, today, source, experimental }: {
  column: Column; quantity: number; today: string; source: string; experimental: boolean;
}) {
  const quote = column.quote;
  const reference = column.observed ? column.mid : column.forecast?.anchor_price;
  return <section className="rec-detail" aria-label="Explored date">
    <div className="rec-section-head"><div>
      <h2>{column.observed ? 'If you buy today' : `If you buy on ${dayDate(column.date!)} (${column.label})`}</h2>
      <p>Exploring a date shows what it could cost. It doesn’t change the recommendation.</p>
    </div></div>
    <dl className="rec-detail-grid">
      <div><dt>{`Estimated total · ${amount(quantity)} MT`}</dt><dd>{column.observed ? total(column.mid * quantity) : totalRange(column.low * quantity, column.high * quantity)}</dd></div>
      <div><dt>Compared with buying today</dt><dd>{column.observed || reference == null ? 'Reference price' : changeRange((column.low - reference) * quantity, (column.high - reference) * quantity)}</dd></div>
      <div><dt>Price per MT</dt><dd>{column.observed ? usd(column.mid) : `${usd(column.low)}–${amount(column.high)}`}</dd></div>
    </dl>
    <div className="rec-detail-foot">
      <span>{column.observed ? `MGO quote observed ${formatDate(quote ?? today)} · ${calendarDays(quote ?? today, today)} days old` : source}</span>
      {!column.observed && experimental && <span className="rec-warning-text"><WarningIcon />Experimental range: no measured confidence coverage. Confirm a current supplier quote before buying.</span>}
      {column.late && <span>After your deadline, so it isn’t used in the recommendation. Totals are price × quantity, shown for comparison only.</span>}
      {!column.observed && column.forecast && column.mid !== reference && <span>Central estimate {usd(column.mid)}/MT · {change((column.mid - reference!) * quantity)} than today in total.</span>}
    </div>
  </section>;
}

export function WarningIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></svg>;
}
