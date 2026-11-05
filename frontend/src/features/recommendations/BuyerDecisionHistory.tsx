import { useEffect, useRef, useState } from 'react';
import { AppLink } from '../../app/router';
import type { PurchasePlanService } from '../purchase-plan/types';

type Decision = {
  id: string; plan_id: string | null; recommendation_id: string; run_id: string | null;
  action: string | null; decision: 'accept' | 'reject' | 'ignore'; reason: string; decided_at: string;
};

const LABELS: Record<string, string> = { accept: 'Accepted', reject: 'Rejected', ignore: 'Ignored' };
const COLORS: Record<string, string> = { accept: 'var(--bb-success-text)', reject: 'var(--bb-error-text)', ignore: 'var(--bb-text-secondary)' };
const when = (iso: string) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };

/** Every recommendation the buyer has accepted, rejected or ignored, newest first. */
export function BuyerDecisionHistory({ planService }: { planService: PurchasePlanService }) {
  const [rows, setRows] = useState<Decision[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const read = planService.readRecommendationDecisions;
    if (!read) { setError('Decision history is unavailable.'); return; }
    setRows(null); setError('');
    read().then((data) => { if (active.current) setRows((data as Decision[]) ?? []); })
      .catch((e) => { if (active.current) setError(e?.detail || e?.message || 'Could not load your decision history.'); });
  }, [planService, attempt]);

  return <main className="recommendations">
    <header className="rec-header">
      <AppLink className="rec-back" href="/purchase-plans" aria-label="Back to purchase plans">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>Purchase plans
      </AppLink>
      <h1>Your decision history</h1>
      <p>Every recommendation you have accepted, rejected or ignored, newest first.</p>
    </header>

    {error ? <section className="rec-card rec-error" role="alert">
        <h2>Couldn’t load your decisions</h2><p>{error}</p>
        <button className="bb-button" onClick={() => setAttempt(a => a + 1)}>Retry</button>
      </section>
      : rows === null ? <section className="rec-card" role="status"><h2>Loading your decisions…</h2><div className="rec-skeleton" aria-hidden="true" /></section>
      : rows.length === 0 ? <section className="rec-card rec-empty">
          <h2>No decisions yet</h2>
          <p>When you accept, reject or ignore a recommendation, it is recorded here.</p>
          <AppLink className="bb-button" href="/purchase-plans">Go to your plans</AppLink>
        </section>
      : <section className="rec-card" aria-label="Decision history">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {rows.map((d) => (
              <li key={d.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong style={{ color: COLORS[d.decision] || 'var(--bb-text-secondary)' }}>{LABELS[d.decision] || d.decision}{d.action ? <span style={{ opacity: 0.6, fontWeight: 400 }}> · advised {String(d.action).replaceAll('_', ' ').toLowerCase()}</span> : null}</strong>
                  <span style={{ opacity: 0.6, fontSize: 13 }}>{when(d.decided_at)}</span>
                </div>
                {d.reason ? <p style={{ margin: '4px 0 0', fontSize: 14 }}>{d.reason}</p> : null}
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.55, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {d.plan_id ? <AppLink href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(d.plan_id)}`}>View plan</AppLink> : null}
                  <span>recommendation {d.recommendation_id}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>}
  </main>;
}
