import { useEffect, useRef } from 'react';

const day = (now: number) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);

/** Re-fetch the authoritative backend date at Singapore midnight or after waking a tab. */
export function useDateRollover(enabled: boolean, refresh: () => Promise<void>) {
  const callback = useRef(refresh);
  callback.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let acceptedDay = day(Date.now());
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    let pending = false;
    function schedule(retry = false) {
      clearTimeout(timer);
      // Singapore is UTC+08:00, with no daylight-saving transition.
      const remaining = 86_400_000 - ((Date.now() + 8 * 3_600_000) % 86_400_000);
      timer = setTimeout(check, retry ? 30_000 : remaining);
    }
    async function check() {
      if (disposed || pending) return;
      const current = day(Date.now());
      if (current === acceptedDay) { schedule(); return; }
      pending = true;
      try {
        await callback.current();
        if (!disposed) { acceptedDay = current; schedule(); }
      } catch {
        // Caller displays the error; retry without accepting a stale date.
        if (!disposed) schedule(true);
      } finally { pending = false; }
    }
    const visible = () => { if (document.visibilityState === 'visible') void check(); };
    schedule();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled]);
}
