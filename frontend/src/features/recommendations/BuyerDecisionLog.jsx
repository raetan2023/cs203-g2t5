import React, { useCallback, useEffect, useState } from 'react';
import { getDecisions, getDecisionFor, recordDecision } from './buyerDecisions';

const LABELS = { accept: 'Accepted', reject: 'Rejected', ignore: 'Ignored' };
const when = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return ''; } };

// Buyer's own answer to the current recommendation: accept / reject / ignore.
// Reject asks for a reason inline. Persists through the backend when planService
// exposes the decision methods; otherwise falls back to this device's store.
// Styles live in recommendations.css (.bdl-*): sentence-case labels, token colours, three peer buttons.
export default function BuyerDecisionLog({ planId, recommendationId, runId, action, planService }) {
  const remote = !!(planService && planService.recordRecommendationDecision && planService.readRecommendationDecisions);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(() => (remote ? [] : getDecisions()));

  const refreshLocal = useCallback(() => setHistory(getDecisions()), []);
  const loadRemote = useCallback(async () => {
    if (!remote) return;
    try {
      const rows = await planService.readRecommendationDecisions(planId);
      setHistory(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e?.detail || e?.message || 'Could not load your decision history.');
    }
  }, [remote, planService, planId]);

  useEffect(() => {
    if (remote) loadRemote(); else refreshLocal();
  }, [remote, loadRemote, refreshLocal, recommendationId]);

  const current = history.find((d) => d.recommendation_id === recommendationId)
    || (remote ? null : getDecisionFor(recommendationId));

  const save = useCallback(async (decision, withReason = '') => {
    setError('');
    if (!recommendationId) { setError('A current recommendation is required to record a decision.'); return; }
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
      setBusy(false);
    }
  }, [remote, planService, planId, recommendationId, runId, action, loadRemote, refreshLocal]);

  const disabled = busy || !recommendationId;

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
          <textarea id="bdl-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus disabled={busy} />
          <div className="bdl-actions">
            <button type="button" className="bb-button" disabled={busy || !reason.trim()} onClick={() => save('reject', reason.trim())}>{busy ? 'Saving…' : 'Confirm rejection'}</button>
            <button type="button" className="bb-button bb-button--secondary" disabled={busy} onClick={() => { setRejecting(false); setReason(''); setError(''); }}>Cancel</button>
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
