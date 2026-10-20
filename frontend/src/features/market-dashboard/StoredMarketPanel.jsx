import React, { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDatabaseMarket } from './useBrentMarket';
import './stored-market.css';

function valid(data) {
  return data.storage === 'supabase' && Array.isArray(data.missing) && Array.isArray(data.series)
    && data.series.every(series => typeof series.ticker?.value === 'number' && Number.isFinite(series.ticker.value)
      && /^\d{4}-\d{2}-\d{2}$/.test(series.ticker.observedDate) && Array.isArray(series.history));
}
const format = (value, digits = 4) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
const dateLabel = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
const fuelName = label => label.replace(/^Bunker sales:\s*/i, '').toLowerCase()
  .replace(/\b\w/g, char => char.toUpperCase()).replace(/\b(Lng|Mgo|Mdo|B100)\b/g, word => word.toUpperCase());
const order = ['SGP_MGO_OBSERVED', 'SGP_GASOIL_FUT', 'BRENT_CRUDE', 'DUBAI_CRUDE', 'USD_INDEX'];

function Symbol({ name, ...props }) {
  const shapes = {
    refresh: <><path d="M3 11a9 9 0 0 1 15.4-6.4L21 7M21 3v4h-4" /><path d="M21 13a9 9 0 0 1-15.4 6.4L3 17M7 17H3v4" /></>,
    chart: <><path d="M4 4v16h16M7 14l4-4 4 2 5-7" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a20 20 0 0 0 0 18 20 20 0 0 0 0-18" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{shapes[name]}</svg>;
}

function Price({ ticker, compact = false }) {
  const digits = ticker.unit === 'index' || ticker.unit === 'tone' ? 4 : 2;
  const value = new Intl.NumberFormat('en-US', { maximumFractionDigits: digits,
    minimumFractionDigits: ticker.currency === 'USD' || ticker.unit === 'source-defined' ? 2 : 0 }).format(ticker.value);
  return <>{ticker.currency === 'USD' ? '$' : ''}{value}{!compact && <span className="sm-unit">{ticker.unit === 'source-defined' ? 'Unit pending' : ticker.unit || 'Unit unspecified'}</span>}</>;
}

function Change({ ticker }) {
  if (ticker.changeAbs == null) return <span className="sm-change sm-neutral">No previous observation</span>;
  const direction = ticker.changeAbs > 0 ? 'up' : ticker.changeAbs < 0 ? 'down' : 'neutral';
  return <span className={`sm-change sm-${direction}`} title="Change versus the previous stored observation">
    <span aria-hidden="true">{direction === 'up' ? '↗' : direction === 'down' ? '↘' : '—'}</span>
    {ticker.changePct != null ? `${ticker.changePct > 0 ? '+' : ''}${format(ticker.changePct, 2)}%` : `${ticker.changeAbs > 0 ? '+' : ''}${format(ticker.changeAbs)}`}
    <span className="sm-change-context">vs previous</span>
  </span>;
}

function HistoryTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return <div className="sm-tooltip"><span>{dateLabel(label)}</span><strong>{format(payload[0].value)} <small>{unit}</small></strong></div>;
}

