import { useEffect, useRef, useState } from 'react';
import { AppLink } from '../../../app/router';
import { requestError, type ApprovalNotification, type PurchasePlanService } from '../types';
import { ErrorBanner, PlanButton } from './Primitives';

/** Shared organisation inbox; revalidates through Spring with the active Clerk token. */
export function ApprovalInbox({ service }: { service: PurchasePlanService }) {
  const [rows, setRows] = useState<ApprovalNotification[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await service.notifications!();
        if (active) { setRows(result.notifications); setError(''); }
      } catch (failure) { if (active) { setRows([]); setError(requestError(failure).detail); } }
      finally { if (active) setLoading(false); }
    }
    setRows([]); setError(''); setLoading(true);
    void load();
    const timer = window.setInterval(() => { void load(); }, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [service, revision]);
  // Home's "Plans for approval" links here; client-side navigation doesn't scroll to a hash by itself.
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash !== '#approval-inbox') return;
    section.current?.scrollIntoView?.({ block: 'start' });
    section.current?.focus({ preventScroll: true });
  }, []);
  return <section ref={section} id="approval-inbox" tabIndex={-1} className="pp-card pp-approval-inbox" aria-label="Approval inbox">
    <h2>Approval inbox</h2>
    <p className="pp-card-description">Submissions shared with every manager in your organisation. Showing the latest 100; refreshes every 30 seconds.</p>
    <PlanButton variant="secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh inbox</PlanButton>
    {loading ? <p role="status">Loading approval notifications…</p> : error ? <ErrorBanner>{error}</ErrorBanner> : rows.length === 0 ? <p>No plans have been submitted yet.</p> : <ul className="pp-approval-list">{rows.map(row => <li key={row.notification_id}>
      <strong>{row.quantity_mt.toLocaleString('en-GB')} MT</strong> · Due {row.purchase_deadline}
      <p>Submitted {new Date(row.created_at).toLocaleString('en-GB')} · {row.status}</p>
      <AppLink href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(row.plan_id)}`}>View submitted recommendation</AppLink>
    </li>)}</ul>}
  </section>;
}
