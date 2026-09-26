import { useId, useRef, useState } from 'react';
import { formatDate } from '../dates';
import { requestError, type PlanInput, type PurchasePlan, type FieldErrors } from '../types';
import { validateDraft, type PlanDraft } from '../validation';
import { ErrorBanner, PlanButton } from './Primitives';

interface Props {
  plan: PurchasePlan | null;
  scenarioDate: string;
  onSave(input: PlanInput): Promise<void>;
  onCancel(): void;
  onBusyChange(busy: boolean): void;
}

export function PurchasePlanForm({ plan, scenarioDate, onSave, onCancel, onBusyChange }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<PlanDraft>({ quantity: plan ? String(plan.quantity_mt) : '', deadline: plan?.purchase_deadline ?? '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const quantityRef = useRef<HTMLInputElement>(null);
  const deadlineRef = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    const validation = validateDraft(draft, scenarioDate);
    setErrors(validation);
    setMessage('');
    if (Object.keys(validation).length) {
      (validation.quantity_mt ? quantityRef : deadlineRef).current?.focus();
      return;
    }
    lock.current = true;
    setSaving(true);
    onBusyChange(true);
    try {
      await onSave({ quantity_mt: Number(draft.quantity), purchase_deadline: draft.deadline });
    } catch (error) {
      const failure = requestError(error);
      setErrors(failure.field_errors);
      setMessage(failure.detail);
    } finally {
      lock.current = false;
      setSaving(false);
      onBusyChange(false);
    }
  }

  return <form className="pp-card pp-form" onSubmit={submit} noValidate aria-busy={saving} aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>{plan ? 'Your purchase plan' : 'Create your purchase plan'}</h2>
    <p className="pp-card-description" role="status">{saving ? 'We are currently processing your changes. Please wait.' : plan ? 'Update your purchase quantity and deadline below.' : 'Set your purchase quantity and deadline below.'}</p>
    <div className="pp-fields">
      <div className="pp-field">
        <label htmlFor={`${id}-quantity`}>Quantity</label>
        <div className={`pp-input-unit ${errors.quantity_mt ? 'pp-invalid' : ''}`}>
          <input ref={quantityRef} autoFocus id={`${id}-quantity`} type="number" inputMode="decimal" step="any" placeholder="Enter quantity" value={draft.quantity} disabled={saving} aria-invalid={!!errors.quantity_mt} aria-describedby={`${id}-unit${errors.quantity_mt ? ` ${id}-quantity-error` : ''}`} onChange={event => {
            setDraft({ ...draft, quantity: event.target.value }); setErrors({ ...errors, quantity_mt: undefined });
          }} />
          <span id={`${id}-unit`}>MT</span>
        </div>
        {errors.quantity_mt && <p className="pp-field-error" id={`${id}-quantity-error`}>{errors.quantity_mt}</p>}
      </div>
      <div className="pp-field">
        <label htmlFor={`${id}-deadline`}>Purchase deadline</label>
        <input ref={deadlineRef} className={errors.purchase_deadline ? 'pp-invalid' : ''} id={`${id}-deadline`} type="date" min={scenarioDate} value={draft.deadline} disabled={saving} aria-invalid={!!errors.purchase_deadline} aria-describedby={errors.purchase_deadline ? `${id}-deadline-error` : undefined} onChange={event => {
          setDraft({ ...draft, deadline: event.target.value }); setErrors({ ...errors, purchase_deadline: undefined });
        }} />
        {errors.purchase_deadline && <p className="pp-field-error" id={`${id}-deadline-error`}>{errors.purchase_deadline}</p>}
      </div>
      <div className="pp-field">
        <span className="pp-label" id={`${id}-scenario-label`}>Historical scenario date</span>
        <div className="pp-readonly" aria-labelledby={`${id}-scenario-label`}><time dateTime={scenarioDate}>{formatDate(scenarioDate)}</time></div>
      </div>
    </div>
    <div className="pp-form-footer">
      {message && <ErrorBanner>{message}</ErrorBanner>}
      <div className="pp-actions">
        <PlanButton variant="secondary" onClick={onCancel} disabled={saving}>Cancel</PlanButton>
        <PlanButton type="submit" disabled={saving}>{saving ? 'Saving...' : plan ? 'Save changes' : 'Save plan'}</PlanButton>
      </div>
    </div>
  </form>;
}
