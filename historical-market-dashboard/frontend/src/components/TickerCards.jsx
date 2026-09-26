import React from 'react';

/**
 * Formats a date string like '2025-10-24' into 'Oct 24, 2025' matching the UI mockup.
 */
function formatDate(dStr) {
  if (!dStr) return 'Oct 24, 2025';
  try {
    const d = new Date(dStr + (dStr.length === 10 ? 'T00:00:00' : ''));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  } catch (e) {}
  return dStr;
}

/**
 * TickerCards Component
 * Renders the top 4 market proxy cards:
 * 1. Singapore MGO (derived est.) [ESTIMATED]
 * 2. Singapore Gasoil futures [OBSERVED]
 * 3. Brent crude [OBSERVED]
 * 4. USD index [OBSERVED]
 */
export default function TickerCards({ tickers }) {
  return (
    <div className="ticker-grid">
      {tickers.map(t => {
        const positive = t.changeAbs >= 0;
        const isUsdIndex = t.seriesKey === 'USD_INDEX' || t.label.toLowerCase().includes('usd index');
        const prefix = isUsdIndex ? '' : (t.currency === 'USD' ? '$' : '');

        return (
          <div key={t.seriesKey} className="ticker-card">
            <div className="ticker-header">
              <span className="ticker-label">{t.label}</span>
              <span className={`badge badge--${t.valueType.toLowerCase()}`}>
                {t.valueType}
              </span>
            </div>

            <div className="ticker-value">
              {prefix}{Number(t.value).toFixed(2)}
              {t.unit && <span className="ticker-unit"> {t.unit}</span>}
            </div>

            <div className="ticker-change-row">
              <span className={`ticker-change ${positive ? 'positive' : 'negative'}`}>
                {positive ? '↗ +' : '↘ -'}{prefix}{Math.abs(t.changeAbs).toFixed(2)} ({Math.abs(t.changePct).toFixed(2)}%)
              </span>
              <span className="ticker-date">{formatDate(t.observedDate)}</span>
            </div>

            <div className="ticker-source">
              Source: {t.source}
            </div>
          </div>
        );
      })}
    </div>
  );
}
