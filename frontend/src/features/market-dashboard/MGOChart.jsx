import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';

function formatChartDate(dStr) {
  if (!dStr) return '';
  try {
    const d = new Date(dStr + (dStr.length === 10 ? 'T00:00:00' : ''));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  } catch (e) {}
  return dStr;
}

function formatBadgeDate(dStr) {
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
 * Custom Label for Scenario Date Reference Line matching the UI mockup
 */
const ScenarioDateLabel = ({ viewBox, text }) => {
  const { x, y } = viewBox;
  const width = 88;
  const height = 24;
  return (
    <g transform={`translate(${x - width / 2}, ${y - 12})`}>
      <rect
        width={width}
        height={height}
        rx={4}
        fill="#071926"
        stroke="#00d4c8"
        strokeWidth={1}
      />
      <text
        x={width / 2}
        y={height / 2 + 4}
        textAnchor="middle"
        fill="#00d4c8"
        fontSize="11"
        fontWeight="600"
        fontFamily="sans-serif"
      >
        {text}
      </text>
    </g>
  );
};

export default function MGOChart({ chartSeries, scenarioDate }) {
  // Group points by date
  const byDate = {};
  chartSeries.forEach(({ date, value, seriesKey }) => {
    if (!byDate[date]) byDate[date] = { date };
    byDate[date][seriesKey] = Number(value);
  });
  const data = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

  const formattedScenarioDate = formatBadgeDate(scenarioDate);

  // Custom Dot component that highlights the scenario date point in teal
  const renderCustomDot = (props) => {
    const { cx, cy, payload } = props;
    if (payload.date === scenarioDate) {
      return (
        <g key={`dot-${payload.date}`}>
          <circle cx={cx} cy={cy} r={6} fill="#060b13" stroke="#00d4c8" strokeWidth={2.5} />
          <circle cx={cx} cy={cy} r={3} fill="#00d4c8" />
        </g>
      );
    }
    return null;
  };

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h2 className="chart-title">Singapore MGO - history & forecast</h2>
          <p className="chart-subtitle">
            Transition from observed transaction evidence to derived proxy forecasts
          </p>
          <div className="chart-legend-row">
            <span className="legend-item">
              <span className="legend-bar legend-bar--observed" /> Observed MGO
            </span>
            <span className="legend-item">
              <span className="legend-bar legend-bar--futures" /> Gasoil Futures
            </span>
            <span className="legend-item">
              <span className="legend-bar legend-bar--derived" /> Derived MGO Estimate
            </span>
          </div>
        </div>
        <div className="badge badge--experimental">
          • Experimental proxy estimate
        </div>
      </div>

      <div style={{ width: '100%', height: 280, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 25, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid stroke="#152234" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatChartDate}
              tick={{ fontSize: 11, fill: '#7e8f9f' }}
              stroke="#1c2d44"
            />
            <YAxis
              domain={[580, 660]}
              ticks={[580, 600, 620, 640, 660]}
              tickFormatter={v => `$${v}`}
              tick={{ fontSize: 11, fill: '#7e8f9f' }}
              stroke="#1c2d44"
            />
            <Tooltip
              contentStyle={{
                background: '#0c1524',
                border: '1px solid #1c2d46',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px'
              }}
              formatter={v => [`$${Number(v).toFixed(2)} USD/MT`, 'Derived MGO']}
              labelFormatter={label => `Date: ${formatBadgeDate(label)}`}
            />
            <ReferenceLine
              x={scenarioDate}
              stroke="#00d4c8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={<ScenarioDateLabel text={formattedScenarioDate} />}
            />
            <Line
              type="monotone"
              dataKey="SGP_MGO_DERIVED"
              stroke="#ffffff"
              strokeWidth={2.5}
              dot={renderCustomDot}
              activeDot={{ r: 5, fill: '#00d4c8' }}
              name="Singapore MGO"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
