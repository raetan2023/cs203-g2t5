import { useEffect, useId, useState, type CSSProperties } from 'react';
import type { Forecast, ForecastService, Horizon, ReadyForecast } from '../forecast/apiService';
import { addCalendarDays, calendarDays, formatDate } from '../purchase-plan/dates';
import { amount, compactRange, dayDate, perMt, total, usd } from './format';

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
  // A refresh keeps the last comparison on screen until the new one lands.
  const held = service && result?.service === service && result.today === today ? result.entries : undefined;
  const fresh = held && result?.revision === revision && result?.attempt === attempt;
  const mixed = held && selectedRun && held.some(e => e.forecast && e.forecast.run_id !== selectedRun);
  const entries = mixed ? (fresh ? changed() : undefined) : held;
  return { entries, retry: () => setAttempt(n => n + 1) };
}
const PASSED = 'This forecast date has passed. A newer quote is needed to show it.';
const changed = (): Entry[] => horizons.map(horizon => ({ horizon, message: 'Source data changed. Refresh the comparison.' }));

/** Each price sits on its real target date. A model counts from its own origin: today, or an older quote. Passed targets have no price. */
export function buildColumns(entries: Entry[], today: string, deadline: string): Column[] {
  const anchor = entries.find(e => e.forecast)?.forecast;
  const columns: Column[] = anchor ? [{ id: 'today', label: 'Today', date: today, low: anchor.anchor_price, mid: anchor.anchor_price,
    high: anchor.anchor_price, quote: anchor.anchor_quote_date, observed: true, late: deadline < today, past: false }] : [];
  for (const e of entries) {
    const date = e.forecast?.target_date ?? addCalendarDays(anchor?.forecast_origin_date ?? today, e.horizon);
    const past = !!anchor && date <= today;
    const f = past ? undefined : e.forecast;
    columns.push({ id: e.horizon, label: `${e.horizon} days`, date, low: f?.low ?? 0, mid: f?.forecast ?? 0, high: f?.high ?? 0,
      quote: anchor?.anchor_quote_date, observed: false, late: !past && date > deadline, past, message: past ? PASSED : e.message, forecast: f });
  }
  return columns;
}

/** Today and the three forecast dates, read-only: the buyer can't pick a window, the recommendation sets it. */
export function CompareBuyingDates({ entries, quantity, today, deadline, recommended, badge, knownMessage }: {
  entries?: Entry[]; quantity: number; today: string; deadline: string; recommended: ColumnId[];
  /** A forecast failure the page already shows, so the comparison need not repeat it. */
  badge?: string; knownMessage?: string;
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
  const origin = entries?.find(e => e.forecast)?.forecast?.forecast_origin_date;
  const before = columns.filter(c => !c.late), after = columns.filter(c => c.late);
  const value = (n: number) => unit === 'total' ? total(n * quantity) : `${usd(n)}/MT`;
  // Every horizon failing for one reason is a single fact; say it once instead of on three empty cards.
  const messages = entries && !entries.some(e => e.forecast) ? new Set(entries.map(e => e.message)) : undefined;
  const sharedMessage = messages?.size === 1 ? [...messages][0] : undefined;
  const column = (c: Column) => {
    const available = c.observed || !!c.forecast;
    // Only exceptions get a chip; an ordinary eligible date is just a date.
    const status = c.past ? 'Passed' : !available ? 'Unavailable' : c.late ? 'After deadline' : recommended.includes(c.id) ? 'Recommended' : undefined;
    const key = `${id}-${c.id}`;
    const toDeadline = c.date && !c.observed && !c.late ? calendarDays(c.date, deadline) : undefined;
    const content = <>
      <span className="rec-col-head">
        <span><span id={`${key}-label`} className="rec-col-label">{c.label}</span>
          <span className="rec-col-date">{c.observed ? `Quote from ${dayDate(quoteDate ?? today)}` : c.date && dayDate(c.date)}
            {available && toDeadline !== undefined && toDeadline <= 7 && ` · ${toDeadline === 0 ? 'on your deadline' : `${toDeadline} ${toDeadline === 1 ? 'day' : 'days'} before deadline`}`}</span></span>
        {status && <span className="rec-col-chips"><span id={`${key}-status`} className="rec-chip">{status}</span></span>}
      </span>
      {available ? <span className="rec-col-plot" aria-hidden="true">
        {reference && <span className="rec-col-reference" style={{ top: top(reference.mid) }} />}
        {c.observed ? <span className="rec-col-dot" style={{ top: top(c.mid) }} />
          : <><span className="rec-col-bar" style={{ top: top(c.high), bottom: `calc(100% - ${top(c.low)})` }} /><span className="rec-col-tick" style={{ top: top(c.mid) }} /></>}
      </span> : <span className="rec-col-plot rec-col-plot--empty">{c.past ? c.message : `Model status: ${c.message}`}</span>}
      <span id={`${key}-values`} className="rec-col-values">
        {available ? <><strong>{value(c.mid)}</strong><span>{c.observed
          ? (unit === 'total' ? `${amount(quantity)} MT × USD ${perMt(c.mid)}/MT` : 'Latest observed quote')
          : `Range ${unit === 'total' ? compactRange(c.low * quantity, c.high * quantity) : `${amount(c.low)}–${amount(c.high)}/MT`}`}</span></>
          : <><strong aria-hidden="true">—</strong><span>Unavailable</span></>}
      </span>
    </>;
    const className = `rec-col${c.late ? ' rec-col--late' : ''}${status === 'Recommended' ? ' rec-col--recommended' : ''}${available ? '' : ' rec-col--unavailable'}`;
    return <div key={c.id} role="group" className={className} aria-labelledby={`${key}-label`} aria-describedby={`${status ? `${key}-status ` : ''}${key}-values`}>{content}</div>;
  };
  return <section className="rec-compare" aria-labelledby={`${id}-title`} aria-busy={!entries}>
    <div className="rec-section-head">
      <div><h2 id={`${id}-title`}>Compare buying dates</h2>
        <p>Today’s price and the 7, 14 and 30-day forecasts.</p></div>
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
        {/* The deadline only needs a marker when it separates dates. repeat(0, …) is invalid CSS, so empty groups are left out. */}
        <div className="rec-columns" style={{ '--rec-columns': after.length
          ? `${before.length ? `repeat(${before.length}, minmax(0, 1fr)) ` : ''}72px repeat(${after.length}, minmax(0, 1fr))`
          : `repeat(${before.length}, minmax(0, 1fr))` } as CSSProperties}>
          {before.map(column)}
          {after.length > 0 && <div className="rec-deadline-mark" aria-label={`Purchase deadline ${formatDate(deadline)}`}>
            <span>Deadline</span><span>{dayDate(deadline)}</span><i aria-hidden="true" />
          </div>}
          {after.map(column)}
        </div>
        <p className="rec-footnote">Bars show each forecast’s range on a shared scale; the tick is the central estimate and the dashed line is today’s price.
          {origin && (origin === today ? ' Forecast dates count from today.' : ` Forecast dates count from the ${formatDate(origin)} quote, not from today.`)}</p>
      </>}
  </section>;
}

export function WarningIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></svg>;
}
