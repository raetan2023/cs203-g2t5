import React from 'react';
import { useForecast } from './useForecast';
import ForecastCard from './ForecastCard';
import ForecastChart from './ForecastChart';
import DriversPanel from './DriversPanel';
import { evidenceMeta } from './utils';
import './forecast.css';

const HORIZONS = [7, 14, 30];

// Self-contained forecast widget. Drop it on the dashboard with:
//   <ForecastWidget />
// Props (all optional):
// Horizon and published results are shared through ForecastProvider.
//   showDrivers: set false to hide the drivers panel if the API has no drivers yet
export default function ForecastWidget({ showDrivers = true } = {}) {
  const { horizon, setHorizon, status, data: result, error, retry } = useForecast();
  const data = result?.status === 'ready' ? { ...result, as_of_date: result.forecast_origin_date } : null;

  const HorizonToggle = (
    <div className="forecast-seg" role="group" aria-label="Forecast horizon">
      {HORIZONS.map((h) => (
        <button
          key={h}
          type="button"
          aria-pressed={h === horizon}
          className={h === horizon ? 'active' : ''}
          onClick={() => setHorizon(h)}
        >
          {h}d
        </button>
      ))}
    </div>
  );

  const ev = status === 'success' && data?.evidence ? evidenceMeta(data.evidence) : null;

  return (
    <div className="forecast-card">
      <div className="forecast-header">
        <div>
          <h2 className="forecast-title">MGO price forecast</h2>
          <p className="forecast-muted">{data?.synthetic ? <><strong>Synthetic preview</strong> · Illustrative data, not a live forecast.</> : <><strong>Experimental forecast</strong> · Market and news signals; purchasing outcomes are uncertain.</>}</p>
          <p className="forecast-subtitle">
            {horizon}-day outlook with a price range
          </p>
        </div>
        <div className="forecast-header-right">
          {ev && (
            <span className={`forecast-badge is-${ev.tone}`}>
              <span className="forecast-badge-dot" />
              {ev.text}
            </span>
          )}
          {HorizonToggle}
          <button type="button" className="forecast-retry" onClick={retry}>Refresh forecast</button>
        </div>
      </div>

      {status === 'loading' && (
        <div className="forecast-center">
          <div className="forecast-spinner" />
          <p className="forecast-muted">Loading forecast...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="forecast-center">
          <div className="forecast-error-icon">!</div>
          <p className="forecast-muted" role="alert">{error || 'Forecast unavailable right now.'}</p>
          <button className="forecast-retry" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {status === 'success' && result?.status === 'unavailable' && (
        <div className="forecast-center" role="status">
          <p>Forecast unavailable</p><p>{result.message}</p>
          {result.last_successful_run?.origin_date && <p>Last successful forecast: {result.last_successful_run.origin_date}. It is not shown as a current forecast.</p>}
          <button className="forecast-retry" onClick={retry}>Retry forecast</button>
        </div>
      )}

      {status === 'success' && data && (
        <>
          <div className="forecast-provenance">
            <p>Forecast origin: {data.forecast_origin_date} · Published: {data.published_at}</p>
            <p>Latest available GDELT window (UTC, end exclusive): {data.news_window_start} to {data.news_window_end}</p>
            <p>Market observations: {Object.entries(data.source_dates || {}).map(([key, date]) => `${key}: ${date || 'unavailable'}`).join(' · ')}</p>
            <p>Source observations may predate the forecast origin; this is not a live fuel quote.</p>
            <details><summary>Forecast details</summary><p>Run: {data.run_id}</p><p>Model: {data.model_version}</p></details>
          </div>
          <ForecastCard data={data} />
          <ForecastChart data={data} />
          {showDrivers && <DriversPanel drivers={data.top_drivers} />}
        </>
      )}
    </div>
  );
}
