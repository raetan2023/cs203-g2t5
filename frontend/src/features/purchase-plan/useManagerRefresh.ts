import { useEffect, useRef, useState } from 'react';
import { requestError } from './types';

/** Retain same-team data during refresh; never retain it after failure or a scope change. */
export function useManagerRefresh<T>(scope: object, read: () => Promise<T>, pollMs?: number) {
  const [result, setResult] = useState<{ scope: object; data?: T; error?: string; loading: boolean }>();
  const [revision, setRevision] = useState(0);
  const reader = useRef(read);
  reader.current = read;
  useEffect(() => {
    let active = true, pending = false;
    const fetch = reader.current;
    async function load() {
      if (pending) return;
      pending = true;
      setResult(previous => ({ scope, data: previous?.scope === scope ? previous.data : undefined, loading: true }));
      try {
        const data = await fetch();
        if (active) setResult({ scope, data, loading: false });
      } catch (failure) {
        if (active) setResult({ scope, error: requestError(failure).detail, loading: false });
      } finally { pending = false; }
    }
    void load();
    const timer = pollMs ? window.setInterval(() => { void load(); }, pollMs) : undefined;
    return () => { active = false; if (timer !== undefined) window.clearInterval(timer); };
  }, [scope, revision, pollMs]);
  const current = result?.scope === scope ? result : undefined;
  return { data: current?.data, error: current?.error, loading: current?.loading ?? true,
    refresh: () => setRevision(value => value + 1) };
}
