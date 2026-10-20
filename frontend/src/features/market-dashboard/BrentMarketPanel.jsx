import React from 'react';
import { useBrentMarket } from './useBrentMarket';
import './brent-market.css';

const number = value => Number(value).toFixed(2);

export default function BrentMarketPanel() {
  const { data, status, refreshing, error, refresh } = useBrentMarket();
  const ticker = data?.ticker;
  return (
    <section className="brent-panel" aria-label="Latest stored Brent prices">
      <div className="brent-panel-heading">
        <div>
          <h2>Latest stored Brent</h2>
          <p>Imported market observations from Supabase. Prices may be older than today.</p>
        </div>
        <button type="button" className="bb-button" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Checking…' : 'Refresh Brent'}
        </button>
      </div>
      {status === 'loading' && <p role="status">Loading stored Brent prices…</p>}
      {status === 'empty' && <p>No observed Brent prices are stored for the configured series.</p>}
      {error && <p role="alert">{error}{data ? ' Showing the last successfully loaded records.' : ''}</p>}
      {ticker && <>
        <div className="brent-panel-price">{ticker.currency === 'USD' ? '$' : ''}{number(ticker.value)} <span>{ticker.unit}</span></div>
        <p><strong>Observation date:</strong> <time dateTime={ticker.observedDate}>{ticker.observedDate}</time></p>
        <p>Source: {ticker.source} · Stored in Supabase · {ticker.valueType}</p>
        {ticker.changeAbs != null && <p>Change from previous stored observation: {ticker.changeAbs >= 0 ? '+' : ''}{number(ticker.changeAbs)}
          {ticker.changePct != null && <> ({ticker.changePct >= 0 ? '+' : ''}{number(ticker.changePct)}%)</>}</p>}
        <details>
          <summary>Recent stored observations</summary>
          <table>
            <thead><tr><th scope="col">Observation date</th><th scope="col">Price ({ticker.unit})</th></tr></thead>
            <tbody>{data.history.slice(-7).reverse().map(row => <tr key={row.date}><td>{row.date}</td><td>{number(row.value)}</td></tr>)}</tbody>
          </table>
        </details>
        <p className="brent-panel-note">Database read at {new Date(data.fetchedAt).toLocaleString()}. Checks every minute while this page is open; this does not fetch new prices from the provider.</p>
      </>}
    </section>
  );
}
