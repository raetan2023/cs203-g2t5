import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { AppLink } from '../../app/router';
import { AppIcon } from '../../components/AppIcon';
import type { MgoQuote, ReadMgoQuote } from './marketQuote';
import harbour from './assets/harbour-dusk.jpg';
import './home.css';

/** Width of one uppercase character at the greeting's tracking, in em. Sizes the greeting to fill one line. */
const CHAR_EM = 0.64;
const MAX_GREETING_PX = 116;
const MAX_NAME_PX = 48;
/** Below this the one-line greeting is too small to read as a headline, so the name moves to a second line. */
const MIN_ONE_LINE_PX = 56;

export function greetingFor(hour: number) {
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

type Action = { label: string; href: string } | { label: string; onClick(): void };

/** One primary action per organisation role, matching what that role can do elsewhere in the app. */
export function homeAction({ role, canReadPlans, marketAvailable, onManageOrganisation }: {
  role?: string; canReadPlans: boolean; marketAvailable: boolean; onManageOrganisation?: () => void;
}): Action | null {
  if (role === 'org:admin') return onManageOrganisation ? { label: 'Manage organisation', onClick: onManageOrganisation } : null;
  if (role === 'org:manager') return { label: 'Plans for approval', href: '/purchase-plans#approval-inbox' };
  if (role === 'org:analyst') return marketAvailable ? { label: 'Market dashboard', href: '/market-dashboard' }
    : { label: 'View purchase plans', href: '/purchase-plans' };
  return canReadPlans ? { label: 'Go to your plans', href: '/purchase-plans' } : null;
}

export function HomePage({ displayName, role, canReadPlans = true, marketAvailable = false, today, readQuote, onManageOrganisation, now = new Date() }: {
  displayName: string;
  role?: string;
  canReadPlans?: boolean;
  marketAvailable?: boolean;
  /** The app's operational date (YYYY-MM-DD, Singapore). */
  today?: string;
  /** Omitted where no market API is connected; the price card is then hidden. */
  readQuote?: ReadMgoQuote;
  onManageOrganisation?: () => void;
  now?: Date;
}) {
  const name = displayName.trim();
  const part = greetingFor(now.getHours());
  const full = name ? `${part}, ${name}` : part;
  const content = useRef<HTMLDivElement>(null);
  const width = useWidth(content);
  const oneLine = width / (full.length * CHAR_EM);
  const split = !!name && oneLine < MIN_ONE_LINE_PX;
  const firstLine = split ? `${part},` : full;
  const action = homeAction({ role, canReadPlans, marketAvailable, onManageOrganisation });

  return <main className="bb-home" aria-labelledby="home-greeting">
    <img className="bb-home-photo" src={harbour} alt="" />
    <div className="bb-home-content" ref={content}>
      <div className="bb-home-intro">
        <h1 id="home-greeting" className="bb-home-greeting">
          <span style={{ fontSize: fit(width, firstLine, MAX_GREETING_PX) }}>{firstLine}</span>
          {split && <>{' '}<span className="bb-home-name" style={{ fontSize: fit(width, name, MAX_NAME_PX) }}>{name}</span></>}
        </h1>
        <p className="bb-home-date">{longDate(today)}</p>
      </div>
      <div className="bb-home-actions">
        {action && ('href' in action
          ? <AppLink className="bb-button bb-home-cta" href={action.href}>{action.label}<AppIcon name="arrow" /></AppLink>
          : <button type="button" className="bb-button bb-home-cta" onClick={action.onClick}>{action.label}<AppIcon name="arrow" /></button>)}
        {readQuote && <QuoteCard read={readQuote} linked={marketAvailable} />}
      </div>
    </div>
  </main>;
}

function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(() => typeof window === 'undefined' ? 1360 : Math.max(window.innerWidth - 80, 0));
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const style = getComputedStyle(element);
      setWidth(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function fit(width: number, text: string, max: number) {
  return `${Math.min(max, width / (text.length * CHAR_EM)).toFixed(1)}px`;
}

function calendarDate(today?: string) {
  return today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? new Date(`${today}T00:00:00Z`) : null;
}

function longDate(today?: string) {
  const date = calendarDate(today);
  return (date ?? new Date()).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', ...(date && { timeZone: 'UTC' }) });
}

const shortDate = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullDate = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

type QuoteState = { status: 'loading' } | { status: 'ready'; quote: MgoQuote } | { status: 'empty' } | { status: 'error' };

function QuoteCard({ read, linked }: { read: ReadMgoQuote; linked: boolean }) {
  const [state, setState] = useState<QuoteState>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    read().then(quote => { if (current) setState(quote ? { status: 'ready', quote } : { status: 'empty' }); })
      .catch(() => { if (current) setState({ status: 'error' }); });
    return () => { current = false; };
  }, [read]);

  if (state.status !== 'ready') {
    const message = state.status === 'loading' ? 'Loading price…' : state.status === 'empty' ? 'No price stored yet' : 'Price unavailable right now';
    return <div className="bb-home-quote" role="status">
      <span className="bb-home-quote-text"><span className="bb-home-quote-label">Singapore MGO est.</span>
        <span className="bb-home-quote-message">{message}</span></span>
    </div>;
  }

  const { quote } = state;
  const price = `${quote.currency ? `${quote.currency} ` : ''}${quote.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const perTonne = /\/MT$/i.test(quote.unit);
  const unit = perTonne ? ' /MT' : quote.unit ? ` ${quote.unit}` : '';
  const change = changeText(quote);
  const body = <>
    <span className="bb-home-quote-text">
      <span className="bb-home-quote-label">Singapore MGO est. · {shortDate(quote.observedDate)}</span>
      <span className="bb-home-quote-price">{price}<span className="bb-home-quote-unit">{unit}</span></span>
    </span>
    {quote.history.length > 1 && <svg className="bb-home-spark" width="72" height="28" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path d={sparkline(quote.history)} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>}
    <span className="bb-home-quote-side">
      {change && <span>{change.symbol} {change.text}</span>}
      {linked && <span className="bb-home-quote-link">Market <span aria-hidden="true">→</span></span>}
    </span>
  </>;
  const label = `Singapore MGO estimate ${price}${perTonne ? ' per tonne' : unit}, ${fullDate(quote.observedDate)}${change ? `, ${change.spoken}` : ''}.`;
  return linked
    ? <AppLink className="bb-home-quote" href="/market-dashboard" aria-label={`${label} Open market dashboard.`}>{body}</AppLink>
    : <div className="bb-home-quote" role="group" aria-label={label}>{body}</div>;
}

function changeText(quote: MgoQuote) {
  const amount = quote.changePct ?? quote.changeAbs;
  if (amount == null) return null;
  const digits = (value: number) => Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const text = quote.changePct != null ? `${digits(quote.changePct)}%` : digits(quote.changeAbs!);
  if (amount > 0) return { symbol: '▲', text, spoken: `up ${text}` };
  if (amount < 0) return { symbol: '▼', text, spoken: `down ${text}` };
  return { symbol: '—', text: quote.changePct != null ? '0%' : '0', spoken: 'no change' };
}

function sparkline(values: number[]) {
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  return values.map((value, index) => `${index ? 'L' : 'M'}${(index / (values.length - 1) * 100).toFixed(2)} ${(28 - (value - min) / range * 26).toFixed(2)}`).join(' ');
}
