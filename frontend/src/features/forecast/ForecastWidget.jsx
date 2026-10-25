import React, { useState } from 'react';
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
//   defaultHorizon: 7 | 14 | 30
//   showDrivers: set false to hide the drivers panel if the API has no drivers yet
export default function ForecastWidget({ defaultHorizon = 7, showDrivers = true }) {
  const [horizon, setHorizon] = useState(defaultHorizon);
  const { status, data, error, retry } = useForecast(horizon);

  const HorizonToggle = (
    <div className="forecast-seg" role="tablist" aria-label="Forecast horizon">
      {HORIZONS.map((h) => (
        <button
          key={h}
          type="button"
          className={h === horizon ? 'active' : ''}
          onClick={() => setHorizon(h)}
        >
          {h}d
        </button>
      ))}
    </div>
  );

  const ev = status === 'success' && data ? evidenceMeta(data.evidence) : null;

  return (
    <div className="forecast-card">
      <div className="forecast-header">
        <div>
          <h2 className="forecast-title">MGO price forecast</h2>
          <p className="forecast-subtitle">
            {horizon}-day outlook from the ridge model, with expected range
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
          <p className="forecast-muted">Forecast unavailable right now.</p>
          <button className="forecast-retry" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {status === 'success' && data && (
        <>
          <ForecastCard data={data} />
          <ForecastChart data={data} />
          {showDrivers && <DriversPanel drivers={data.top_drivers} />}
        </>
      )}
    </div>
  );
}
