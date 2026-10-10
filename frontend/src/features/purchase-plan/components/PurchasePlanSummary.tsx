import { AppLink } from '../../../app/router';
import { formatDate } from '../dates';
import type { PurchasePlan } from '../types';
import { PlanButton } from './Primitives';
import type { RefObject } from 'react';

export function PurchasePlanSummary({ plan, onEdit, onDelete, editRef, deleteRef, busy = false }: {
  plan: PurchasePlan;
  busy?: boolean;
  onEdit(): void;
  onDelete(): void;
  editRef: RefObject<HTMLButtonElement | null>;
  deleteRef: RefObject<HTMLButtonElement | null>;
}) {
  const timeRemaining =
    plan.days_remaining < 0
      ? `Overdue by ${Math.abs(plan.days_remaining)} ${Math.abs(plan.days_remaining) === 1 ? 'day' : 'days'}`
      : `${plan.days_remaining} ${plan.days_remaining === 1 ? 'day' : 'days'}`;
      
  return <section className="pp-card pp-summary" aria-labelledby="pp-summary-heading">
    <h2 id="pp-summary-heading">Your purchase plan</h2>
    <p className="pp-card-description">Your saved purchase quantity and deadline.</p>
    <dl className="pp-details">
      <div><dt>Quantity</dt><dd>{new Intl.NumberFormat('en-GB', { maximumFractionDigits: 20 }).format(plan.quantity_mt)} MT</dd></div>
      <div><dt>Purchase deadline</dt><dd><time dateTime={plan.purchase_deadline}>{formatDate(plan.purchase_deadline)}</time></dd></div>
      <div><dt>Historical scenario date</dt><dd><time dateTime={plan.scenario_as_of_date}>{formatDate(plan.scenario_as_of_date)}</time></dd></div>
      <div><dt>Time remaining</dt><dd>{timeRemaining}<span className="pp-time-note">Calculated from scenario date</span></dd></div>
    </dl>
    <div className="pp-actions">
      <PlanButton ref={deleteRef} variant="danger-outline" disabled={busy} onClick={onDelete}>Delete</PlanButton>
      <PlanButton ref={editRef} variant="secondary" disabled={busy} onClick={onEdit}>Edit</PlanButton>
      {!busy && <AppLink className="pp-button pp-button--primary" style={{ textDecoration: 'none' }} href="/purchase-plans/recommendation">View recommendation &rarr;</AppLink>}
    </div>
  </section>;
}
