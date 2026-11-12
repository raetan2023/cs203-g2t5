import { useEffect, useRef, useState } from 'react';
import { requestError } from './types';

/**
 * Retain same-team data during refresh; never retain it after failure or a scope change.
 * A change of `view` (such as a filter) reloads but keeps the current figures on screen until the new ones arrive.
 */
export function useManagerRefresh<T>(scope: object, read: () => Promise<T>, pollMs?: number, view = '') {
  const [result, setResult] = useState<{ scope: object; data?: T; loadedAt?: Date; error?: string; loading: boolean }>();
  const [revision, setRevision] = useState(0);
  const reader = useRef(read);
  reader.current = read;
  useEffect(() => {
    let active = true, pending = false;
    const fetch = reader.current;
    async function load() {
      if (pending) return;
      pending = true;
      setResult(previous => previous?.scope === scope
        ? { scope, data: previous.data, loadedAt: previous.loadedAt, loading: true }
        : { scope, loading: true });
      try {
        const data = await fetch();
        if (active) setResult({ scope, data, loadedAt: new Date(), loading: false });
      } catch (failure) {
        if (active) setResult({ scope, error: requestError(failure).detail, loading: false });
      } finally { pending = false; }
    }
    void load();
    const timer = pollMs ? window.setInterval(() => { void load(); }, pollMs) : undefined;
    return () => { active = false; if (timer !== undefined) window.clearInterval(timer); };
  }, [scope, revision, pollMs, view]);
  const current = result?.scope === scope ? result : undefined;
  return { data: current?.data, loadedAt: current?.loadedAt, error: current?.error, loading: current?.loading ?? true,
    refresh: () => setRevision(value => value + 1) };
}
