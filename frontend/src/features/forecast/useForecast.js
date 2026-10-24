import { useCallback, useEffect, useState } from 'react';
import { fetchForecast } from './service';

// Loads a forecast for the given horizon (7 | 14 | 30).
// Returns { status, data, error, retry } mirroring useMarketDashboard.
// status is one of 'loading' | 'success' | 'error'.
export function useForecast(horizonDays = 7) {
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    let active = true;
    setStatus('loading');
    setError(null);
    fetchForecast(horizonDays)
      .then((result) => {
        if (!active) return;
        setData(result);
        setStatus('success');
      })
      .catch((e) => {
        if (!active) return;
        setError((e && e.message) || 'FORECAST_UNAVAILABLE');
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [horizonDays]);

  useEffect(() => load(), [load]);

  return { status, data, error, retry: load };
}
