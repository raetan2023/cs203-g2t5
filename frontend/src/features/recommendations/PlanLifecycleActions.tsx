import { useEffect, useId, useRef, useState } from 'react';
import { AppLink, navigate } from '../../app/router';
import { isValidDate, formatDate } from '../purchase-plan/dates';
import { requestError, type PurchasePlan, type PurchasePlanService, type SubmissionResponse, type PurchaseInput, type FieldErrors } from '../purchase-plan/types';

export function PlanLifecycleActions({ plan, data, service, today, onChanged, onReload }: {
  plan: PurchasePlan; data: SubmissionResponse; service: PurchasePlanService; today: string;
  onChanged(plan: PurchasePlan): void; onReload(): void;
}) {
  const [action, setAction] = useState<'withdraw' | 'revise' | 'purchase'>();
  const [reason, setReason] = useState('');
  const [draft, setDraft] = useState({ purchased_on: today, supplier: '', quantity_mt: String(plan.quantity_mt), price_usd_per_mt: '', note: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const focusInvalid = useRef(false);
  const lock = useRef(false), active = useRef(true), form = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { if (focusInvalid.current) { focusInvalid.current = false; form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); } }, [errors]);
  const approvedOn = data.decision && new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(data.decision.decided_at));
  const field = (key: keyof typeof draft, label: string, type = 'text', extra = {}) => <div className="pp-field">
    <label htmlFor={`${id}-${key}`}>{label}</label>
    <input id={`${id}-${key}`} type={type} {...extra} disabled={busy || uncertain} value={draft[key]}
      aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
      onChange={e => { setDraft({ ...draft, [key]: e.target.value }); setErrors({ ...errors, [key]: undefined }); }} />
    {errors[key] && <p className="pp-field-error" id={`${id}-${key}-error`}>{errors[key]}</p>}
  </div>;
  async function confirm() {
    if (lock.current || uncertain || !action) return;
    const validation: FieldErrors = {};
    let input: PurchaseInput | undefined;
    if (action === 'purchase') {
      if (!isValidDate(draft.purchased_on) || draft.purchased_on > today || (approvedOn && draft.purchased_on < approvedOn)) validation.purchased_on = 'Choose a date from approval through today (Singapore).';
      if (!draft.supplier.trim() || draft.supplier.trim().length > 200) validation.supplier = 'Enter a supplier of at most 200 characters.';
      for (const key of ['quantity_mt', 'price_usd_per_mt'] as const) {
        const n = Number(draft[key]);
        if (!draft[key].trim() || !Number.isFinite(n) || n <= 0 || n >= 1e12 || !/^\d+(\.\d{1,6})?$/.test(draft[key])) validation[key] = 'Enter a positive amount with at most 6 decimal places.';
      }
      if (draft.note.trim().length > 2000) validation.note = 'Use at most 2000 characters.';
      input = { ...draft, supplier: draft.supplier.trim(), quantity_mt: Number(draft.quantity_mt), price_usd_per_mt: Number(draft.price_usd_per_mt), note: draft.note.trim() };
    }
    if (action === 'withdraw' && reason.trim().length > 2000) validation.reason = 'Use at most 2000 characters.';
    focusInvalid.current = Object.keys(validation).length > 0; setErrors(validation); if (Object.keys(validation).length) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const saved = action === 'withdraw' ? await service.withdraw!(plan.plan_id, reason.trim())
        : action === 'revise' ? await service.revise!(plan.plan_id) : await service.recordPurchase!(plan.plan_id, input!);
      if (!active.current) return;
      if (action === 'revise') navigate(`/purchase-plans?edit_plan_id=${encodeURIComponent(saved.plan.plan_id)}`);
      else { setAction(undefined); onChanged(saved.plan); }
    } catch (failure) {
      if (!active.current) return;
      const e = requestError(failure); focusInvalid.current = true; setErrors(e.field_errors); setError(e.detail);
      // A network/server failure may follow a committed write. Require reconciliation before retry.
      setUncertain(e.status !== 422);
    } finally { lock.current = false; if (active.current) setBusy(false); }
  }
  return <section className="rec-lifecycle" aria-label="Next plan action">
    {plan.status === 'approved' && plan.days_remaining < 0 && <p role="status">This plan is overdue. You can still record a purchase made on or after approval.</p>}
    {!action ? <div className="rec-approval-actions">
      {plan.status === 'submitted' && service.withdraw && <button className="bb-button bb-button--secondary" onClick={() => setAction('withdraw')}>Withdraw request</button>}
      {plan.status === 'approved' && service.recordPurchase && <button className="bb-button" onClick={() => setAction('purchase')}>Record purchase</button>}
      {(plan.status === 'rejected' || plan.status === 'withdrawn') && service.revise && <button className="bb-button" onClick={() => setAction('revise')}>Copy to new draft</button>}
    </div> : <form ref={form} noValidate aria-busy={busy} onSubmit={e => { e.preventDefault(); void confirm(); }}>
      <h3>{action === 'purchase' ? 'Record actual purchase' : action === 'withdraw' ? 'Withdraw this request?' : 'Copy this plan to a new draft?'}</h3>
      {action === 'withdraw' ? <div className="pp-field"><p>A withdrawn request cannot be approved. You can copy it to a new draft afterwards.</p>
        <label htmlFor={`${id}-reason`}>Withdrawal reason (optional)</label>
        <textarea autoFocus id={`${id}-reason`} rows={3} maxLength={2000} value={reason} disabled={busy || uncertain}
          aria-invalid={!!errors.reason} aria-describedby={errors.reason ? `${id}-reason-error` : undefined} onChange={e => setReason(e.target.value)} />
        {errors.reason && <p id={`${id}-reason-error`} className="pp-field-error">{errors.reason}</p>}</div>
        : action === 'revise' ? <p>The original plan and its history stay saved. Review the copied quantity and deadline before submitting the new draft.</p>
          : <><p>One purchase can be recorded per plan. This record cannot be edited. Confirm the invoice details before saving.</p>
            <div className="rec-purchase-fields">
              {field('purchased_on', 'Date bought (Singapore)', 'date', { min: approvedOn, max: today, autoFocus: true })}
              {field('supplier', 'Supplier', 'text', { maxLength: 200 })}
              {field('quantity_mt', 'Actual quantity (MT)', 'number', { step: '0.000001', min: '0.000001' })}
              {field('price_usd_per_mt', 'Price paid (USD/MT)', 'number', { step: '0.000001', min: '0.000001' })}
              {field('note', 'Note (optional)', 'text', { maxLength: 2000 })}
            </div>
            <p>The server calculates the actual total from the recorded quantity and price.</p></>}
      <div className="rec-approval-actions"><button type="button" className="bb-button bb-button--secondary" disabled={busy} onClick={() => { setAction(undefined); if (!uncertain) setError(''); setErrors({}); }}>Cancel</button>
        <button className="bb-button" type="submit" disabled={busy || uncertain}>{busy ? 'Saving…' : action === 'purchase' ? 'Confirm purchase record' : action === 'withdraw' ? 'Confirm withdrawal' : 'Create linked draft'}</button></div>
    </form>}
    {error && <div role="alert"><p>{error}</p>{uncertain && <p>Reload the request to check its current state before trying again.</p>}
      <button className="bb-button bb-button--secondary" onClick={onReload} disabled={busy}>Reload request</button></div>}
    {data.revision_plan_ids?.map(planId => <p key={planId}><AppLink href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(planId)}`}>View copied plan</AppLink></p>)}
  </section>;
}

const money = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const difference = (n: number) => n === 0 ? 'No difference' : `${money(Math.abs(n))} ${n < 0 ? 'less' : 'more'}`;
export function PurchaseOutcome({ data }: { data: SubmissionResponse }) {
  const p = data.purchase, c = data.comparison;
  if (!p) return null;
  return <section className="rec-detail" aria-label="Recorded purchase">
    <h2>Recorded purchase</h2>
    <dl className="rec-detail-grid">
      <div><dt>Supplier</dt><dd>{p.supplier}</dd></div><div><dt>Date bought</dt><dd>{formatDate(p.purchased_on)}</dd></div>
      <div><dt>Actual quantity</dt><dd>{p.quantity_mt.toLocaleString('en-GB')} MT</dd></div>
      <div><dt>Price paid</dt><dd>{money(p.price_usd_per_mt)}/MT</dd></div><div><dt>Actual total</dt><dd>{money(p.total_usd)}</dd></div>
      {c?.reference_total != null && <div><dt>Reference at submission · {c.planned_quantity_mt} MT</dt><dd>{money(c.reference_total)}</dd></div>}
      {c?.central_total != null && <div><dt>Estimate at submission · {c.planned_quantity_mt} MT</dt><dd>{money(c.central_total)}</dd></div>}
      {c?.forecast_total && <div><dt>Estimated range at submission · {c.planned_quantity_mt} MT</dt><dd>{money(c.forecast_total.lower)}–{money(c.forecast_total.upper)}</dd></div>}
      {c?.actual_minus_adjusted_reference != null && <div><dt>Compared with reference{!c.same_quantity && ' for actual quantity'}</dt><dd>{difference(c.actual_minus_adjusted_reference)}</dd></div>}
      {c?.actual_minus_adjusted_estimate != null && <div><dt>Compared with estimate{!c.same_quantity && ' for actual quantity'}</dt><dd>{difference(c.actual_minus_adjusted_estimate)}</dd></div>}
    </dl>
    {c && !c.same_quantity && <p>Planned {c.planned_quantity_mt} MT; bought {c.actual_quantity_mt} MT. Differences compare the same actual quantity so a smaller delivery is not shown as a price saving.</p>}
    {c && c.central_total == null && <p>No model point estimate was saved for this purchase; no estimated saving is inferred.</p>}
    {p.note && <p>Note: {p.note}</p>}
  </section>;
}
