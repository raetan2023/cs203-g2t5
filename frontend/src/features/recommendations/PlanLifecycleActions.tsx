import { useEffect, useId, useRef, useState } from 'react';
import { AppLink, navigate } from '../../app/router';
import { isValidDate, formatDate } from '../purchase-plan/dates';
import { requestError, type PurchasePlan, type PurchasePlanService, type SubmissionResponse, type PurchaseInput, type FieldErrors } from '../purchase-plan/types';
import { currencyAmount } from './format';

export function PlanLifecycleActions({ plan, data, service, today, onChanged, onReload }: {
  plan: PurchasePlan; data: SubmissionResponse; service: PurchasePlanService; today: string;
  onChanged(plan: PurchasePlan): void; onReload(): void;
}) {
  const [action, setAction] = useState<'revise' | 'purchase'>();
  const [draft, setDraft] = useState({ purchased_on: plan.purchase_deadline < today ? plan.purchase_deadline : today, supplier: '', price_usd_per_mt: '', note: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const focusInvalid = useRef(false);
  const lock = useRef(false), active = useRef(true), form = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { if (focusInvalid.current) { focusInvalid.current = false; form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); } }, [errors]);
  // The date bought must fall between approval and the deadline, and can't be in the future.
  const latestPurchase = plan.purchase_deadline < today ? plan.purchase_deadline : today;
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
      if (!isValidDate(draft.purchased_on) || draft.purchased_on > latestPurchase || (approvedOn && draft.purchased_on < approvedOn)) validation.purchased_on = 'Choose a date from approval through today, no later than the purchase deadline (Singapore).';
      if (!draft.supplier.trim() || draft.supplier.trim().length > 200) validation.supplier = 'Enter a supplier of at most 200 characters.';
      const price = Number(draft.price_usd_per_mt);
      if (!draft.price_usd_per_mt.trim() || !Number.isFinite(price) || price <= 0 || price >= 1e12 || !/^\d+(\.\d{1,6})?$/.test(draft.price_usd_per_mt)) validation.price_usd_per_mt = 'Enter a positive amount with at most 6 decimal places.';
      if (draft.note.trim().length > 2000) validation.note = 'Use at most 2000 characters.';
      input = { ...draft, supplier: draft.supplier.trim(), price_usd_per_mt: Number(draft.price_usd_per_mt), note: draft.note.trim() };
    }
    focusInvalid.current = Object.keys(validation).length > 0; setErrors(validation); if (Object.keys(validation).length) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const saved = action === 'revise' ? await service.revise!(plan.plan_id) : await service.recordPurchase!(plan.plan_id, input!);
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
  const offered = (plan.status === 'approved' && !!service.recordPurchase)
    || ((plan.status === 'rejected' || plan.status === 'withdrawn' || plan.status === 'closed') && !!service.revise);
  // A purchased plan has no next action: render nothing rather than an empty section (a blank band in the status card).
  if (!action && !offered && !error && !data.revision_plan_ids?.length && !(plan.status === 'approved' && plan.days_remaining < 0)) return null;
  return <section className="rec-lifecycle" aria-label="Next plan action">
    {plan.status === 'approved' && plan.days_remaining < 0 && <p role="status">The purchase deadline has passed. You can still record a purchase made on or before {formatDate(plan.purchase_deadline)}.</p>}
    {!action ? <div className="rec-approval-actions">
      {plan.status === 'approved' && service.recordPurchase && <button className="bb-button" onClick={() => setAction('purchase')}>Record purchase</button>}
      {(plan.status === 'rejected' || plan.status === 'withdrawn' || plan.status === 'closed') && service.revise && <button className="bb-button" onClick={() => setAction('revise')}>Copy to new draft</button>}
    </div> : <form ref={form} noValidate aria-busy={busy} onSubmit={e => { e.preventDefault(); void confirm(); }}>
      <h3>{action === 'purchase' ? 'Record actual purchase' : 'Copy this plan to a new draft?'}</h3>
      {action === 'revise' ? <p>The original plan and its history stay saved. Review the copied quantity and deadline before submitting the new draft.</p>
          : <><p>One purchase can be recorded per plan. This record cannot be edited. Confirm the invoice details before saving.</p>
            <div className="rec-purchase-fields">
              {field('purchased_on', 'Date bought (Singapore)', 'date', { min: approvedOn, max: latestPurchase, autoFocus: true })}
              {field('supplier', 'Supplier', 'text', { maxLength: 200 })}
              {field('price_usd_per_mt', 'Price paid (USD/MT)', 'number', { step: '0.000001', min: '0.000001' })}
              {field('note', 'Note (optional)', 'text', { maxLength: 2000 })}
            </div>
            <p>The quantity is the {plan.quantity_mt.toLocaleString('en-GB')} MT in the approved plan. The total is worked out from it and the price paid.</p></>}
      <div className="rec-approval-actions"><button type="button" className="bb-button bb-button--secondary" disabled={busy} onClick={() => { setAction(undefined); if (!uncertain) setError(''); setErrors({}); }}>Cancel</button>
        <button className="bb-button" type="submit" disabled={busy || uncertain}>{busy ? 'Saving…' : action === 'purchase' ? 'Confirm purchase record' : 'Create linked draft'}</button></div>
    </form>}
    {error && <div role="alert"><p>{error}</p>{uncertain && <p>Reload the request to check its current state before trying again.</p>}
      <button className="bb-button bb-button--secondary" onClick={onReload} disabled={busy}>Reload request</button></div>}
    {data.revision_plan_ids?.map(planId => <p key={planId}><AppLink href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(planId)}`}>View copied plan</AppLink></p>)}
  </section>;
}

const money = (n: number) => `USD ${currencyAmount(n)}`;
const difference = (n: number) => Math.abs(n) < 0.005 ? 'No difference' : `${currencyAmount(Math.abs(n))} ${n < 0 ? 'less' : 'more'}`;
export function PurchaseOutcome({ data }: { data: SubmissionResponse }) {
  const titleId = useId();
  const p = data.purchase, c = data.comparison;
  if (!p) return null;
  const analysis = data.submission?.analysis;
  const observationDate = analysis?.reference.status === 'ready' ? analysis.reference.value.observation_date : undefined;
  const forecastDate = (analysis?.cost_impact.status === 'ready' && analysis.cost_impact.value.target_date)
    || (analysis?.forecast.status === 'ready' ? analysis.forecast.value.target_date : undefined);
  const benchmarks = [
    { label: 'Forecast price', date: forecastDate && `For ${formatDate(forecastDate)}`, total: c?.central_total, totalDifference: c?.actual_minus_adjusted_estimate },
    { label: 'Market price', date: observationDate && `Observed ${formatDate(observationDate)}`, total: c?.reference_total, totalDifference: c?.actual_minus_adjusted_reference },
  ];
  const totalComparisons = benchmarks.filter(row => row.total != null || row.totalDifference != null);
  return <section className="rec-detail rec-purchase-outcome" aria-labelledby={titleId}>
    <div className="rec-purchase-summary">
      <h2 id={titleId}>Recorded purchase</h2>
      <dl className="rec-purchase-prices">
        <div><dt>Price paid per MT</dt><dd>{money(p.price_usd_per_mt)}</dd></div>
        <div><dt>Total paid</dt><dd>{money(p.total_usd)}</dd></div>
      </dl>
      <dl className="rec-detail-grid rec-purchase-facts">
        <div><dt>Supplier</dt><dd>{p.supplier}</dd></div>
        <div><dt>Date bought</dt><dd><time dateTime={p.purchased_on}>{formatDate(p.purchased_on)}</time></dd></div>
        <div><dt>Quantity bought</dt><dd>{p.quantity_mt.toLocaleString('en-GB')} MT</dd></div>
      </dl>
      {p.note && <dl className="rec-purchase-note"><dt>Purchase note</dt><dd>{p.note}</dd></dl>}
    </div>
    {c && <div className="rec-purchase-comparison">
      <h3>How the price paid compares</h3>
      <table className="rec-cost-table" aria-label="Price comparison in USD per MT">
        <thead><tr><th scope="col">At submission</th><th scope="col">USD per MT</th><th scope="col">Difference</th></tr></thead>
        <tbody>{benchmarks.map(row => {
          const savedPrice = row.total == null ? undefined : row.total / c.planned_quantity_mt;
          return <tr key={row.label}>
            <th scope="row">{row.label}{savedPrice != null && row.date && <span className="rec-saved-price-date">{row.date}</span>}</th>
            {savedPrice == null ? <td colSpan={2}>Unavailable</td> : <>
              <td>{currencyAmount(savedPrice)}</td>
              <td>{difference(p.price_usd_per_mt - savedPrice)}</td>
            </>}
          </tr>;
        })}</tbody>
      </table>
      <p>The forecast is the model’s predicted price. The market price is the quote used when the plan was submitted.</p>
      {(totalComparisons.length > 0 || c.forecast_total) && <details className="rec-fine">
        <summary>Compare total costs</summary>
        <div className="rec-fine-body">
          {totalComparisons.length > 0 && <>
            <p>{c.same_quantity ? <>Totals use the {c.planned_quantity_mt.toLocaleString('en-GB')} MT in the plan.</>
              : <>Saved totals use the {c.planned_quantity_mt.toLocaleString('en-GB')} MT planned. Differences use the {c.actual_quantity_mt.toLocaleString('en-GB')} MT actually bought.</>}</p>
            <table className="rec-cost-table" aria-label="Total cost comparison in USD">
              <thead><tr><th scope="col">Compared with</th><th scope="col">Saved total (USD)</th><th scope="col">Difference (USD)</th></tr></thead>
              <tbody>{totalComparisons.map(row => <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{row.total == null ? 'Unavailable' : currencyAmount(row.total)}</td>
                <td>{row.totalDifference == null ? 'Unavailable' : difference(row.totalDifference)}</td>
              </tr>)}</tbody>
            </table>
          </>}
          {c.forecast_total && <dl className="rec-purchase-range">
            <dt>Original forecast range for {c.planned_quantity_mt.toLocaleString('en-GB')} MT</dt>
            <dd>{money(c.forecast_total.lower)} to {currencyAmount(c.forecast_total.upper)} total</dd>
            <dd>{money(c.forecast_total.lower / c.planned_quantity_mt)} to {currencyAmount(c.forecast_total.upper / c.planned_quantity_mt)} per MT</dd>
          </dl>}
        </div>
      </details>}
    </div>}
  </section>;
}
