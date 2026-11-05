import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getDecisions, recordDecision } from './buyerDecisions';

const LABELS = { accept: 'Accepted', reject: 'Rejected', ignore: 'Ignored' };
const COLORS = { accept: '#6cc58c', reject: '#f2849e', ignore: '#8a93a3' };
const when = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return ''; } };

// Buyer's own answer to the current recommendation: accept / reject / ignore.
// Reject asks for a reason inline. Persists through the backend when planService
// exposes the decision methods; otherwise falls back to this device's store.
/** @param {{ planId: string, recommendationId: string, runId?: string | null, action: string, planService?: import('../purchase-plan/types').PurchasePlanService, onDecisionChange?: (decision: string | null) => void, locked?: boolean }} props */
export default function BuyerDecisionLog({ planId, recommendationId, runId, action, planService, onDecisionChange, locked = false }) {
  const remote = !!(planService && planService.recordRecommendationDecision && planService.readRecommendationDecisions);
  const onChange = useRef(onDecisionChange);
  onChange.current = onDecisionChange;
  const pending = useRef(false);
  const readSequence = useRef(0);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(() => (remote ? [] : getDecisions()));

  const refreshLocal = useCallback(() => setHistory(getDecisions()), []);
  const loadRemote = useCallback(async () => {
    if (!remote) return;
    const sequence = ++readSequence.current;
    try {
      const rows = await planService.readRecommendationDecisions(planId);
      if (sequence === readSequence.current) setHistory(Array.isArray(rows) ? rows : []);
    } catch (e) {
      if (sequence === readSequence.current) setError(e?.detail || e?.message || 'Could not load your decision history.');
    }
  }, [remote, planService, planId]);

  useEffect(() => {
    if (remote) { setHistory([]); loadRemote(); } else refreshLocal();
    return () => { readSequence.current++; };
  }, [remote, loadRemote, refreshLocal, recommendationId]);

  const latest = history.find((entry) => entry.plan_id === planId && entry.recommendation_id === recommendationId);
  const current = latest?.run_id === (runId ?? null) ? latest : undefined;

  useEffect(() => {
    onChange.current?.(!busy && !rejecting && !error && current?.action === action ? current?.decision ?? null : null);
  }, [busy, rejecting, error, current, action]);

  const save = useCallback(async (decision, withReason = '') => {
    if (pending.current || locked) return;
    setError('');
    if (!recommendationId) { setError('A current recommendation is required to record a decision.'); return; }
    readSequence.current++;
    pending.current = true;
    setBusy(true);
    try {
      if (remote) {
        await planService.recordRecommendationDecision(planId, { recommendationId, runId, action, decision, reason: withReason });
        await loadRemote();
      } else {
        recordDecision({ planId, recommendationId, runId, action, decision, reason: withReason });
        refreshLocal();
      }
      setReason('');
      setRejecting(false);
    } catch (e) {
      setError(e?.detail || e?.message || 'Could not save your decision. Please retry.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, [remote, planService, planId, recommendationId, runId, action, loadRemote, refreshLocal, locked]);

  const disabled = locked || busy || !recommendationId;
  const btn = { flex: '1 1 0', minWidth: 0, padding: '9px 6px', fontSize: 13 };

  return (
    <div className="bb-decision" aria-label="Your decision on this recommendation" style={{ marginTop: 16 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.6 }}>Your decision on this recommendation</h3>

      {current && (
        <p style={{ margin: '0 0 10px', fontSize: 13 }}>
          You <strong>{LABELS[current.decision].toLowerCase()}</strong> this
          {current.reason ? <> · <span style={{ opacity: 0.8 }}>{current.reason}</span></> : null}
        </p>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="bb-button" disabled={disabled} onClick={() => save('accept')} style={btn}>Accept</button>
        <button type="button" className="bb-button bb-button--secondary" disabled={disabled} onClick={() => { setError(''); setRejecting(true); }} style={btn}>Reject</button>
        <button type="button" className="bb-button bb-button--secondary" disabled={disabled} onClick={() => save('ignore')} style={btn}>Ignore</button>
      </div>

      {rejecting && (
        <div style={{ marginTop: 10 }}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus disabled={busy}
            placeholder="Why are you rejecting this? (required)"
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8, fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="bb-button" disabled={locked || busy || !reason.trim()} onClick={() => save('reject', reason.trim())} style={btn}>{busy ? 'Saving…' : 'Confirm rejection'}</button>
            <button type="button" className="bb-button bb-button--secondary" disabled={busy} onClick={() => { setRejecting(false); setReason(''); setError(''); }} style={btn}>Cancel</button>
          </div>
        </div>
      )}

      {error && <p role="alert" style={{ color: '#f2849e', marginTop: 8, fontSize: 12.5 }}>{error}</p>}
      {!recommendationId && <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>A current recommendation is required to record a decision.</p>}

      {history.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: '0 0 6px', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.6 }}>Decision history</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((d) => (
              <li key={d.id} style={{ fontSize: 12.5, paddingLeft: 10, borderLeft: `2px solid ${COLORS[d.decision] || '#8a93a3'}` }}>
                <div><strong>{LABELS[d.decision]}</strong>{d.action ? <span style={{ opacity: 0.6 }}> · {String(d.action).replaceAll('_', ' ').toLowerCase()}</span> : null}</div>
                {d.reason ? <div style={{ opacity: 0.85 }}>{d.reason}</div> : null}
                <div style={{ opacity: 0.55, fontSize: 11.5 }}>{when(d.decided_at)}</div>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>{remote ? 'Saved to your account.' : 'Recorded on this device.'}</p>
        </div>
      )}
    </div>
  );
}
