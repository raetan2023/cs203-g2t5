import React from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { formatShortDate, formatDate, addDays } from './utils';
import { colors } from '../../styles/theme';

// Builds the chart series: observed history up to the anchor, then a forecast
// point at the horizon, with an uncertainty cone (band) fanning out from the
// anchor (zero width) to the horizon (low..high).
export function buildSeries(data) {
  const { history = [], as_of_date, anchor_price, forecast, low, high, horizon_days = 7 } = data;
  const anchorDate = data.anchor_quote_date || as_of_date;

  // History is optional. Keep only observations before the actual quote anchor.
  const hist = Array.isArray(history) ? history : [];
  const pts = hist
    .filter((h) => h && h.date && h.date < anchorDate)
    .map((h) => ({ date: h.date, observed: h.price, forecast: null, band: null }));

  // Start the forecast at the observed quote date, even when the quote is old.
  pts.push({
    date: anchorDate,
    observed: anchor_price,
    forecast: anchor_price,
    band: [anchor_price, anchor_price],
  });

  // Forecast endpoint at the horizon.
  pts.push({
    date: data.target_date || addDays(data.anchor_quote_date || as_of_date, horizon_days),
    observed: null,
    forecast,
    band: [low, high],
  });

  return pts;
}

function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = (payload[0] && payload[0].payload) || {};
  const band = Array.isArray(row.band) ? row.band : null;
  const value = row.forecast != null && row.observed == null ? row.forecast : row.observed;
  const kind = row.observed != null ? 'Observed' : 'Forecast';
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.borderSubtle}`, borderRadius: 8, color: colors.text, fontSize: 12, padding: '8px 10px' }}>
      <div style={{ color: colors.textTertiary, marginBottom: 4 }}>{formatDate(label)}</div>
      {value != null && (
        <div style={{ fontWeight: 600 }}>
          {kind}: ${Math.round(value).toLocaleString()} USD/MT
        </div>
      )}
      {band && band[0] !== band[1] && (
        <div style={{ color: colors.textSecondary, marginTop: 2 }}>
          Range: ${Math.round(band[0]).toLocaleString()} to ${Math.round(band[1]).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function AsOfLabel({ viewBox }) {
  const { x, y } = viewBox;
  const w = 52;
  const h = 18;
  return (
    <g transform={`translate(${x - w / 2}, ${y - 2})`}>
      <rect width={w} height={h} rx={4} fill={colors.surface} stroke={colors.action} strokeWidth={1} />
      <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fill={colors.action} fontSize="12" fontWeight="500" fontFamily="inherit">
        As of
      </text>
    </g>
  );
}

export default function ForecastChart({ data }) {
  const series = buildSeries(data);

  return (
    <div style={{ width: '100%', height: 280, marginTop: 14 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 22, right: 28, left: 10, bottom: 5 }}>
          <CartesianGrid stroke={colors.borderSubtle} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            tick={{ fontSize: 12, fill: colors.textTertiary }}
            stroke={colors.borderSubtle}
          />
          <YAxis
            tickFormatter={(v) => `$${v}`}
            tick={{ fontSize: 12, fill: colors.textTertiary }}
            stroke={colors.borderSubtle}
            domain={['dataMin - 20', 'dataMax + 20']}
            allowDecimals={false}
          />
          <Tooltip content={<ForecastTooltip />} />

          {/* Uncertainty cone (anchor -> horizon) */}
          <Area
            type="linear"
            dataKey="band"
            stroke="none"
            fill={colors.action}
            fillOpacity={0.16}
            connectNulls
            isAnimationActive={false}
          />
          {/* Observed history */}
          <Line
            type="monotone"
            dataKey="observed"
            stroke={colors.text}
            strokeWidth={2.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          {/* Forecast segment */}
          <Line
            type="linear"
            dataKey="forecast"
            stroke={colors.action}
            strokeWidth={2.5}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />

          <ReferenceLine x={data.as_of_date} stroke={colors.action} strokeDasharray="4 4" strokeWidth={1.2} strokeOpacity={0.7} label={<AsOfLabel />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
