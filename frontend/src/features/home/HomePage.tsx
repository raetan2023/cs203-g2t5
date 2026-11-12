import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { AppLink } from '../../app/router';
import { AppIcon } from '../../components/AppIcon';
import type { MgoQuote, ReadMgoQuote } from './marketQuote';
import { topicLabel, type NewsFeed, type ReadNews } from './newsFeed';
import type { ReadAlerts } from './newsAlerts';
import { MarketAlerts } from './MarketAlerts';
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

type Action = { label: string; href: string };

/** One primary action per organisation role, matching what that role can do elsewhere in the app. */
export function homeAction({ role, canReadPlans }: {
  role?: string; canReadPlans: boolean;
}): Action | null {
  if (role === 'org:admin') return { label: 'Enter administration', href: '/admin' };
  if (role === 'org:manager') return { label: 'Approval inbox', href: '/purchase-plans#approval-inbox' };
  return canReadPlans ? { label: 'Go to your plans', href: '/purchase-plans' } : null;
}

export function HomePage({ displayName, role, canReadPlans = true, marketAvailable = false, today, readQuote, readNews, readAlerts, now = new Date() }: {
  displayName: string;
  role?: string;
  canReadPlans?: boolean;
  marketAvailable?: boolean;
  /** The app's operational date (YYYY-MM-DD, Singapore). */
  today?: string;
  /** Omitted where no market API is connected; the price card is then hidden. */
  readQuote?: ReadMgoQuote;
  /** Omitted where no news API is connected; the Latest news section is then hidden. */
  readNews?: ReadNews;
  /** Omitted where no news API is connected; the Market alerts tiles are then hidden. */
  readAlerts?: ReadAlerts;
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
  const action = homeAction({ role, canReadPlans });

  return <main className="bb-home" aria-labelledby="home-greeting">
    <section className="bb-home-hero">
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
          <div className="bb-home-actions-start">
            {action && <AppLink className="bb-button bb-home-cta" href={action.href}>{action.label}<AppIcon name="arrow" /></AppLink>}
            {marketAvailable && <AppLink className="bb-button bb-button--secondary bb-home-cta" href="/market-dashboard">Market dashboard<AppIcon name="arrow" /></AppLink>}
          </div>
          {readNews && <a className="bb-home-jump" href="#latest-news" onClick={jumpToNews}>Latest news <span aria-hidden="true">↓</span></a>}
          <div className="bb-home-actions-end">
            {readQuote && <QuoteCard read={readQuote} linked={marketAvailable} />}
          </div>
        </div>
      </div>
    </section>
    {readAlerts && <MarketAlerts read={readAlerts} />}
    {readNews && <LatestNews read={readNews} now={now} />}
  </main>;
}

/** Scrolls without writing #latest-news into the URL, which the app's router keys on. */
function jumpToNews(event: MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById('latest-news');
  if (!target) return;
  event.preventDefault();
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  target.focus({ preventScroll: true });
}

const NEWS_PAGE = 8;
const SINGAPORE = 'Asia/Singapore';
type NewsState = { status: 'loading' } | { status: 'ready'; feed: NewsFeed } | { status: 'error' };

function LatestNews({ read, now }: { read: ReadNews; now: Date }) {
  const [state, setState] = useState<NewsState>({ status: 'loading' });
  const [shown, setShown] = useState(NEWS_PAGE);
  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    setShown(NEWS_PAGE);
    read().then(feed => { if (current) setState({ status: 'ready', feed }); })
      .catch(() => { if (current) setState({ status: 'error' }); });
    return () => { current = false; };
  }, [read]);

  const items = state.status === 'ready' ? state.feed.items : [];
  const updated = state.status === 'ready' && state.feed.updatedAt ? updatedText(state.feed.updatedAt, now) : null;
  const message = state.status === 'loading' ? 'Loading headlines…'
    : state.status === 'error' ? 'News is unavailable right now.'
      : items.length === 0 ? 'No headlines stored yet.' : null;

  return <section id="latest-news" className="bb-home-news" aria-labelledby="latest-news-title" tabIndex={-1}>
    <div className="bb-home-news-inner">
      <header className="bb-home-news-head">
        <h2 id="latest-news-title">Latest news</h2>
        {updated && <p>Updated {updated}</p>}
      </header>
      {message
        ? <p className="bb-home-news-message" role="status">{message}</p>
        : <table className="bb-home-news-table">
          <thead>
            <tr><th scope="col">Date</th><th scope="col">Source</th><th scope="col">Headline</th><th scope="col" className="bb-home-news-topic">Topic</th><td aria-hidden="true" /></tr>
          </thead>
          <tbody>
            {items.slice(0, shown).map(item => <tr key={item.url}>
              <td className="bb-home-news-date"><time dateTime={item.seenAt}>{rowDate(item.seenAt)}</time></td>
              <td className="bb-home-news-source">{item.source}</td>
              <td className="bb-home-news-headline">
                <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}<span className="bb-home-sr-only">, opens in a new tab</span></a>
              </td>
              <td className="bb-home-news-topic">{topicLabel(item.topic)}</td>
              <td className="bb-home-news-out" aria-hidden="true">↗</td>
            </tr>)}
          </tbody>
        </table>}
      {items.length > shown && <footer className="bb-home-news-foot">
        <button type="button" className="bb-home-news-more" onClick={() => setShown(count => count + NEWS_PAGE)}>
          Show more <span aria-hidden="true">›</span>
        </button>
      </footer>}
    </div>
  </section>;
}

function singaporeParts(iso: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: SINGAPORE, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return { weekday: part('weekday'), day: part('day'), month: part('month'), time: `${part('hour')}:${part('minute')}` };
}

/** "Mon 02 Nov", in Singapore time like the rest of the app. */
function rowDate(iso: string) {
  const { weekday, day, month } = singaporeParts(iso);
  return `${weekday} ${day} ${month}`;
}

/** "08:00 today", or "08:00 Sun 01 Nov" when the last collection was on an earlier day. */
function updatedText(iso: string, now: Date) {
  const updated = singaporeParts(iso);
  const day = (parts: ReturnType<typeof singaporeParts>) => `${parts.weekday} ${parts.day} ${parts.month}`;
  return day(updated) === day(singaporeParts(now.toISOString())) ? `${updated.time} today` : `${updated.time} ${day(updated)}`;
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
  // e.g. "Thursday 12 Nov 2026", the same for every role. Built from parts so no comma appears.
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', ...(date && { timeZone: 'UTC' }) })
    .formatToParts(date ?? new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`;
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
      <span className="bb-home-quote-text"><span className="bb-home-quote-label">Singapore MGO</span>
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
      <span className="bb-home-quote-label">Singapore MGO · {shortDate(quote.observedDate)}</span>
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
  const label = `Singapore MGO price ${price}${perTonne ? ' per tonne' : unit}, ${fullDate(quote.observedDate)}${change ? `, ${change.spoken}` : ''}.`;
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
