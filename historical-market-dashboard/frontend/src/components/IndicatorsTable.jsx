import React from 'react';

function formatIndicatorValue(ind) {
  if (ind.unit === '%') {
    return `${ind.value}%`;
  }
  if (ind.unit === 'MT') {
    const num = Number(ind.value);
    return `${(num / 1000000).toFixed(2)}M MT`;
  }
  if (ind.label.toLowerCase().includes('spread')) {
    return `+$${Number(ind.value).toFixed(2)}${ind.unit || '/bbl'}`;
  }
  return `$${Number(ind.value).toFixed(2)}${ind.unit || '/bbl'}`;
}

function formatIndicatorDate(dateStr, label) {
  if (!dateStr) return '';
  if (label && label.toLowerCase().includes('bunker sales')) {
    return 'Sep 2025';
  }
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  } catch (e) {}
  return dateStr;
}

/**
 * IndicatorsTable Component
 * Displays a tabular list of macroeconomic & regional maritime fuel proxies.
 */
export default function IndicatorsTable({ indicators }) {
  return (
    <div className="indicators-card">
      <h3 className="indicators-title">Selected indicators</h3>
      <p className="indicators-subtitle">
        Macroeconomic & regional maritime fuel proxies
      </p>
      <div className="indicators-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Indicator</th>
              <th>Source</th>
              <th>Date</th>
              <th style={{ textAlign: 'right' }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {indicators.map(ind => (
              <tr key={ind.label}>
                <td className="indicator-name">{ind.label}</td>
                <td className="indicator-meta">{ind.source}</td>
                <td className="indicator-meta">{formatIndicatorDate(ind.observedDate, ind.label)}</td>
                <td className="indicator-value">
                  {formatIndicatorValue(ind)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
