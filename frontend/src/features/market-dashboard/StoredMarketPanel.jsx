import React, { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDatabaseMarket } from './useBrentMarket';
import './brent-market.css';
import './stored-market.css';

function valid(data) {
  return data.storage === 'supabase' && Array.isArray(data.missing) && Array.isArray(data.series)
    && data.series.every(series => typeof series.ticker?.value === 'number' && Number.isFinite(series.ticker.value)
      && /^\d{4}-\d{2}-\d{2}$/.test(series.ticker.observedDate) && Array.isArray(series.history));
}
const format = (value, digits = 4) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);

function Price({ ticker }) {
  return <>{ticker.currency === 'USD' ? '$' : ''}{format(ticker.value)} <span>{ticker.unit || 'Unit unspecified'}</span></>;
}

export default function StoredMarketPanel() {
  const { data, status, refreshing, error, refresh } = useDatabaseMarket('/api/v1/market/stored', valid, 'market data');
  const [selectedKey, setSelectedKey] = useState('BRENT_CRUDE');
  const series = data?.series || [];
  const selected = series.find(s => s.ticker.seriesKey === selectedKey) || series[0];
  const prices = series.filter(s => s.category === 'prices');
  const sales = series.filter(s => s.category === 'sales');
  const news = series.filter(s => s.category === 'news');
  return <main className="stored-market" aria-label="Stored market dashboard">
    <section className="brent-panel">
      <div className="brent-panel-heading">
        <div><h1>Stored market dashboard</h1>
          <p>Latest available observations in Supabase. Each series has its own date; this is not a real-time price feed.</p></div>
        <button className="bb-button" type="button" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Checking…' : 'Refresh market data'}
        </button>
      </div>
      {status === 'loading' && <p role="status">Loading stored market data…</p>}
      {error && <p role="alert">{error}{data ? ' Showing previously loaded records.' : ''}</p>}
      {data && <>
        <p className="brent-panel-note">Database read at {new Date(data.fetchedAt).toLocaleString()}. Checks every minute while this page is open. Refreshing does not run the provider importer.</p>
        {data.missing.length > 0 && <div className="stored-market-missing">
          <strong>Not yet stored:</strong> {data.missing.join(', ')}. No example prices are substituted.
        </div>}
        {series.length === 0 && <p>No imported market observations are available.</p>}
      </>}
    </section>

    {prices.length > 0 && <section className="stored-market-section" aria-label="Stored prices and index">
      <h2>Prices and index</h2><div className="stored-market-grid">{prices.map(({ ticker }) =>
        <article className="stored-market-card" key={ticker.seriesKey}>
          <h3>{ticker.label}</h3><div className="stored-market-value"><Price ticker={ticker} /></div>
          <p>Observation date: <time dateTime={ticker.observedDate}>{ticker.observedDate}</time></p>
          <p>Source: {ticker.source} · {ticker.valueType}</p>
          {ticker.unit === 'source-defined' && <p className="stored-market-warning">Physical unit and contract definition are not verified. No price conversion is applied.</p>}
          {ticker.changeAbs != null && <p>Change from previous observation: {ticker.changeAbs >= 0 ? '+' : ''}{format(ticker.changeAbs)}
            {ticker.changePct != null && <> ({ticker.changePct >= 0 ? '+' : ''}{format(ticker.changePct)}%)</>}</p>}
        </article>)}</div>
    </section>}

    {sales.length > 0 && <section className="brent-panel" aria-label="Monthly bunker sales">
      <h2>Monthly bunker sales by fuel</h2>
      <p>Units are preserved as published. Dates identify the represented month, not the release date. Categories are not combined into a guessed total.</p>
      <div className="stored-market-table"><table><thead><tr><th>Fuel category</th><th>Month</th><th>Value</th><th>Unit</th></tr></thead>
        <tbody>{sales.map(({ ticker }) => <tr key={ticker.seriesKey}><td>{ticker.label}</td><td>{ticker.observedDate}</td><td>{format(ticker.value)}</td><td>{ticker.unit}</td></tr>)}</tbody></table></div>
    </section>}

    {news.length > 0 && <section className="brent-panel" aria-label="GDELT daily aggregates">
      <h2>GDELT daily aggregates</h2><p>Current-day counts may be partial. Tone measures news language, not predicted oil-price direction.</p>
      {news.map(({ ticker }) => <p key={ticker.seriesKey}><strong>{ticker.label}:</strong> <Price ticker={ticker} /> · {ticker.observedDate}</p>)}
    </section>}

    {selected && <section className="brent-panel" aria-label="Stored observation history">
      <h2>Stored observation history</h2>
      <label htmlFor="market-history-series">Choose a series </label>
      <select id="market-history-series" value={selected.ticker.seriesKey} onChange={event => setSelectedKey(event.target.value)}>
        {series.map(s => <option key={s.ticker.seriesKey} value={s.ticker.seriesKey}>{s.ticker.label}</option>)}
      </select>
      <p>{selected.ticker.unit} · up to 60 actual stored observations · no interpolation or forecast</p>
      <div className="stored-market-chart">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={selected.history}><CartesianGrid stroke="#334155" /><XAxis dataKey="date" stroke="#a8b8cc" />
            <YAxis domain={['auto', 'auto']} stroke="#a8b8cc" /><Tooltip />
            <Line type="linear" dataKey="value" name={selected.ticker.label} stroke="#00d4c8" dot={selected.history.length < 3} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details><summary>Recent values</summary><table><thead><tr><th>Date</th><th>Value</th></tr></thead>
        <tbody>{selected.history.slice(-7).reverse().map(row => <tr key={row.date}><td>{row.date}</td><td>{format(row.value)}</td></tr>)}</tbody>
      </table></details>
    </section>}
  </main>;
}
