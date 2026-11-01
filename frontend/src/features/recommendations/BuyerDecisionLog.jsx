import React, { useState } from 'react';
import { getDecisions, getDecisionFor, recordDecision } from './buyerDecisions';

const LABELS = { accept: 'Accepted', reject: 'Rejected', ignore: 'Ignored' };

// Lets the buyer record their own answer to the current recommendation
// (accept / reject / ignore) with a reason, and shows the decision history.
// Props: planId, recommendationId (the version), runId, action (all optional,
// but buttons are disabled until a recommendationId is present).
export default function BuyerDecisionLog({ planId, recommendationId, runId, action }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [, bump] = useState(0); // force re-read of the store after recording

  const current = getDecisionFor(recommendationId);
  const history = getDecisions();

  function decide(decision) {
    setError('');
    try {
      recordDecision({ planId, recommendationId, runId, action, decision, reason });
      setReason('');
      bump((n) => n + 1);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="bb-buyer-decision" aria-label="Your decision on this recommendation"
      style={{ marginTop: 16, padding: 16, border: '1px solid #2a3647', borderRadius: 10 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Your decision on this recommendation</h3>

      {current && (
        <p style={{ margin: '0 0 10px', fontSize: 13 }}>
          Current: <strong>{LABELS[current.decision]}</strong>
          {current.reason ? ` · ${current.reason}` : ''}
          {' · '}<span style={{ opacity: 0.7 }}>{new Date(current.decided_at).toLocaleString()}</span>
        </p>
      )}

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required to reject)"
        rows={2}
        style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="bb-button" disabled={!recommendationId} onClick={() => decide('accept')}>Accept</button>
        <button type="button" className="bb-button bb-button--secondary" disabled={!recommendationId} onClick={() => decide('reject')}>Reject</button>
        <button type="button" className="bb-button bb-button--secondary" disabled={!recommendationId} onClick={() => decide('ignore')}>Ignore</button>
      </div>

      {error && <p role="alert" style={{ color: '#f2849e', marginTop: 8, fontSize: 13 }}>{error}</p>}
      {!recommendationId && <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>A current recommendation is required to record a decision.</p>}

      {history.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Decision history</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map((d) => (
              <li key={d.id} style={{ fontSize: 12.5 }}>
                <strong>{LABELS[d.decision]}</strong>
                {d.action ? ` · ${String(d.action).replaceAll('_', ' ').toLowerCase()}` : ''}
                {d.reason ? ` · ${d.reason}` : ''}
                {' · '}<span style={{ opacity: 0.7 }}>{new Date(d.decided_at).toLocaleString()}</span>
                {d.recommendation_id ? <span style={{ opacity: 0.55 }}> · version {d.recommendation_id}</span> : null}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>Recorded on this device. Backend sync is the next step.</p>
        </div>
      )}
    </section>
  );
}
