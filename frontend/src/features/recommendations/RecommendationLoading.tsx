import { useEffect, useRef, useState } from 'react';
import type { ReadyForecast } from '../forecast/apiService';
import { buildColumns, type Entry } from './TimingComparison';
import { dayDate, price } from './format';

/** Each finished step stays on screen at least this long, so instant steps can still be read. */
export const STEP_DWELL_MS = 1000;
/** After this long the slow notice offers a retry; the request keeps running. */
export const SLOW_AFTER_MS = 20_000;

const LABELS = [
  'Reading the latest MGO quote',
  'Loading the 7, 14 and 30-day forecasts',
  'Matching forecasts to your deadline',
  'Comparing them with today’s price',
  'Writing your recommendation',
];

type Step = { label: string; detail?: string };

/**
 * Progress for the recommendation request. Steps 1–4 complete from data the page has already loaded;
 * step 5 is the server request itself, so it shows as active until the answer replaces this view.
 */
export function RecommendationLoading({ entries, published, today, deadline, onRetry }: {
  entries?: Entry[]; published?: ReadyForecast; today: string; deadline: string; onRetry(): void;
}) {
  const anchor = entries?.find(e => e.forecast)?.forecast ?? published;
  const columns = entries && anchor ? buildColumns(entries, today, deadline).filter(c => c.forecast && !c.past) : [];
  const fitting = columns.filter(c => !c.late);
  const available = columns.length;
  const steps: Step[] = LABELS.map(label => ({ label }));
  if (anchor) steps[0].detail = `${dayDate(anchor.anchor_quote_date)} · USD ${price(anchor.anchor_price)}/MT`;
  if (entries) {
    steps[1].detail = available === entries.length ? `${available} forecasts found` : `${available} of ${entries.length} found`;
    steps[2].detail = fitting.length ? `${fitting.length} of ${available} before ${dayDate(deadline)}` : `None land before ${dayDate(deadline)}`;
    steps[3].detail = !anchor || !fitting.length ? 'Only buying today fits your deadline'
      : fitting.every(c => c.high < anchor.anchor_price) ? 'All below today’s price'
      : fitting.every(c => c.low > anchor.anchor_price) ? 'All above today’s price'
      : 'Some ranges overlap today’s price';
  }
  // Steps finish in order: the quote first, then the forecasts, which make steps 3 and 4 computable at once.
  const real = !anchor ? 0 : !entries ? 1 : 4;
  const done = useDwell(real);
  const [elapsed, restart] = useElapsed();
  const [dismissed, setDismissed] = useState(false);
  const slow = elapsed >= SLOW_AFTER_MS && !dismissed;
  const retry = () => { restart(); setDismissed(false); onRetry(); };

  return <div className="rec-loading">
    <div>
      <span className="rec-kicker">Recommended action</span>
      <h2>Working out your recommendation</h2>
      <p role="status" aria-live="polite">{LABELS[done]}…</p>
    </div>
    {/* The chart's box is reserved from the start so nothing shifts when the quote arrives. */}
    <div className="rec-loading-chart" aria-hidden="true">{anchor && <LoadingChart anchor={anchor} columns={columns} today={today} deadline={deadline} done={done} />}</div>
    <ol className="rec-steps">
      {steps.map((s, i) => {
        const state = i < done ? 'done' : i === done ? 'active' : 'pending';
        return <li key={s.label} className={`rec-step rec-step--${state}`} aria-current={state === 'active' ? 'step' : undefined}>
          <span className="rec-step-n"><StepIcon state={state} />Step {i + 1} of {steps.length}</span>
          <span className="rec-step-label">{s.label}</span>
          <span className="rec-step-detail">{state === 'done' ? s.detail : ''}</span>
        </li>;
      })}
    </ol>
    {slow && <div className="rec-slow" role="status">
      <span>This is taking longer than usual. It’s still working; you can wait or try again.</span>
      <span className="rec-slow-actions">
        <button type="button" className="bb-button bb-button--secondary" onClick={() => setDismissed(true)}>Keep waiting</button>
        <button type="button" className="bb-button" onClick={retry}>Try again</button>
      </span>
    </div>}
  </div>;
}

/** Reveals completed steps one at a time, each held for STEP_DWELL_MS. Never runs ahead of `real`. */
function useDwell(real: number) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= real) return;
    const timer = setTimeout(() => setShown(n => n + 1), STEP_DWELL_MS);
    return () => clearTimeout(timer);
  }, [shown, real]);
  return Math.min(shown, real);
}

function useElapsed() {
  const start = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - start.current), 1000);
    return () => clearInterval(timer);
  }, []);
  return [elapsed, () => { start.current = Date.now(); setElapsed(0); }] as const;
}

/** Today's quote, the deadline and each forecast range, drawn on a shared date/price scale as steps finish. */
function LoadingChart({ anchor, columns, today, deadline, done }: {
  anchor: ReadyForecast; columns: ReturnType<typeof buildColumns>; today: string; deadline: string; done: number;
}) {
  const t0 = Date.parse(today), dl = Date.parse(deadline);
  const t1 = Math.max(dl, ...columns.map(c => Date.parse(c.date!)), t0 + 86_400_000);
  // The span is a CSS variable so narrow screens can leave room for the right-aligned "Today's price" label.
  const frac = (t: number) => (t - t0) / (t1 - t0);
  const x = (t: number) => `calc(6% + ${frac(t).toFixed(3)} * var(--rec-lc-span))`;
  const values = [anchor.anchor_price, ...columns.flatMap(c => [c.low, c.high])];
  const lo = Math.min(...values), hi = Math.max(...values), pad = (hi - lo) * 0.08 || anchor.anchor_price * 0.02;
  const y = (v: number) => 150 - (v - (lo - pad)) / (hi - lo + 2 * pad) * 130;
  const todayY = y(anchor.anchor_price);
  const showDeadline = dl > t0;

  return <>
    <span className="rec-lc-price" data-on={done >= 4} style={{ top: todayY }} />
    <span className="rec-lc-price-label" data-on={done >= 4} style={{ top: todayY - 20 }}>Today’s price</span>
    {showDeadline && <>
      <span className="rec-lc-deadline" data-on={done >= 3} style={{ left: x(dl) }} />
      <span className={`rec-lc-deadline-label${frac(dl) > .6 ? ' rec-lc-deadline-label--left' : ''}`} data-on={done >= 3} style={{ left: x(dl) }}>Deadline · {dayDate(deadline)}</span>
    </>}
    <span className="rec-lc-today" data-on={done >= 1} style={{ top: todayY }} />
    <span className="rec-lc-label" data-on={done >= 1} style={{ left: '6%' }}>Today</span>
    {columns.map((c, i) => {
      const late = done >= 3 && c.late, fits = done >= 4 && !c.late;
      return <span key={c.id}>
        <span className={`rec-lc-bar${late ? ' rec-lc-bar--late' : ''}${fits ? ' rec-lc-bar--fits' : ''}`} data-on={done >= 2}
          style={{ left: x(Date.parse(c.date!)), top: y(c.high), height: Math.max(4, y(c.low) - y(c.high)), transitionDelay: `${i * 0.18}s` }} />
        <span className="rec-lc-label" data-on={done >= 2} data-late={late} style={{ left: x(Date.parse(c.date!)), transitionDelay: `${i * 0.18}s` }}>{c.label}</span>
      </span>;
    })}
  </>;
}

function StepIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
  return <span className={state === 'active' ? 'rec-step-spin' : 'rec-step-dot'} aria-hidden="true" />;
}
