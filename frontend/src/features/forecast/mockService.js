// Mock forecast data, shaped like the real /predict response (PredictResponse in
// ridge-regression-model/service/schemas.py), plus two extras the UI needs:
//   - top_drivers: only present if Anjali adds it to PredictResponse (Option A).
//   - history: recent observed MGO prices for the chart. NOT part of PredictResponse;
//     in production this comes from the existing market series the dashboard already loads.
//
// This file is the fixture used for offline/preview rendering and for tests.

function isoDaysFrom(baseIso, offset) {
  // Parse and format in UTC so the date never shifts by a day across timezones.
  const d = new Date(baseIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const AS_OF = '2026-10-05';
const ANCHOR_PRICE = 1297;

// Last 10 observed MGO quotes leading up to the as-of date (ends at the anchor).
const HISTORY_PRICES = [1278, 1285, 1281, 1290, 1288, 1294, 1292, 1299, 1295, ANCHOR_PRICE];

// Per-horizon forecast numbers (mock). 30d intentionally shows the honest
// "no_edge" fallback where the model carries the last price forward.
const BY_HORIZON = {
  7: { forecast: 1275, low: 1230, high: 1320, evidence: 'weak', skill: 0.04 },
  14: { forecast: 1268, low: 1205, high: 1331, evidence: 'weak', skill: 0.03 },
  30: { forecast: ANCHOR_PRICE, low: 1180, high: 1336, evidence: 'no_edge', skill: 0.0 },
};

// Top drivers (Option A). feature name as the model emits it; contribution sign = direction.
const TOP_DRIVERS = [
  { feature: 'hsfo_lag1', contribution: -0.0339 },
  { feature: 'vlsfo_lag1', contribution: -0.0191 },
  { feature: 'brent_fred_lag1', contribution: 0.0176 },
  { feature: 'dubai_crude_investing_lag1', contribution: 0.0173 },
  { feature: 'sg_gasoil_investing_ret20', contribution: -0.0139 },
];

export function buildMockForecast(horizonDays = 7) {
  const h = BY_HORIZON[horizonDays] ? horizonDays : 7;
  const cfg = BY_HORIZON[h];

  const history = HISTORY_PRICES.map((price, i) => ({
    date: isoDaysFrom(AS_OF, -(HISTORY_PRICES.length - 1) + i),
    price,
  }));

  return {
    horizon_days: h,
    as_of_date: AS_OF,
    anchor_quote_date: isoDaysFrom(AS_OF, -1),
    anchor_price: ANCHOR_PRICE,
    quote_age_days: 1,
    forecast: cfg.forecast,
    low: cfg.low,
    high: cfg.high,
    unit: 'USD/metric tonne',
    evidence: cfg.evidence,
    mae_skill_vs_persistence: cfg.skill,
    backtest_rows: 201,
    model_version: 'ridge-mock-2026.10',
    top_drivers: TOP_DRIVERS,
    history,
  };
}

// Mimics an async API call so the loading state is real during development.
export function fetchForecastMock(horizonDays = 7) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(buildMockForecast(horizonDays)), 400);
  });
}
