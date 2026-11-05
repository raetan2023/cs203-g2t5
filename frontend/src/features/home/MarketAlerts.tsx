import { useEffect, useState } from 'react';
import { topicLabel } from './newsFeed';
import type { AlertState, MarketAlerts as Alerts, NewsSpike, PriceMove, ReadAlerts } from './newsAlerts';

type State = { status: 'loading' } | { status: 'ready'; alerts: Alerts } | { status: 'error' };

/** News-spike and MGO price-move alerts from stored data; each signal says plainly when it cannot be judged yet. */
export function MarketAlerts({ read }: { read: ReadAlerts }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    read().then(alerts => { if (current) setState({ status: 'ready', alerts }); })
      .catch(() => { if (current) setState({ status: 'error' }); });
    return () => { current = false; };
  }, [read]);

  const message = state.status === 'loading' ? 'Checking for unusual activity…'
    : state.status === 'error' ? 'Market alerts are unavailable right now.' : null;
  return <section className="bb-home-alerts" aria-labelledby="market-alerts-title">
    <h2 id="market-alerts-title" className="bb-home-alerts-title">Market alerts</h2>
    {message
      ? <p className="bb-home-alerts-message" role="status">{message}</p>
      : state.status === 'ready' && <ul className="bb-home-alerts-list">
        <NewsTile spike={state.alerts.news} />
        <PriceTile move={state.alerts.price} />
      </ul>}
  </section>;
}

const BADGES: Record<AlertState, string> = { alert: 'Alert', normal: 'Normal', insufficient: 'Not enough history' };

function Tile({ label, state, summary, detail }: { label: string; state: AlertState | 'none'; summary: string; detail?: string }) {
  return <li className={`bb-home-alert${state === 'alert' ? ' bb-home-alert--raised' : ''}`}>
    <div className="bb-home-alert-head">
      <h3>{label}</h3>
      <span className="bb-home-alert-badge">{state === 'alert' && <span aria-hidden="true">! </span>}{state === 'none' ? 'No data' : BADGES[state]}</span>
    </div>
    <p className="bb-home-alert-summary">{summary}</p>
    {detail && <p className="bb-home-alert-detail">{detail}</p>}
  </li>;
}

function NewsTile({ spike }: { spike: NewsSpike | null }) {
  if (!spike) return <Tile label="News spike" state="none" summary="No complete news window is stored yet." />;
  const count = plural(spike.articleCount, 'headline');
  const to = `in the 24 hours to ${windowTime(spike.windowEnd)}`;
  const topics = spike.topTopics.length ? `Most coverage: ${spike.topTopics.map(t => topicLabel(t.topic)).join(', ')}.` : undefined;
  if (spike.state === 'insufficient' || spike.baselineCount == null)
    return <Tile label="News spike" state="insufficient" summary={`${count} ${to}. Too few earlier windows are stored to judge a spike.`} detail={topics} />;
  const usual = `the usual ${spike.baselineCount.toLocaleString('en-US')}`;
  const summary = spike.state === 'alert'
    ? `${count} ${to}, ${ratio(spike.articleCount, spike.baselineCount)} ${usual}.`
    : `${count} ${to}, in line with ${usual}.`;
  return <Tile label="News spike" state={spike.state} summary={summary} detail={topics} />;
}

function PriceTile({ move }: { move: PriceMove | null }) {
  const label = 'Singapore MGO price move';
  if (!move) return <Tile label={label} state="none" summary="No MGO price is stored yet." />;
  const on = `on ${dayText(move.observedDate)}`;
  if (move.changePct == null) return <Tile label={label} state="insufficient" summary={`Only one MGO price is stored, ${on}.`} />;
  const change = `${move.changePct > 0 ? 'Up' : move.changePct < 0 ? 'Down' : 'Unchanged'}${move.changePct ? ` ${percent(move.changePct)}` : ''} ${on}`;
  if (move.state === 'insufficient' || move.typicalChangePct == null)
    return <Tile label={label} state="insufficient" summary={`${change}. Too few earlier prices are stored to judge the move.`} />;
  const typical = `a typical daily move of ${percent(move.typicalChangePct)}`;
  return <Tile label={label} state={move.state} summary={move.state === 'alert' ? `${change}, well outside ${typical}.` : `${change}, within ${typical}.`} />;
}

const plural = (count: number, word: string) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;
const percent = (value: number) => `${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

function ratio(count: number, usual: number) {
  return usual > 0 ? `${(count / usual).toLocaleString('en-US', { maximumFractionDigits: 1 })} times` : 'well above';
}

/** "08:17 Mon 02 Nov", in Singapore time like the rest of Home. */
function windowTime(iso: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('hour')}:${part('minute')} ${part('weekday')} ${part('day')} ${part('month')}`;
}

const dayText = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
