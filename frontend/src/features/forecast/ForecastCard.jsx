import React from 'react';
import { deriveDirection, formatDate, evidenceMeta } from './utils';

// Top summary band: current (anchor) price, the forecast with direction,
// the expected range, and an honest skill line.
export default function ForecastCard({ data }) {
  if (!data) return null;

  const {
    horizon_days = 7,
    as_of_date,
    anchor_price,
    forecast,
    low,
    high,
    unit = 'USD/metric tonne',
    evidence,
    mae_skill_vs_persistence,
  } = data;

  const dir = deriveDirection(forecast, anchor_price);
  const delta = forecast != null && anchor_price != null ? forecast - anchor_price : null;
  const pct = delta != null && anchor_price ? Math.abs((delta / anchor_price) * 100) : null;
  const ev = evidenceMeta(evidence);

  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '▬';
  const skillPct =
    mae_skill_vs_persistence != null ? Math.round(mae_skill_vs_persistence * 100) : null;

  return (
    <>
      <div className="forecast-summary">
        <div className="forecast-summary-col">
          <div className="forecast-summary-label">Current ({formatDate(as_of_date)})</div>
          <div className="forecast-summary-price">
            ${anchor_price != null ? Math.round(anchor_price).toLocaleString() : '--'}
            <span className="forecast-summary-unit">USD/MT</span>
          </div>
        </div>

        <div className="forecast-summary-arrow">{'→'}</div>

        <div className="forecast-summary-col">
          <div className="forecast-summary-label">In {horizon_days} days</div>
          <div className={`forecast-summary-price forecast-fc is-${dir}`}>
            ${forecast != null ? Math.round(forecast).toLocaleString() : '--'}
            {delta != null && (
              <span className="forecast-delta">
                {dir === 'flat'
                  ? 'no change'
                  : `${arrow} ${Math.round(Math.abs(delta)).toLocaleString()}${
                      pct != null ? ` (${pct.toFixed(1)}%)` : ''
                    }`}
              </span>
            )}
          </div>
          <div className="forecast-range">
            Expected range ${low != null ? Math.round(low).toLocaleString() : '--'} to $
            {high != null ? Math.round(high).toLocaleString() : '--'}
          </div>
        </div>
      </div>

      <div className="forecast-skill">
        {evidence === 'no_edge'
          ? 'No measurable edge over the naive baseline at this horizon, so the model carries the last price forward.'
          : skillPct != null
          ? `Model is about ${skillPct}% more accurate than just carrying today's price forward (naive baseline).`
          : ''}
      </div>
    </>
  );
}
