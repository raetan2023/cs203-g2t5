// Forecast data source for the dashboard widget.
//
// RIGHT NOW: returns mock data so the widget renders on its own.
//
// TO GO LIVE: the data flows frontend -> Spring Boot backend -> FastAPI /predict.
// So this calls a Spring endpoint (e.g. POST /api/v1/forecast) with the Clerk
// Bearer token, exactly like features/purchase-plan/apiService.ts does. That
// Spring endpoint has to exist and proxy to the Python /predict. Until it does,
// keep using the mock.
//
// The response must match the shape in mockService.js (PredictResponse
// plus top_drivers and history). If the backend returns a different shape, map it
// to that here in one place.

import { fetchForecastMock } from './mockService';

// --- Live implementation (uncomment + adapt once the Spring endpoint exists) ---
//
// export function createForecastService({ baseUrl, getToken, apiKey } = {}) {
//   async function fetchForecast(horizonDays = 7) {
//     const token = getToken ? getToken() : null;
//     const headers = { 'Content-Type': 'application/json' };
//     if (token) headers.Authorization = `Bearer ${token}`;
//     if (apiKey) headers['X-API-Key'] = apiKey;
//
//     const res = await fetch(`${baseUrl}/api/v1/forecast`, {
//       method: 'POST',
//       headers,
//       body: JSON.stringify({ horizon_days: horizonDays }),
//     });
//     if (!res.ok) throw new Error(`FORECAST_${res.status}`);
//     return res.json(); // must already match the mock shape, or map it here
//   }
//   return { fetchForecast };
// }

export function fetchForecast(horizonDays = 7) {
  return fetchForecastMock(horizonDays);
}
