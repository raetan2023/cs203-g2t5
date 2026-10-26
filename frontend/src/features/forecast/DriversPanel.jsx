import React from 'react';
import { driverLabel } from './utils';

// Shows which market signals pushed the forecast up or down, biggest first.
// Each driver: { feature, contribution }. Sign of contribution = direction.
// Renders nothing if the API didn't return drivers (so it's safe before
// Anjali adds top_drivers to PredictResponse).
export default function DriversPanel({ drivers }) {
  const list = Array.isArray(drivers) ? drivers : [];
  if (list.length === 0) return null;

  // When the model has no edge, every contribution is ~0. Show an honest note
  // instead of a row of empty bars.
  const totalWeight = list.reduce((s, d) => s + Math.abs(d.contribution || 0), 0);
  if (totalWeight < 1e-9) {
    return (
      <div className="forecast-drivers">
        <div className="forecast-drivers-title">What is moving the forecast</div>
        <p className="forecast-drivers-note">
          No single market signal is moving the forecast right now (the model shows no edge at this horizon).
        </p>
      </div>
    );
  }

  const sorted = [...list].sort((a, b) => Math.abs(b.contribution || 0) - Math.abs(a.contribution || 0));
  const maxC = Math.abs(sorted[0] && sorted[0].contribution ? sorted[0].contribution : 1) || 1;

  return (
    <div className="forecast-drivers">
      <div className="forecast-drivers-title">What is moving the forecast</div>
      <ul className="forecast-drivers-list">
        {sorted.map((d, i) => {
          const up = (d.contribution || 0) > 0;
          const pct = Math.max(6, Math.round((Math.abs(d.contribution || 0) / maxC) * 100));
          return (
            <li className="forecast-driver" key={d.feature || i}>
              <span className={`forecast-driver-arrow is-${up ? 'up' : 'down'}`}>
                {up ? '▲' : '▼'}
              </span>
              <span className="forecast-driver-name">{driverLabel(d.feature)}</span>
              <span className="forecast-driver-bar-wrap">
                <span
                  className={`forecast-driver-bar is-${up ? 'up' : 'down'}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="forecast-drivers-note">
        Relative pull of each market signal on the model, biggest first. Not a guarantee of direction.
      </p>
    </div>
  );
}
