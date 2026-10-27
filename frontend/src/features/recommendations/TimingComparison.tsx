import { useEffect, useId, useState, type CSSProperties } from 'react';
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

export function CompareBuyingDates({ entries, quantity, today, deadline, explored, recommended, badge, onExplore }: {
  entries?: Entry[]; quantity: number; today: string; deadline: string; explored?: ColumnId; recommended: ColumnId[];
  badge?: string; onExplore(id: ColumnId): void;
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
  const column = (c: Column) => {
    const available = c.observed || !!c.forecast;
    const status = !available ? 'Unavailable' : c.late ? 'After deadline' : c.past ? 'Past target'
      : recommended.includes(c.id) ? 'Recommended' : c.observed ? 'Observed' : 'Eligible';
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
          ? (unit === 'total' ? `${amount(quantity)} MT × USD ${amount(c.mid)}/MT` : `Quote from ${dayDate(quoteDate!)}`)
          : `Range ${unit === 'total' ? `${compact(c.low * quantity)}–${compact(c.high * quantity)}` : `${amount(c.low)}–${amount(c.high)}/MT`}`}</span></>
          : <><strong>Unavailable</strong><span>Model status: {c.message}</span></>}
      </span>
    </button>;
  };
  return <section className="rec-compare" aria-labelledby={`${id}-title`} aria-busy={!entries}>
    <div className="rec-section-head">
      <div><h2 id={`${id}-title`}>Compare buying dates</h2>
        <p>Today’s observed price and the model’s 7, 14 and 30-day forecasts. Each is a separate estimate for its own date.</p></div>
      <div className="rec-compare-tools">
        {badge && <span className="rec-badge">{badge}</span>}
        <div className="rec-toggle" role="group" aria-label="Show prices as">
          <button type="button" aria-pressed={unit === 'total'} onClick={() => setUnit('total')}>Total</button>
          <button type="button" aria-pressed={unit === 'mt'} onClick={() => setUnit('mt')}>Per MT</button>
        </div>
      </div>
    </div>
    {!entries ? <div className="rec-skeleton rec-skeleton--block" role="status" aria-label="Loading forecasts" />
      : <>
        {/* repeat(0, …) is invalid CSS, so the late group is only added when it has columns. */}
        <div className="rec-columns" style={{ '--rec-columns': `repeat(${before.length}, minmax(0, 1fr)) 64px${after.length ? ` repeat(${after.length}, minmax(0, 1fr))` : ''}` } as CSSProperties}>
          {before.map(column)}
          <div className="rec-deadline-mark" aria-label={`Purchase deadline ${formatDate(deadline)}`}>
            <span>Deadline</span><span>{dayDate(deadline)}</span><i aria-hidden="true" />
          </div>
          {after.map(column)}
        </div>
        <p className="rec-footnote">Bars show each forecast’s range on a shared price scale; the tick is the central estimate and the dashed line is today’s price.
          {quoteDate && ` Forecast dates count from the ${formatDate(quoteDate)} quote, not from today.`} Select a column to see its detail.</p>
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
