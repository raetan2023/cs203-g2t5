import { useEffect, useId, useRef, useState } from 'react';
import { requestError, type PurchasePlanService } from '../purchase-plan/types';

export function ManagerDecisionForm({ planId, fingerprint, service, onDecided, onRefresh }: {
  planId: string; fingerprint: string; service: PurchasePlanService; onDecided(): void; onRefresh(): void;
}) {
  const label = useId();
  const [choice, setChoice] = useState<'approved' | 'rejected' | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const pending = useRef(false), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const valid = !!choice && comment.trim().length <= 2000 && (choice !== 'rejected' || !!comment.trim());

  async function confirm() {
    if (!valid || !choice || !service.decide || pending.current || conflict) return;
    pending.current = true; setBusy(true); setError('');
    try {
      await service.decide!(planId, { decision: choice, comment: comment.trim(), approval_fingerprint: fingerprint });
      if (active.current) onDecided();
    } catch (failure) {
      if (active.current) {
        const message = requestError(failure);
        setError(message.detail); setConflict(message.status === 409 || message.status === 404);
      }
    } finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <section className="rec-manager-decision" aria-label="Manager review">
    <h3>Manager review</h3>
    <p>Decide this saved recommendation. Your name or account, decision time and comment will be recorded for the buyer and organisation reviewers.</p>
    {!choice ? <div className="rec-approval-actions">
      <button className="bb-button" onClick={() => setChoice('approved')}>Approve recommendation</button>
      <button className="bb-button bb-button--secondary" onClick={() => setChoice('rejected')}>Reject recommendation</button>
    </div> : <div>
      <label htmlFor={label}>{choice === 'rejected' ? 'Rejection reason (required)' : 'Approval comment (optional)'}</label>
      <textarea id={label} rows={4} maxLength={2000} value={comment} disabled={busy || conflict} required={choice === 'rejected'} onChange={event => setComment(event.target.value)} />
      <p>Confirm {choice === 'approved' ? 'approval' : 'rejection'}? This decision cannot be changed.</p>
      {choice === 'rejected' && !comment.trim() && <p>Please explain why you are rejecting this recommendation.</p>}
      <div className="rec-approval-actions"><button className="bb-button bb-button--secondary" disabled={busy || conflict} onClick={() => { setChoice(null); setError(''); setConflict(false); }}>Cancel decision</button>
      <button className="bb-button" disabled={!valid || busy || conflict} onClick={confirm}>{busy ? 'Saving decision…' : choice === 'approved' ? 'Confirm approval' : 'Confirm rejection'}</button></div>
    </div>}
    {error && <div role="alert"><p>{error}</p><p>Reload the request to check whether a decision was saved before trying again.</p>
      <button className="bb-button" disabled={busy} onClick={onRefresh}>Reload request</button></div>}
  </section>;
}
