import React, { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDatabaseMarket } from './useBrentMarket';
import { ageLabel, daysOld, singaporeToday, STALE_AFTER_DAYS, withMinus } from './format';
import { chart } from '../../styles/theme';
import './stored-market.css';

function valid(data) {
  return data.storage === 'supabase' && Array.isArray(data.missing) && Array.isArray(data.series)
    && data.series.every(series => typeof series.ticker?.value === 'number' && Number.isFinite(series.ticker.value)
      && /^\d{4}-\d{2}-\d{2}$/.test(series.ticker.observedDate) && Array.isArray(series.history));
}
const format = (value, digits = 4) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
const twoPlaces = value => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const dateLabel = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
const monthLabel = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-SG', { month: 'long', year: 'numeric' });
const fuelName = label => label.replace(/^Bunker sales:\s*/i, '').toLowerCase()
  .replace(/\b\w/g, char => char.toUpperCase()).replace(/\b(Lng|Mgo|Mdo|B100)\b/g, word => word.toUpperCase());
const isMgo = name => /marine gas oil|\bmgo\b/i.test(name);
const salesUnit = unit => (unit || '').replace(/\s*\(as published\)\s*$/i, '');
const order = ['SGP_MGO_OBSERVED', 'SGP_GASOIL_FUT', 'BRENT_CRUDE', 'DUBAI_CRUDE', 'USD_INDEX'];
// An unlisted series sorts after every listed one, so it can never displace MGO.
const orderOf = key => { const index = order.indexOf(key); return index < 0 ? order.length : index; };
const TONE_LIMIT = 10; // GDELT tone rarely leaves ±10, so the gauge clamps there.

function Symbol({ name, ...props }) {
  const shapes = {
    refresh: <><path d="M3 11a9 9 0 0 1 15.4-6.4L21 7M21 3v4h-4" /><path d="M21 13a9 9 0 0 1-15.4 6.4L3 17M7 17H3v4" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{shapes[name]}</svg>;
}

function Price({ ticker, compact = false }) {
  const digits = ticker.unit === 'index' || ticker.unit === 'tone' ? 4 : 2;
  const value = new Intl.NumberFormat('en-US', { maximumFractionDigits: digits,
    minimumFractionDigits: ticker.currency === 'USD' || ticker.unit === 'source-defined' ? 2 : 0 }).format(ticker.value);
  return <>{ticker.currency === 'USD' ? '$' : ''}{value}{!compact && <span className="sm-unit">{unitLabel(ticker)}</span>}</>;
}
const unitLabel = ticker => ticker.unit === 'source-defined' ? 'Unit pending verification' : ticker.unit || 'Unit unspecified';

/** The USD index has no direct cost meaning for a buyer, so it never reads as good or bad. */
const buyerTone = ticker => ticker.seriesKey === 'USD_INDEX' || !ticker.changeAbs ? 'neutral' : ticker.changeAbs > 0 ? 'up' : 'down';

function Change({ ticker, plain = false }) {
  if (ticker.changeAbs == null) return <span className={`sm-change sm-neutral ${plain ? '' : 'sm-change-chip'}`}>No previous observation</span>;
  const direction = ticker.changeAbs > 0 ? 'up' : ticker.changeAbs < 0 ? 'down' : 'flat';
  const sign = ticker.changeAbs > 0 ? '+' : '';
  return <span className={`sm-change sm-${buyerTone(ticker)} ${plain ? '' : 'sm-change-chip'}`} title="Change versus the previous stored observation">
    <span aria-hidden="true">{direction === 'up' ? '↑' : direction === 'down' ? '↓' : '—'}</span>
    {' '}{withMinus(`${direction === 'flat' ? '' : sign}${ticker.changePct != null ? `${twoPlaces(ticker.changePct)}%` : format(ticker.changeAbs)}`)}
    <span className="sm-sr-only"> versus the previous observation</span>
  </span>;
}

function HistoryTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return <div className="sm-tooltip"><span>{dateLabel(label)}</span><strong>{format(payload[0].value)} <small>{unit}</small></strong></div>;
}

const AgeBadge = ({ date, today }) => {
  const age = daysOld(date, today);
  return age > STALE_AFTER_DAYS ? <span className="sm-age">{ageLabel(age)}</span> : null;
};

