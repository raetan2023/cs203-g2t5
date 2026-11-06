import { useEffect, useId, useState, type CSSProperties } from 'react';
import type { Forecast, ForecastService, Horizon, ReadyForecast } from '../forecast/apiService';
import { addCalendarDays, calendarDays, formatDate } from '../purchase-plan/dates';
import { amount, change, changeRange, compact, dayDate, total, totalRange, usd } from './format';

const horizons = [7, 14, 30] as const;
export type Entry = { horizon: Horizon; forecast?: ReadyForecast; message?: string };
export type ColumnId = 'today' | Horizon;
export interface Column {
  id: ColumnId; label: string; date?: string; low: number; mid: number; high: number;
  /** Observation date of the shared reference quote every column is anchored to. */
  quote?: string; mockReference?: boolean; observed: boolean; late: boolean; past: boolean; message?: string; forecast?: ReadyForecast;
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

/** Buying dates count from the planning day; a price is only valid for its actual target. */
export function buildColumns(entries: Entry[], today: string, deadline: string): Column[] {
  const anchor = entries.find(e => e.forecast)?.forecast;
  const columns: Column[] = anchor ? [{ id: 'today', label: 'Today', date: today, low: anchor.anchor_price, mid: anchor.anchor_price,
    high: anchor.anchor_price, quote: anchor.anchor_quote_date, mockReference: !!anchor.synthetic && !anchor.source_dates.mgo, observed: true, late: deadline < today, past: false }] : [];
  for (const e of entries) {
    const date = addCalendarDays(today, e.horizon);
    // Never move a dated model estimate to a different buying date.
    const f = e.forecast?.target_date === date ? e.forecast : undefined;
    const message = e.forecast && !f
      ? `No estimate for ${formatDate(date)}. The latest ${e.horizon}-day forecast targets ${formatDate(e.forecast.target_date)}. Updated forecast data is required.`
      : e.message;
    columns.push({ id: e.horizon, label: `${e.horizon} days`, date, low: f?.low ?? 0, mid: f?.forecast ?? 0, high: f?.high ?? 0,
      quote: anchor?.anchor_quote_date, observed: false, late: date > deadline, past: false, message, forecast: f });
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
  const top = (value: number) => `${((1 - (value - (lo - pad)) / (hi - lo + 2 * pad)) * 100).toFixed(2)}%`;
  const reference = columns.find(c => c.observed);
  const quoteDate = entries?.find(e => e.forecast)?.forecast?.anchor_quote_date;
  const before = columns.filter(c => !c.late), after = columns.filter(c => c.late);
  const value = (n: number) => unit === 'total' ? total(n * quantity) : `${usd(n)}/MT`;
  // Every horizon failing for one reason is a single fact; say it once instead of on three empty cards.
  const messages = entries && !entries.some(e => e.forecast) ? new Set(entries.map(e => e.message)) : undefined;
  const sharedMessage = messages?.size === 1 ? [...messages][0] : undefined;
  const column = (c: Column) => {
    const available = c.observed || !!c.forecast;
    const status = !available ? 'Unavailable' : c.late ? 'After deadline' : c.past ? 'Past target'
      : recommended.includes(c.id) ? 'Recommended' : c.observed ? (c.mockReference ? 'Mock reference' : 'Observed') : 'Eligible';
    const key = `${id}-${c.id}`;
    return <button key={c.id} type="button" className={`rec-col${c.late ? ' rec-col--late' : ''}${status === 'Recommended' ? ' rec-col--recommended' : ''}`}
      aria-pressed={explored === c.id} aria-labelledby={`${key}-label`} aria-describedby={`${key}-status ${key}-values`}
      disabled={!available} onClick={() => onExplore(c.id)}>
      <span className="rec-col-head">
        <span><span id={`${key}-label`} className="rec-col-label">{c.label}</span>{c.date && <span className="rec-col-date">{dayDate(c.date)}</span>}</span>
        <span id={`${key}-status`} className="rec-chip">{status}</span>
      </span>
      {available && <span className="rec-col-plot" aria-hidden="true">
        {reference && <span className="rec-col-reference" style={{ top: top(reference.mid) }} />}
        {c.observed ? <span className="rec-col-dot" style={{ top: top(c.mid) }} />
          : <><span className="rec-col-bar" style={{ top: top(c.high), bottom: `calc(100% - ${top(c.low)})` }} /><span className="rec-col-tick" style={{ top: top(c.mid) }} /></>}
      </span>}
      <span id={`${key}-values`} className="rec-col-values">
        {available ? <><strong>{value(c.mid)}</strong><span>{c.observed
          ? (c.mockReference ? 'Illustrative baseline · no observed quote available' : unit === 'total' ? `${amount(quantity)} MT × USD ${amount(c.mid)}/MT · Quote from ${dayDate(quoteDate!)}` : `Quote from ${dayDate(quoteDate!)}`)
          : `Range ${unit === 'total' ? `${compact(c.low * quantity)}–${compact(c.high * quantity)}` : `${amount(c.low)}–${amount(c.high)}/MT`}`}</span></>
          : <><strong>Unavailable</strong><span>Model status: {c.message}</span></>}
      </span>
    </button>;
  };
  return <section className="rec-compare" aria-labelledby={`${id}-title`} aria-busy={!entries}>
    <div className="rec-section-head">
      <div><h2 id={`${id}-title`}>Compare buying dates</h2>
        <p>Compare buying today with 7, 14 and 30 days from today. Today’s reference uses the latest available observed quote.</p></div>
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
        {/* repeat(0, …) is invalid CSS, so the late group is only added when it has columns. */}
        <div className="rec-columns" style={{ '--rec-columns': `repeat(${before.length}, minmax(0, 1fr)) 72px${after.length ? ` repeat(${after.length}, minmax(0, 1fr))` : ''}` } as CSSProperties}>
          {before.map(column)}
          <div className="rec-deadline-mark" aria-label={`Purchase deadline ${formatDate(deadline)}`}>
            <span>Deadline</span><span>{dayDate(deadline)}</span><i aria-hidden="true" />
          </div>
          {after.map(column)}
        </div>
        <p className="rec-footnote">Dates count from today, {formatDate(today)}. Bars show each forecast’s range; the tick is the central estimate.
          {reference?.mockReference ? ' The dashed line is an illustrative baseline.' : quoteDate && ` The dashed line uses the observed quote from ${formatDate(quoteDate)}.`} A price is shown only when the forecast targets that exact date. Select a column to see its detail.</p>
      </>}
  </section>;
}

/** What one explored date could cost; reads the same forecasts as the columns. */
export function ExploredDetail({ column, quantity, today, source, sourceFrom, experimental }: {
  column: Column; quantity: number; today: string; source: string; sourceFrom?: string; experimental: boolean;
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
      <div><dt>Compared with buying today</dt><dd>{column.observed || reference == null ? <span className="rec-na" aria-label="Not applicable: this is the reference price">—</span> : changeRange((column.low - reference) * quantity, (column.high - reference) * quantity)}</dd></div>
      <div><dt>Price per MT</dt><dd>{column.observed ? usd(column.mid) : `${usd(column.low)}–${amount(column.high)}`}</dd></div>
    </dl>
    <div className="rec-detail-foot">
      <span>{column.mockReference ? 'Illustrative reference: no observed quote available.' : column.observed ? `MGO quote observed ${formatDate(quote ?? today)} · ${calendarDays(quote ?? today, today)} days old` : source}</span>
      {!column.observed && sourceFrom && <span>{sourceFrom}</span>}
      {!column.observed && experimental && <span className="rec-warning-text"><WarningIcon />Experimental range: no measured confidence coverage.</span>}
      {column.late && <span>After your deadline, so it isn’t used in the recommendation. Totals are price × quantity, shown for comparison only.</span>}
      {!column.observed && column.forecast && column.mid !== reference && <span>Central estimate {usd(column.mid)}/MT · {change((column.mid - reference!) * quantity)} than today in total.</span>}
    </div>
  </section>;
}

export function WarningIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></svg>;
}
