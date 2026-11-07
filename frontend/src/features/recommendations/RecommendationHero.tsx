import type { ReactNode } from 'react';
import type { ReadyForecast } from '../forecast/apiService';
import { calendarDays, formatDate } from '../purchase-plan/dates';
import { forecastSource } from './PurchaseImpact';
import { amount, change, changeRange, compactRange, dayDate, perMt, total } from './format';

/** A priced buying date. The range is absent when only a single figure is known. */
export type HeroPoint = { date: string; name?: string; mid?: number; low?: number; high?: number };

const shortDate = (date: string) => dayDate(date).slice(4);
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

function Box({ tone, label, value, unit, notes }: { tone?: 'pick' | 'good' | 'bad'; label: string; value: string; unit?: string; notes: ReactNode[] }) {
  return <div className={`rec-box${tone ? ` rec-box--${tone}` : ''}`}>
    <span className="rec-box-label">{label}</span>
    <strong className="rec-box-value">{value}{unit && <span>{unit}</span>}</strong>
    {notes.map((note, n) => <span key={n} className="rec-box-note">{note}</span>)}
  </div>;
}

/** The sentence under the verdict for Wait and Buy now; other actions keep their own wording. */
export function verdictNote(action: string, deadline: string, daysLeft: number, waitTarget?: string, quote?: number, point?: HeroPoint) {
  if (action === 'WAIT' && waitTarget) {
    const spare = calendarDays(waitTarget, deadline);
    return spare > 0 ? `That still leaves ${days(spare)} before your ${formatDate(deadline)} deadline.` : `That is your ${formatDate(deadline)} deadline.`;
  }
  if (action !== 'BUY_NOW') return undefined;
  const when = daysLeft > 0 ? `Your deadline is ${formatDate(deadline)}, ${days(daysLeft)} away.` : 'Your deadline is today.';
  if (point?.mid == null || quote == null) return `No forecast lands before your deadline, so buying today is the only priced option. ${when}`;
  return `${point.mid > quote ? 'Waiting is forecast to cost more.' : 'The forecast shows no saving from waiting.'} ${when}`;
}

/**
 * Latest quote, a buying date, and the difference between them. Wait highlights the recommended date, Buy now highlights
 * today, and anything else (Monitor) compares the quote with the selected date without highlighting either.
 */
export function HeroFigures({ action, quote, quoteDate, quantity, point, pending, published }: {
  action?: string; quote?: number; quoteDate?: string; quantity: number; point?: HeroPoint; pending?: ReactNode; published?: ReadyForecast;
}) {
  const wait = action === 'WAIT', buy = action === 'BUY_NOW';
  const qty = `${amount(quantity)} MT`;
  const quoted = quoteDate ? shortDate(quoteDate) : undefined;
  const quoteBox = quote != null && <Box tone={buy ? 'pick' : undefined} label={buy ? 'Your buy date · Today' : `Latest quote${quoted ? ` · ${quoted}` : ''}`}
    value={`$${perMt(quote)}`} unit="/MT" notes={[`USD ${amount(quote * quantity)} for ${qty}${buy && quoted ? ` · quote ${quoted}` : ''}`]} />;
  const range = point?.low != null && point.high != null ? { low: point.low, high: point.high } : undefined;
  const forecastBox = point && <Box tone={wait ? 'pick' : undefined}
    label={wait ? `Your buy date · ${dayDate(point.date)}` : buy ? `If you wait until ${dayDate(point.date)}` : `If you buy ${dayDate(point.date)}${point.name ? ` · ${point.name} forecast` : ''}`}
    value={point.mid != null ? `$${perMt(point.mid)}` : range ? `$${perMt(range.low)}–${perMt(range.high)}` : '—'} unit="/MT"
    notes={[...(point.mid != null ? [`USD ${amount(point.mid * quantity)} forecast`] : []),
      ...(range ? [`Range USD ${compactRange(range.low * quantity, range.high * quantity)}`] : []),
      ...(range && quote != null && !wait && !buy ? [`${changeRange((range.low - quote) * quantity, (range.high - quote) * quantity)} than today`] : [])]} />;
  const perTonne = point?.mid != null && quote != null ? point.mid - quote : undefined;
  const difference = (wait || buy) && perTonne !== undefined ? <Difference perTonne={perTonne} quote={quote!} quantity={quantity} wait={wait} /> : undefined;
  const second = forecastBox || pending;
  const count = [quoteBox, second, difference].filter(Boolean).length;
  const source = sourceLine(point, published, quoted);
  if (!count) return null;
  return <>
    <div className={`rec-boxes rec-boxes--${count}`}>
      {quoteBox}
      {quoteBox && second && <span className="rec-box-arrow" aria-hidden="true"><ArrowIcon /></span>}
      {second}
      {difference}
    </div>
    {source && <p className="rec-hero-source">{source}</p>}
  </>;
}

/** Green or red only when the figure agrees with the verdict. If the date's own forecast disagrees with the blended signal, it stays neutral. */
function Difference({ perTonne, quote, quantity, wait }: { perTonne: number; quote: number; quantity: number; wait: boolean }) {
  if (perTonne === 0) return <Box label="No expected difference" value="USD 0" notes={['Same as the latest quote']} />;
  const whole = perTonne * quantity;
  const note = `$${perMt(Math.abs(perTonne))}/MT · ${Math.round(Math.abs(perTonne) / quote * 100)}% ${perTonne < 0 ? 'below' : 'above'} the latest quote`;
  if (wait && perTonne < 0) return <Box tone="good" label="Expected saving" value={`≈ ${total(-whole)}`} notes={[note]} />;
  if (!wait && perTonne > 0) return <Box tone="bad" label="Extra cost if you wait" value={`≈ ${total(whole)}`} notes={[note]} />;
  return <Box label="Against the latest quote" value={`≈ ${change(whole)}`} notes={[note]} />;
}

function sourceLine(point: HeroPoint | undefined, published: ReadyForecast | undefined, quoted: string | undefined) {
  if (!point) return quoted ? `Based on the ${quoted} quote, a dated reference and not a supplier offer.` : undefined;
  const { experimental, executedRidge } = forecastSource(published);
  const model = executedRidge || published?.interval.method === 'gdelt_error_quantiles' ? ' (Ridge regression)' : experimental ? ' (last observed quote)' : '';
  return `According to Bunker Buddy’s ${point.name ? `${point.name} ` : ''}MGO forecast${model}${quoted ? `, based on the ${quoted} quote` : ''}. Forecasts are estimates, not guaranteed prices.`;
}

function ArrowIcon() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16" /><path d="M14 6l6 6-6 6" /></svg>;
}
