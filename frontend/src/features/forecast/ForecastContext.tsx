import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Forecast, ForecastService, Horizon } from './apiService';

type Result = { status: 'success'; data: Forecast } | { status: 'error'; error: string };
type ForecastState = { refreshKey?: number; service?: ForecastService; connected: boolean; horizon: Horizon; setHorizon(h: Horizon): void; retry(): void; status: 'loading' | 'success' | 'error'; data?: Forecast; error?: string };
const missing: ForecastState = { connected: false, horizon: 7, setHorizon() {}, retry() {}, status: 'success', data: { status: 'unavailable', reason: 'not_connected', message: 'The forecast service is not connected.' } };
const Context = createContext<ForecastState>(missing);

/** One shared active result per horizon for both screens, scoped to session and application date. */
export function ForecastProvider({ service, scenarioDate, revision, children }: { service?: ForecastService; scenarioDate: string; revision?: number; children: ReactNode }) {
  const [horizon, setHorizon] = useState<Horizon>(7);
  const [attempt, setAttempt] = useState(0);
  const scope = useMemo(() => ({}), [service, scenarioDate, revision]);
  const cache = useRef<{ scope: object; entries: Map<Horizon, Promise<Result>>; runId?: string }>({ scope, entries: new Map() });
  const [result, setResult] = useState<{ scope: object; horizon: Horizon; attempt: number; value: Result }>();
  // The comparison shares in-flight horizon reads with the selected estimate.
  const comparisonService = useMemo<ForecastService | undefined>(() => service ? { async read(h) {
    if (cache.current.scope !== scope) cache.current = { scope, entries: new Map() };
    let pending = cache.current.entries.get(h);
    if (!pending) {
      pending = service.read(h).then(data => ({ status: 'success' as const, data }), error => ({ status: 'error' as const, error: error instanceof Error ? error.message : 'Could not load the forecast.' }));
      cache.current.entries.set(h, pending);
    }
    const value = await pending;
    if (value.status === 'error') throw new Error(value.error);
    return value.data;
  } } : undefined, [service, scope]);
  const retry = useCallback(() => {
    cache.current.entries.clear();
    cache.current.runId = undefined;
    setAttempt(a => a + 1);
  }, []);
  useEffect(() => {
    if (!service) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') retry(); }, 60_000);
    const visible = () => { if (document.visibilityState === 'visible') retry(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [service, scope, retry]);
  useEffect(() => {
    if (!service) return;
    if (cache.current.scope !== scope) cache.current = { scope, entries: new Map() };
    let active = true;
    let pending = cache.current.entries.get(horizon);
    if (!pending) {
      pending = service.read(horizon).then(data => ({ status: 'success' as const, data }), error => ({ status: 'error' as const, error: error instanceof Error ? error.message : 'Could not load the forecast.' }));
      cache.current.entries.set(horizon, pending);
    }
    pending.then(value => {
      if (!active) return;
      if (value.status === 'success' && value.data.status === 'ready') {
        const runId = value.data.run_id;
        if (cache.current.runId && cache.current.runId !== runId) {
          // A newly published run invalidates previously visited horizons as a group.
          cache.current.entries.clear();
          cache.current.entries.set(horizon, pending!);
        }
        cache.current.runId = runId;
      }
      if (value.status === 'error' || value.data.status === 'unavailable') {
        // A failure also invalidates other horizons from the previously successful run.
        cache.current.entries.clear();
        cache.current.entries.set(horizon, pending!);
        cache.current.runId = undefined;
      }
      setResult({ scope, horizon, attempt, value });
    });
    return () => { active = false; };
  }, [scope, horizon, attempt, service]);
  const current = result?.scope === scope && result.horizon === horizon && result.attempt === attempt ? result.value : undefined;
  const value: ForecastState = !service ? { ...missing, horizon, setHorizon } : { refreshKey: attempt, service: comparisonService, connected: true, horizon, setHorizon, retry, ...(current ?? { status: 'loading' }) };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useForecastContext() { return useContext(Context); }
