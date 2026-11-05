import { useEffect, useRef } from 'react';
import { AppLink } from '../../../app/router';
import { type PurchasePlanService } from '../types';
import { ErrorBanner, PlanButton } from './Primitives';
import { useManagerRefresh } from '../useManagerRefresh';
import { ManagerRefreshBar, ManagerSkeleton } from './ManagerLoading';

/** Shared organisation inbox; revalidates through Spring with the active Clerk token. */
export function ApprovalInbox({ service }: { service: PurchasePlanService }) {
  const { data, error, loading, refresh } = useManagerRefresh(service, () => service.notifications!(), 30_000);
  const rows = data?.notifications ?? [];
  const refreshing = loading && data !== undefined;
  // Home's "Plans for approval" links here; client-side navigation doesn't scroll to a hash by itself.
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash !== '#approval-inbox') return;
    section.current?.scrollIntoView?.({ block: 'start' });
    section.current?.focus({ preventScroll: true });
  }, []);
  return <section ref={section} id="approval-inbox" tabIndex={-1} className="pp-card pp-approval-inbox pp-manager-panel" aria-label="Approval inbox" aria-busy={loading}>
    <h2>Approval inbox</h2>
    <p className="pp-card-description">Submissions shared with every manager in your organisation. Showing the latest 100; refreshes every 30 seconds.</p>
    <PlanButton variant="secondary" disabled={loading} onClick={refresh}>Refresh inbox</PlanButton>
    {refreshing && <ManagerRefreshBar label="Updating approval inbox…" />}
    {loading && !data ? <><p className="pp-sr-only" role="status">Loading approval notifications…</p><ManagerSkeleton /></> : error ? <ErrorBanner>{error}</ErrorBanner> : rows.length === 0 ? <p>No plans have been submitted yet.</p> : <ul className={`pp-approval-list pp-refresh-content${refreshing ? ' pp-refresh-content--pending' : ''}`}>{rows.map(row => <li key={row.notification_id}>
      <strong>{row.quantity_mt.toLocaleString('en-GB')} MT</strong> · Due {row.purchase_deadline}
      <p>Submitted {new Date(row.created_at).toLocaleString('en-GB')} · {row.status}</p>
      <AppLink href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(row.plan_id)}`}>View submitted recommendation</AppLink>
    </li>)}</ul>}
  </section>;
}