function PriceCard({ ticker, featured, today }) {
  const symbol = ticker.seriesKey === 'USD_INDEX' ? 'FX' : ticker.label.includes('MGO') ? 'MGO' : ticker.label.includes('gasoil') ? 'GO' : ticker.label.includes('Dubai') ? 'DXB' : 'BRN';
  return <article className={`sm-price-card sm-tone-${buyerTone(ticker)} ${featured ? 'sm-featured' : ''}`}>
    <div className="sm-card-top"><span className="sm-card-symbol">{symbol}</span><AgeBadge date={ticker.observedDate} today={today} /></div>
    <h2>{ticker.label}</h2>
    <div className="sm-price"><Price ticker={ticker} compact /></div>
    <div className="sm-price-unit">{unitLabel(ticker)}</div>
    <Change ticker={ticker} />
    <div className="sm-card-footer"><time dateTime={ticker.observedDate}>{dateLabel(ticker.observedDate)}</time><span title={ticker.source}>{ticker.source.replace(/ manual export$/i, '')}</span></div>
  </article>;
}

function HistoryPanel({ chartSeries, selected, history, range, setRange, setSelectedKey }) {
  const [showValues, setShowValues] = useState(false);
  return <section className="sm-panel sm-history" aria-label="Stored observation history">
    <div className="sm-panel-heading"><div><h2>Market history</h2>
      <div className="sm-history-summary"><span className="sm-history-price"><Price ticker={selected.ticker} /></span><Change ticker={selected.ticker} plain /></div></div>
      <div className="sm-history-controls"><label className="sm-sr-only" htmlFor="market-history-series">Choose a series</label>
        <select id="market-history-series" value={selected.ticker.seriesKey} onChange={event => setSelectedKey(event.target.value)}>{chartSeries.map(s => <option key={s.ticker.seriesKey} value={s.ticker.seriesKey}>{s.ticker.label}</option>)}</select>
        <div className="sm-range" role="group" aria-label="History length">{[15, 30, 60].map(value => <button type="button" key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{value} days</button>)}</div>
      </div>
    </div>
    <div className="sm-chart"><ResponsiveContainer width="100%" height={300}>
      <LineChart data={history} margin={{ top: 12, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={chart.grid} strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} stroke={chart.axis} tickLine={false} axisLine={false} minTickGap={45} tick={{ fontSize: 12 }} dy={12} />
        <YAxis domain={['auto', 'auto']} stroke={chart.axis} tickLine={false} axisLine={false} width={56} tickFormatter={value => format(value, 1)} tick={{ fontSize: 12 }} />
        <Tooltip content={<HistoryTooltip unit={selected.ticker.unit} />} cursor={{ stroke: chart.cursor, strokeDasharray: '4 4' }} />
        <Line type="linear" dataKey="value" name={selected.ticker.label} stroke={chart.series1} strokeWidth={2.5} dot={history.length < 3} activeDot={{ r: 5, fill: chart.series1, stroke: chart.dotRing, strokeWidth: 3 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer></div>
    <div className="sm-panel-footer"><span>{history.length} observations · {history.length ? `${shortDate(history[0].date)} – ${dateLabel(history.at(-1).date)}` : 'No history'}</span>
      <button type="button" className="sm-text-button" aria-expanded={showValues} onClick={() => setShowValues(value => !value)}>{showValues ? 'Hide recent values' : 'View recent values'}</button></div>
    {showValues && <div className="sm-table-scroll"><table><thead><tr><th>Date</th><th className="sm-number">Value ({selected.ticker.unit})</th></tr></thead><tbody>{history.slice(-7).reverse().map(row => <tr key={row.date}><td>{row.date}</td><td className="sm-number">{format(row.value)}</td></tr>)}</tbody></table></div>}
  </section>;
}

function SalesPanel({ sales }) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const filtered = sales.filter(s => fuelName(s.ticker.label).toLowerCase().includes(search.toLowerCase()));
  const visible = showAll || search ? filtered : filtered.slice(0, 6);
  const largest = Math.max(0, ...sales.map(s => s.ticker.value));
  const months = [...new Set(sales.map(s => s.ticker.observedDate.slice(0, 7)))];
  const units = [...new Set(sales.map(s => salesUnit(s.ticker.unit)))];
  return <section className="sm-panel sm-sales" aria-label="Monthly bunker sales">
    <div className="sm-panel-heading sm-sales-heading"><div><h2>Singapore bunker sales</h2>
      <p>{months.length === 1 ? `${monthLabel(`${months[0]}-01`)} · monthly, as published` : 'Monthly, as published'}</p></div>
      <div className="sm-search"><label htmlFor="market-fuel-search">Find a fuel category</label>
        <input id="market-fuel-search" type="search" placeholder="e.g. Marine Gas Oil" value={search} onChange={event => setSearch(event.target.value)} /></div>
    </div>
    <div className="sm-table-scroll"><table><thead><tr><th>Fuel category</th><th className="sm-number">{units.length === 1 ? `Sales · ${units[0]}` : 'Sales'}</th></tr></thead><tbody>{visible.map(({ ticker }) => {
      const name = fuelName(ticker.label), mgo = isMgo(name);
      return <tr key={ticker.seriesKey} className={mgo ? 'sm-mgo-row' : undefined}>
        <td><span className="sm-fuel-name">{name}{mgo && <span className="sm-fuel-tag">MGO</span>}</span>
          {months.length > 1 && <small className="sm-table-date">{monthLabel(ticker.observedDate)}</small>}
          <span className="sm-volume-bar"><span style={{ width: `${largest > 0 ? ticker.value / largest * 100 : 0}%` }} /></span></td>
        <td className="sm-number"><strong>{twoPlaces(ticker.value)}</strong>{units.length > 1 && <small>{salesUnit(ticker.unit)}</small>}</td>
      </tr>;
    })}</tbody></table></div>
    {search && !visible.length && <p className="sm-table-empty">No fuel categories match “{search}”.</p>}
    <div className="sm-panel-footer">
      {!search && sales.length > 6 ? <button type="button" className="sm-text-button" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show fewer categories' : `View all ${sales.length} categories`}</button> : <span />}
      <span>Dates identify the represented month, not the release date. Categories aren’t summed.</span>
    </div>
  </section>;
}

function NewsPanel({ news, today }) {
  const count = news.find(s => s.ticker.seriesKey === 'GDELT_ARTICLE_COUNT')?.ticker;
  const tone = news.find(s => s.ticker.seriesKey === 'GDELT_AVERAGE_TONE')?.ticker;
  const latest = news.map(s => s.ticker.observedDate).sort().at(-1);
  const toneWord = !tone ? '' : tone.value < 0 ? 'Negative' : tone.value > 0 ? 'Positive' : 'Neutral';
  const place = tone ? (Math.max(-TONE_LIMIT, Math.min(TONE_LIMIT, tone.value)) + TONE_LIMIT) / (TONE_LIMIT * 2) * 100 : 50;
  return <section className="sm-panel sm-news" aria-label="GDELT daily aggregates">
    <div className="sm-panel-heading"><div><h2>Market pulse</h2><p>Oil and shipping news · {dateLabel(latest)} · GDELT</p></div><AgeBadge date={latest} today={today} /></div>
    <div className="sm-news-metrics">
      {count && <div><span>Matched articles</span><strong><Price ticker={count} compact /></strong></div>}
      {tone && <div><span>Average tone</span><strong title={format(tone.value)}>{withMinus(twoPlaces(tone.value))}</strong><small>{toneWord}</small></div>}
    </div>
    {tone && <div className="sm-tone">
      <div className="sm-tone-track" role="img" aria-label={`Average tone ${twoPlaces(tone.value)}, ${toneWord.toLowerCase()}, on a scale from −${TONE_LIMIT} to +${TONE_LIMIT}`}><i /><span style={{ left: `${place}%` }} /></div>
      <div className="sm-tone-labels" aria-hidden="true"><span>Negative</span><span>Neutral</span><span>Positive</span></div>
    </div>}
    <p className="sm-news-note">Context, not a price signal. Tone measures news language, not price direction. Current-day article counts may be partial.</p>
  </section>;
}

export default function StoredMarketPanel({ forecast = null, today = singaporeToday() }) {
  const { data, status, refreshing, error, refresh } = useDatabaseMarket('/api/v1/market/stored', valid, 'market data');
  const [selectedKey, setSelectedKey] = useState('SGP_MGO_OBSERVED');
  const [range, setRange] = useState(60);
  const series = data?.series || [];
  const prices = series.filter(s => s.category === 'prices').sort((a, b) => orderOf(a.ticker.seriesKey) - orderOf(b.ticker.seriesKey));
  const sales = series.filter(s => s.category === 'sales').sort((a, b) => b.ticker.value - a.ticker.value || a.ticker.label.localeCompare(b.ticker.label));
  const news = series.filter(s => s.category === 'news');
  // This menu is for documented price/index histories, not monthly sales or news.
  const chartSeries = prices.filter(s => order.includes(s.ticker.seriesKey)
    && new Set(s.history.filter(row => Number.isFinite(row.value)
      && /^\d{4}-\d{2}-\d{2}$/.test(row.date)
      && Number.isFinite(Date.parse(`${row.date}T00:00:00Z`))).map(row => row.date)).size >= 2);
  const selected = chartSeries.find(s => s.ticker.seriesKey === selectedKey) || chartSeries[0];
  // Calendar-day windows include the latest observation day; missing days stay missing.
  const endDate = selected ? Date.parse(`${selected.ticker.observedDate}T00:00:00Z`) : NaN;
  const startDate = endDate - (range - 1) * 86400000;
  const history = (selected?.history || []).filter(row => {
    const date = Date.parse(`${row.date}T00:00:00Z`);
    return date >= startDate && date <= endDate;
  }).sort((a, b) => a.date.localeCompare(b.date));
  const checked = data ? new Date(data.fetchedAt).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' }) : null;
  const unverified = prices.filter(s => s.ticker.unit === 'source-defined').map(s => s.ticker.label);

  return <main className="stored-market" aria-label="Stored market dashboard">
    <header className="sm-header">
      <div><h1>Market overview</h1>
        <p>{checked ? `Last refreshed ${checked}` : 'Connecting to market data'} · Observed prices, not a live feed</p></div>
      <button className="bb-button bb-button--secondary sm-refresh" type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh market data" aria-busy={refreshing}>
        <Symbol name="refresh" className={refreshing ? 'sm-spinning' : ''} />{refreshing ? 'Checking…' : 'Refresh market data'}
      </button>
    </header>

    {status === 'loading' && <div className="sm-message" role="status">Loading stored market data…</div>}
    {error && <div className="sm-message sm-warning" role="alert">{error}{data ? ' Showing previously loaded records.' : ''}</div>}
    {data?.missing.length > 0 && <details className="sm-message sm-missing"><summary>{data.missing.length} series awaiting data <span>View coverage</span></summary>
      <p><strong>Not yet stored:</strong> {data.missing.join(', ')}. No example prices are substituted.</p></details>}
    {data && !series.length && <div className="sm-message sm-empty"><Symbol name="layers" /><h2>No imported market observations are available.</h2><p>Your market overview will appear after the first data import.</p></div>}

    {prices.length > 0 && <div className="sm-prices-block">
      <section aria-label="Stored prices and index" className="sm-prices">
        {prices.map(({ ticker }, index) => <PriceCard key={ticker.seriesKey} ticker={ticker} featured={index === 0} today={today} />)}
      </section>
      {unverified.length > 0 && <p className="sm-unit-note">{unverified.join(' and ')}: Physical unit and contract definition are not verified. No price conversion is applied.</p>}
    </div>}

    {forecast}

    {selected && <HistoryPanel chartSeries={chartSeries} selected={selected} history={history} range={range} setRange={setRange} setSelectedKey={setSelectedKey} />}

    {(sales.length > 0 || news.length > 0) && <div className="sm-lower-grid">
      {sales.length > 0 && <SalesPanel sales={sales} />}
      {news.length > 0 && <NewsPanel news={news} today={today} />}
    </div>}
    {data && <footer className="sm-footer"><span>{series.length} series stored · Re-reads every minute. Observation dates may differ from today.</span><span>Refreshing reads stored data; it does not run an import.</span></footer>}
  </main>;
}