export default function StoredMarketPanel() {
  const { data, status, refreshing, error, refresh } = useDatabaseMarket('/api/v1/market/stored', valid, 'market data');
  const [selectedKey, setSelectedKey] = useState('BRENT_CRUDE');
  const [range, setRange] = useState(60);
  const [search, setSearch] = useState('');
  const [showAllSales, setShowAllSales] = useState(false);
  const series = data?.series || [];
  const prices = series.filter(s => s.category === 'prices').sort((a, b) => order.indexOf(a.ticker.seriesKey) - order.indexOf(b.ticker.seriesKey));
  const sales = series.filter(s => s.category === 'sales').sort((a, b) => b.ticker.value - a.ticker.value || a.ticker.label.localeCompare(b.ticker.label));
  const news = series.filter(s => s.category === 'news');
  const selected = series.find(s => s.ticker.seriesKey === selectedKey) || prices[0] || series[0];
  // Calendar-day windows include the latest observation day; missing days stay missing.
  const endDate = selected ? Date.parse(`${selected.ticker.observedDate}T00:00:00Z`) : NaN;
  const startDate = endDate - (range - 1) * 86400000;
  const history = (selected?.history || []).filter(row => {
    const date = Date.parse(`${row.date}T00:00:00Z`);
    return date >= startDate && date <= endDate;
  }).sort((a, b) => a.date.localeCompare(b.date));
  const filteredSales = sales.filter(s => fuelName(s.ticker.label).toLowerCase().includes(search.toLowerCase()));
  const visibleSales = showAllSales || search ? filteredSales : filteredSales.slice(0, 6);
  const salesMax = Math.max(0, ...sales.map(s => s.ticker.value));
  const checked = data ? new Date(data.fetchedAt).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }) : null;

  return <main className="stored-market" aria-label="Stored market dashboard">
    <header className="sm-header">
      <div><div className="sm-eyebrow"><span /> MARKET INTELLIGENCE</div><h1>Market overview<span>.</span></h1>
        <p>Your Singapore bunker market, in perspective.</p></div>
      <div className="sm-header-actions">
        <button className="sm-refresh" type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh market data" aria-busy={refreshing}>
          <Symbol name="refresh" className={refreshing ? 'sm-spinning' : ''} />{refreshing ? 'Checking…' : 'Refresh market data'}
        </button>
      </div>
    </header>

    <div className="sm-statusbar">
      <span><Symbol name="layers" /><strong>{series.length}</strong> available series</span>
      <span>Observed prices · source units preserved</span>
      <span className="sm-last-check">{checked ? `Last checked ${checked}` : 'Connecting to market data'}<span className="sm-status-divider" />Auto-refresh · 1 min</span>
    </div>
    {status === 'loading' && <div className="sm-message" role="status">Loading stored market data…</div>}
    {error && <div className="sm-message sm-warning" role="alert">{error}{data ? ' Showing previously loaded records.' : ''}</div>}
    {data?.missing.length > 0 && <details className="sm-missing"><summary>{data.missing.length} series awaiting data <span>View coverage</span></summary>
      <p><strong>Not yet stored:</strong> {data.missing.join(', ')}. No example prices are substituted.</p></details>}
    {data && !series.length && <div className="sm-empty"><Symbol name="layers" /><h2>No imported market observations are available.</h2><p>Your market overview will appear after the first data import.</p></div>}

    {prices.length > 0 && <section aria-label="Stored prices and index" className="sm-prices">
      {prices.map(({ ticker }, index) => <article className={`sm-price-card ${index === 0 ? 'sm-featured' : ''}`} key={ticker.seriesKey}>
        <div className="sm-card-top"><span className="sm-card-symbol">{ticker.seriesKey === 'USD_INDEX' ? 'FX' : ticker.label.includes('MGO') ? 'MGO' : ticker.label.includes('gasoil') ? 'GO' : ticker.label.includes('Dubai') ? 'DXB' : 'BRN'}</span><span className="sm-observed">OBSERVED</span></div>
        <h2>{ticker.label}</h2><div className="sm-price"><Price ticker={ticker} compact /></div>
        <div className="sm-price-unit">{ticker.unit === 'source-defined' ? 'Unit pending verification' : ticker.unit || 'Unit unspecified'}</div>
        <Change ticker={ticker} />
        <div className="sm-card-footer"><time dateTime={ticker.observedDate}>{dateLabel(ticker.observedDate)}</time><span title={ticker.source}>{ticker.source}</span></div>
        {ticker.unit === 'source-defined' && <p className="sm-unit-note">Physical unit and contract definition are not verified. No price conversion is applied.</p>}
      </article>)}
    </section>}

    {selected && <section className="sm-panel sm-history" aria-label="Stored observation history">
      <div className="sm-panel-heading"><div><div className="sm-section-kicker">THE BIGGER PICTURE</div><h2>Market history</h2></div>
        <div className="sm-history-controls"><label className="sm-sr-only" htmlFor="market-history-series">Choose a series</label>
          <select id="market-history-series" value={selected.ticker.seriesKey} onChange={event => setSelectedKey(event.target.value)}>{series.map(s => <option key={s.ticker.seriesKey} value={s.ticker.seriesKey}>{s.ticker.label}</option>)}</select>
          <div className="sm-range" role="group" aria-label="History length">{[15, 30, 60].map(value => <button type="button" key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{value} days</button>)}</div>
        </div>
      </div>
      <div className="sm-history-summary"><span className="sm-history-price"><Price ticker={selected.ticker} /></span><Change ticker={selected.ticker} />
        <span className="sm-history-date">{range} days ending {dateLabel(selected.ticker.observedDate)}</span></div>
      <div className="sm-chart"><ResponsiveContainer width="100%" height={300}>
        <LineChart data={history} margin={{ top: 20, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="#203044" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} stroke="#7c91a8" tickLine={false} axisLine={false} minTickGap={45} tick={{ fontSize: 11 }} dy={12} />
          <YAxis domain={['auto', 'auto']} stroke="#7c91a8" tickLine={false} axisLine={false} width={64} tickFormatter={value => format(value, 1)} tick={{ fontSize: 11 }} />
          <Tooltip content={<HistoryTooltip unit={selected.ticker.unit} />} cursor={{ stroke: '#3f5b70', strokeDasharray: '4 4' }} />
          <Line type="linear" dataKey="value" name={selected.ticker.label} stroke="#39d4bd" strokeWidth={2.5} dot={history.length < 3} activeDot={{ r: 5, fill: '#39d4bd', stroke: '#0d1c2b', strokeWidth: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer></div>
      <div className="sm-chart-footer"><span><i /> Actual stored observations</span><span>{history.length} observations · {history.length ? `${shortDate(history[0].date)} – ${shortDate(history.at(-1).date)}` : 'No history'}</span></div>
      <details className="sm-history-table"><summary>View recent values <Symbol name="arrow" /></summary><div className="sm-table-scroll"><table><thead><tr><th>Date</th><th>Value ({selected.ticker.unit})</th></tr></thead><tbody>{history.slice(-7).reverse().map(row => <tr key={row.date}><td>{row.date}</td><td>{format(row.value)}</td></tr>)}</tbody></table></div></details>
    </section>}

    {(sales.length > 0 || news.length > 0) && <div className="sm-lower-grid">
      {sales.length > 0 && <section className="sm-panel sm-sales" aria-label="Monthly bunker sales">
        <div className="sm-panel-heading"><div><div className="sm-section-kicker">PHYSICAL MARKET</div><h2>Singapore bunker sales</h2></div><span className="sm-period">Monthly</span></div>
        <div className="sm-sales-toolbar"><p>{sales.length} fuel categories <span>· Latest stored month</span></p><label className="sm-search"><Symbol name="search" /><input aria-label="Filter fuel categories" placeholder="Find a fuel category" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
        <div className="sm-table-scroll"><table><thead><tr><th>Fuel category</th><th>Observation month</th><th className="sm-number">Sales</th></tr></thead><tbody>{visibleSales.map(({ ticker }) => <tr key={ticker.seriesKey}>
          <td><span className="sm-fuel-name">{fuelName(ticker.label)}</span><span className="sm-volume-bar"><span style={{ width: `${salesMax > 0 ? ticker.value / salesMax * 100 : 0}%` }} /></span></td>
          <td className="sm-table-date">{new Date(`${ticker.observedDate}T00:00:00`).toLocaleDateString('en-SG', { month: 'short', year: 'numeric' })}</td>
          <td className="sm-number"><strong>{format(ticker.value)}</strong><small>{ticker.unit}</small></td>
        </tr>)}</tbody></table></div>
        {search && !visibleSales.length && <p className="sm-table-empty">No fuel categories match “{search}”.</p>}
        {!search && sales.length > 6 && <button className="sm-show-all" type="button" onClick={() => setShowAllSales(value => !value)}>{showAllSales ? 'Show fewer categories' : `View all ${sales.length} categories`} <span aria-hidden="true">{showAllSales ? '−' : '+'}</span></button>}
        <p className="sm-footnote">Dates identify the represented month, not the release date. Published units are preserved; categories are not summed.</p>
      </section>}

      {news.length > 0 && <section className="sm-panel sm-news" aria-label="GDELT daily aggregates">
        <div className="sm-panel-heading"><div><div className="sm-section-kicker">NEWS CONTEXT</div><h2>Market pulse</h2></div><span className="sm-globe"><Symbol name="globe" /></span></div>
        <p className="sm-news-intro">Oil and shipping coverage, in numbers.</p>
        {news.map(({ ticker }) => <div className="sm-news-metric" key={ticker.seriesKey}><span>{ticker.seriesKey === 'GDELT_ARTICLE_COUNT' ? 'Matched articles' : 'Average news tone'}</span>
          <strong><Price ticker={ticker} compact /></strong><small>{ticker.unit} · {dateLabel(ticker.observedDate)}</small></div>)}
        <div className="sm-news-context"><span className="sm-context-dot" /> Context, not a price signal<p>Tone measures news language, not oil-price direction. Current-day article counts may be partial.</p></div>
        <div className="sm-news-source">Source: GDELT <Symbol name="globe" /></div>
      </section>}
    </div>}
    {data && <footer className="sm-footer"><span><span className="sm-footer-dot" /> Observation dates may differ from today. This is not a real-time price feed.</span><span>Refreshing reads stored data; it does not run an import.</span></footer>}
  </main>;
}
