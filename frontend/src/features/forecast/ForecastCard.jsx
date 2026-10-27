import React from 'react';
import { deriveDirection, formatDate, addDays } from './utils';

// Top summary band: current (anchor) price, the forecast with direction,
// the expected range, and an honest skill line.
export default function ForecastCard({ data }) {
  if (!data) return null;

  const {
    horizon_days = 7,
    as_of_date,
    anchor_quote_date,
    target_date,
    interval,
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
  const target = target_date || addDays(anchor_quote_date || as_of_date, horizon_days);

  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '▬';
  const skillPct =
    mae_skill_vs_persistence != null ? Math.round(mae_skill_vs_persistence * 100) : null;

  return (
    <>
      <div className="forecast-summary">
        <div className="forecast-summary-col">
          <div className="forecast-summary-label">Last observed quote ({formatDate(anchor_quote_date || as_of_date)})</div>
          <div className="forecast-summary-price">
            ${anchor_price != null ? Math.round(anchor_price).toLocaleString() : '--'}
            <span className="forecast-summary-unit">USD/MT</span>
          </div>
        </div>

        <div className="forecast-summary-arrow">{'→'}</div>

        <div className="forecast-summary-col">
          <div className="forecast-summary-label">Target {formatDate(target)} · {horizon_days}-day horizon</div>
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
            Price range ${low != null ? Math.round(low).toLocaleString() : '--'} to $
            {high != null ? Math.round(high).toLocaleString() : '--'}
          </div>
        </div>
      </div>

      {interval && (
        <div className="forecast-interval">
          <p>Target coverage: {Math.round(interval.nominal_coverage * 100)}% prediction interval.</p>
          <p>{interval.empirical_coverage != null && interval.evaluation_rows > 0
            ? `Observed coverage: ${(interval.empirical_coverage * 100).toFixed(1)}% across ${interval.evaluation_rows} chronological forecasts.`
            : 'Observed coverage: unavailable. No measured coverage is provided.'}</p>
          {interval.baseline_coverage != null && (
            <p>Persistence baseline coverage: {(interval.baseline_coverage * 100).toFixed(1)}% on the same forecasts.</p>
          )}
          {interval.mean_width != null && interval.baseline_mean_width != null && (
            <p>Mean interval width: ${interval.mean_width.toFixed(2)}/MT; baseline ${interval.baseline_mean_width.toFixed(2)}/MT.</p>
          )}
          {interval.evaluation_rows > 0 && <p>{interval.evaluation_scope}</p>}
          <p>{interval.limitations}</p>
        </div>
      )}

      <div className="forecast-skill">
        {data.synthetic
          ? 'Illustrative point forecast. Accuracy has not been measured.'
          : evidence === 'no_edge'
          ? 'No measurable edge over carrying the last price forward at this horizon.'
          : skillPct != null
          ? `Model is about ${skillPct}% more accurate than just carrying today's price forward (naive baseline).`
          : ''}
      </div>
    </>
  );
}
