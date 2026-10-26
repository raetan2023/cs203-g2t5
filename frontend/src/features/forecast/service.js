// Forecast data source for the dashboard widget.
//
// Calls our Spring backend's GET /api/v1/market/forecast, which proxies the
// ridge /predict model. Same base URL + X-API-Key pattern as useMarketDashboard.
// The response matches the shape in mockService.js (the ridge PredictResponse
// plus top_drivers). It does NOT include price history, so the chart draws the
// anchor-to-horizon cone from the forecast itself.
//
// To develop offline without the backend, swap the import below back to the mock:
//   import { fetchForecastMock } from './mockService';
//   export function fetchForecast(h) { return fetchForecastMock(h); }

const env = import.meta.env ?? {};
const API_BASE = (env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
const API_KEY = env.VITE_API_KEY ?? 'mgo_public_demo_2026';

export async function fetchForecast(horizonDays = 7) {
  const res = await fetch(`${API_BASE}/api/v1/market/forecast?horizon=${horizonDays}`, {
    headers: { ...(API_KEY && { 'X-API-Key': API_KEY }) },
  });
  if (res.status === 503) throw new Error('FORECAST_UNAVAILABLE');
  if (!res.ok) throw new Error(`FORECAST_${res.status}`);
  return res.json();
}
