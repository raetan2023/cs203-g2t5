import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppLink } from '../../../app/router';
import { requestError, type BuyerNotificationsResponse, type PurchasePlanService } from '../types';
import { decisionTime } from './PlanDecisionNote';
import { ErrorBanner, PlanButton } from './Primitives';

export function useDecisionFeed(service: PurchasePlanService, enabled = true) {
  const scope = useMemo(() => ({}), [service, enabled]);
  const [result, setResult] = useState<{ scope: object; data?: BuyerNotificationsResponse; error?: string }>();
  const [revision, setRevision] = useState(0), [pending, setPending] = useState<string[]>([]);
  const currentScope = useRef<object | null>(scope); currentScope.current = scope;
  useEffect(() => { currentScope.current = scope; return () => { currentScope.current = null; }; }, [scope]);
  const marking = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled || !service.buyerNotifications) return;
    let active = true, loading = false;
    async function read() {
      if (loading) return;
      loading = true;
      try {
        const data = await service.buyerNotifications!();
        if (active) setResult({ scope, data });
      } catch (failure) {
        if (active) setResult(old => ({ scope, data: old?.scope === scope ? old.data : undefined, error: requestError(failure).detail }));
      } finally { loading = false; }
    }
    void read();
    const timer = window.setInterval(() => { void read(); }, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [scope, revision]);
  const current = result?.scope === scope ? result : undefined;
  return { service, data: current?.data, error: current?.error, loading: enabled && !!service.buyerNotifications && !current, pending,
    refresh: () => setRevision(n => n + 1),
    async seen(id: string) {
      if (!service.markNotificationSeen || marking.current.has(id)) return;
      marking.current.add(id); setPending([...marking.current]);
      try { await service.markNotificationSeen(id); if (currentScope.current === scope) setRevision(n => n + 1); }
      catch (failure) { if (currentScope.current === scope) setResult(old => ({ scope, data: old?.scope === scope ? old.data : undefined, error: requestError(failure).detail })); }
      finally { marking.current.delete(id); if (currentScope.current === scope) setPending([...marking.current]); }
    },
  };
}
type Feed = ReturnType<typeof useDecisionFeed>;
const DecisionsContext = createContext<Feed | null>(null);
export const useBuyerDecisions = () => useContext(DecisionsContext);
export function BuyerDecisionsProvider({ service, enabled, children }: { service: PurchasePlanService; enabled: boolean; children: ReactNode }) {
  const feed = useDecisionFeed(service, enabled);
  return <DecisionsContext.Provider value={feed}>{children}</DecisionsContext.Provider>;
}

export function BuyerDecisions({ service }: { service: PurchasePlanService }) {
  const shared = useBuyerDecisions();
  const local = useDecisionFeed(service, !shared);
  const feed = shared?.service === service ? shared : local;
  const section = useRef<HTMLElement>(null);
  useEffect(() => { if (window.location.hash === '#decisions') { section.current?.scrollIntoView?.(); section.current?.focus(); } }, []);
  return <section ref={section} tabIndex={-1} id="decisions" className="pp-card pp-approval-inbox" aria-label="Decisions">
    <h2>Decisions{feed.data && feed.data.unread_count > 0 ? ` · ${feed.data.unread_count} unread` : ''}</h2>
    <p className="pp-card-description">Manager decisions on your plans. Showing the latest 100; refreshes every 30 seconds.</p>
    <PlanButton variant="secondary" onClick={feed.refresh} disabled={feed.loading}>Refresh decisions</PlanButton>
    {feed.error && <ErrorBanner>{feed.error}</ErrorBanner>}
    {feed.loading ? <p role="status">Loading your decisions…</p> : feed.data?.notifications.length === 0 ? <p>No decisions yet.</p>
      : <ul className="pp-approval-list">{feed.data?.notifications.map(n => <li key={n.notification_id}>
        <p><strong>{n.quantity_mt.toLocaleString('en-GB')} MT · {n.decision === 'approved' ? 'Approved' : 'Rejected'}</strong>{!n.seen_at && <span className="pp-unread">Unread</span>}</p>
        <p>{n.manager_label} · {decisionTime(n.created_at)} · Due {n.purchase_deadline}</p>
        {n.comment && <p>{n.comment}</p>}
        <div className="pp-actions"><AppLink href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(n.plan_id)}`}>View decision</AppLink>
          {!n.seen_at && service.markNotificationSeen && <PlanButton variant="secondary" disabled={feed.pending.includes(n.notification_id)} onClick={() => { void feed.seen(n.notification_id); }}>{feed.pending.includes(n.notification_id) ? 'Marking…' : 'Mark as seen'}</PlanButton>}</div>
      </li>)}</ul>}
  </section>;
}
