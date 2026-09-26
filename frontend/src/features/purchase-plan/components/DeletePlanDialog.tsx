import { useEffect, useId, useRef, useState } from 'react';
import { requestError } from '../types';
import { Icon, PlanButton } from './Primitives';

export function DeletePlanDialog({ onCancel, onDelete }: { onCancel(): void; onDelete(): Promise<void> }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    element.showModal();
    cancel.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  async function remove() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError('');
    dialog.current?.focus();
    try { await onDelete(); }
    catch (failure) { setError(requestError(failure).detail); }
    finally { lock.current = false; setPending(false); }
  }

  useEffect(() => { if (error) cancel.current?.focus(); }, [error]);

  return <dialog ref={dialog} tabIndex={-1} className="pp-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={pending} onCancel={event => {
    event.preventDefault();
    if (!lock.current) onCancel();
  }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const buttons = Array.from(dialog.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!buttons.length) { event.preventDefault(); return; }
    const first = buttons[0]; const last = buttons[buttons.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
  }}>
    <div className={`pp-dialog-icon ${pending ? 'pp-dialog-icon--pending' : ''}`}><Icon name="trash" /></div>
    <div aria-live="polite" aria-atomic="true">
      <h2 id={`${id}-title`}>{pending ? 'Deleting your purchase plan' : error ? 'Deletion failed' : 'Delete your purchase plan?'}</h2>
      <p id={`${id}-description`}>{pending ? "We're removing your saved purchase plan. This action is currently in progress and cannot be repeated until it finishes." : error || 'This will permanently delete your saved purchase plan. You can create a new one afterwards.'}</p>
    </div>
    <div className="pp-dialog-actions">
      <PlanButton ref={cancel} variant="secondary" disabled={pending} onClick={onCancel}>Cancel</PlanButton>
      <PlanButton variant={pending || error ? 'primary' : 'danger'} disabled={pending} onClick={remove}>{pending ? 'Deleting plan' : error ? 'Retry' : 'Delete plan'}</PlanButton>
    </div>
  </dialog>;
}
