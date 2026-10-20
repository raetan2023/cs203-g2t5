import { useCallback, useEffect, useRef, useState } from 'react';

const env = import.meta.env ?? {};
const API_BASE = (env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');

export function useDatabaseMarket(endpoint, validate, name) {
  const [state, setState] = useState({ data: null, status: 'loading', refreshing: false, error: null });
  const active = useRef(true);
  const request = useRef(null);

  const refresh = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setState(previous => ({ ...previous, refreshing: true, error: null }));
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        cache: 'no-store', signal: controller.signal,
        headers: { ...(env.VITE_API_KEY && { 'X-API-Key': env.VITE_API_KEY }) },
      });
      if (!response.ok) throw new Error(`Could not read ${name} from the database. Check the backend connection.`);
      const data = response.status === 204 ? null : await response.json();
      if (data && !validate(data)) {
        throw new Error(`The stored ${name} response was invalid.`);
      }
      if (active.current && request.current === controller) setState({ data, status: data ? 'ready' : 'empty', refreshing: false, error: null });
    } catch (error) {
      if (active.current && request.current === controller) setState(previous => ({ ...previous, status: 'error', refreshing: false,
        error: error.name === 'AbortError' ? 'The database check timed out. Try refreshing.' : error.message }));
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = null;
    }
  }, [endpoint, validate, name]);

  useEffect(() => {
    active.current = true;
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => {
      active.current = false;
      clearInterval(interval);
      const controller = request.current;
      request.current = null;
      controller?.abort();
    };
  }, [refresh]);

  return { ...state, refresh };
}

function validBrent(data) {
  return data.storage === 'supabase' && typeof data.ticker?.value === 'number'
    && Number.isFinite(data.ticker.value) && /^\d{4}-\d{2}-\d{2}$/.test(data.ticker.observedDate)
    && Array.isArray(data.history);
}

export function useBrentMarket() {
  return useDatabaseMarket('/api/v1/market/brent', validBrent, 'Brent');
}
