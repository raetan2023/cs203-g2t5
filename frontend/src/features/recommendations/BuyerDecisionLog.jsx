import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getDecisions, recordDecision } from './buyerDecisions';

const LABELS = { accept: 'Accepted', reject: 'Rejected', ignore: 'Ignored' };
const when = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return ''; } };

// Buyer's own answer to the current recommendation: accept / reject / ignore.
// Reject asks for a reason inline. Persists through the backend when planService
// exposes the decision methods; otherwise falls back to this device's store.
// Styles live in recommendations.css (.bdl-*): sentence-case labels, token colours, three peer buttons.
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

  return (
    <div className="bb-decision bdl" aria-label="Your decision on this recommendation">
      <h3>Your decision on this recommendation</h3>

      {current && (
        <p className="bdl-current">
          You <strong>{LABELS[current.decision].toLowerCase()}</strong> this
          {current.reason ? <> · {current.reason}</> : null}
        </p>
      )}

      <div className="bdl-actions">
        <button type="button" className="bb-button bb-button--secondary" disabled={disabled} onClick={() => save('accept')}>Accept</button>
        <button type="button" className="bb-button bb-button--secondary" disabled={disabled} onClick={() => { setError(''); setRejecting(true); }}>Reject</button>
        <button type="button" className="bb-button bb-button--secondary" disabled={disabled} onClick={() => save('ignore')}>Ignore</button>
      </div>

      {rejecting && (
        <div className="bdl-reason">
          <label htmlFor="bdl-reason">Why are you rejecting this? (required)</label>
          <textarea id="bdl-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus disabled={locked || busy} />
          <div className="bdl-actions">
            <button type="button" className="bb-button" disabled={locked || busy || !reason.trim()} onClick={() => save('reject', reason.trim())}>{busy ? 'Saving…' : 'Confirm rejection'}</button>
            <button type="button" className="bb-button bb-button--secondary" disabled={locked || busy} onClick={() => { setRejecting(false); setReason(''); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {error && <p role="alert">{error}</p>}
      {!recommendationId && <p>A current recommendation is required to record a decision.</p>}

      {history.length > 0 && (
        <div className="bdl">
          <h4>Decision history</h4>
          <ul className="bdl-history">
            {history.map((d) => (
              <li key={d.id}>
                <div><strong>{LABELS[d.decision]}</strong>{d.action ? <span> · {String(d.action).replaceAll('_', ' ').toLowerCase()}</span> : null}</div>
                {d.reason ? <div>{d.reason}</div> : null}
                <time dateTime={d.decided_at}>{when(d.decided_at)}</time>
              </li>
            ))}
          </ul>
          <p className="bdl-store">{remote ? 'Saved to your account.' : 'Recorded on this device.'}</p>
        </div>
      )}
    </div>
  );
}
