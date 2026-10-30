import { AppLink } from '../../../app/router';
import { formatDate } from '../dates';
import type { PurchasePlan, PurchasePlanService } from '../types';
import { Icon, PlanButton } from './Primitives';
import { PlanDecisionNote } from './PlanDecisionNote';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';

/** A plan is "due soon" within this many days of its deadline (presentation rule, not stored). */
export const DUE_SOON_DAYS = 7;

export function PurchasePlanSummary({ plan, service, onEdit, onDelete, editRef, deleteRef, busy = false, canEdit = true, saved = false }: {
  plan: PurchasePlan;
  /** Reads a decided plan's manager note; without it the card shows the status only. */
  service?: PurchasePlanService;
  busy?: boolean;
  canEdit?: boolean;
  /** Just created or edited: the card briefly highlights (presentation only). */
  saved?: boolean;
  onEdit(): void;
  onDelete(): void;
  editRef?: RefObject<HTMLButtonElement | null>;
  /** Focus target for the plan's delete flow: the "more actions" button, since Delete lives in its menu. */
  deleteRef?: RefObject<HTMLButtonElement | null>;
}) {
  const headingId = useId();
  const draft = !plan.status || plan.status === 'draft';
  const quantity = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 20 }).format(plan.quantity_mt);
  const final = !!plan.status && ['approved', 'rejected', 'withdrawn', 'purchased'].includes(plan.status);
  const overdue = plan.days_remaining < 0;
  const days = Math.abs(plan.days_remaining);
  const unit = days === 1 ? 'day' : 'days';
  const status = final ? 'finished' : overdue ? 'overdue' : days <= DUE_SOON_DAYS ? 'soon' : 'on-track';

  // Guide: docs/ui-revamp/assets/inspo/purchase-plans-page/image.png. Quantity leads; deadline and time left follow.
  return <section className={`pp-card pp-summary pp-summary--${status}${saved ? ' pp-summary--saved' : ''}`} aria-labelledby={headingId}>
    <div className="pp-summary-top">
      <div className="pp-summary-badges">{!final && <span className={`pp-badge pp-badge--${status}`}>
        <Icon name={overdue ? 'alert' : 'clock'} />{overdue ? 'Overdue' : status === 'soon' ? 'Due soon' : 'On track'}
      </span>}
      {/* No pill for drafts (the normal, editable state); submitted / approved / rejected keep theirs. */}
      {plan.status && !draft && <span className={`pp-plan-status pp-plan-status--${plan.status}`}>{plan.status === 'submitted' ? 'Submitted for approval' : plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}</span>}
      </div>
      {canEdit && draft && <PlanMenu quantity={quantity} busy={busy} triggerRef={deleteRef} onDelete={onDelete} />}
    </div>
    <h3 id={headingId} className="pp-summary-title">
      {/* Read as one phrase; drawn with a smaller unit. */}
      <span className="pp-summary-qty">
        <span className="pp-sr-only">{quantity} MT</span>
        <span aria-hidden="true">{quantity}<span className="pp-summary-unit">MT</span></span>
      </span>{' '}
      <span className="pp-summary-due">Due <time dateTime={plan.purchase_deadline}>{formatDate(plan.purchase_deadline)}</time></span>
    </h3>
    {!final && <p className="pp-countdown">
      {overdue
        ? <span className="pp-countdown-value">Overdue by {days} {unit}</span>
        : <><span className="pp-countdown-value">{days} {unit}</span> {days === 0 ? 'left · due today' : 'left'}</>}
    </p>}
    {plan.previous_plan_id && <p><AppLink href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(plan.previous_plan_id)}`}>View previous plan</AppLink></p>}
    <PlanDecisionNote plan={plan} service={service} />
    <div className="pp-actions">
      {!busy && <AppLink className="pp-button pp-button--primary pp-summary-link" href={`/purchase-plans/recommendation?plan_id=${encodeURIComponent(plan.plan_id)}`}>{draft ? 'View recommendation' : plan.status === 'submitted' ? 'View submitted recommendation' : plan.status === 'approved' && canEdit ? 'View decision / record purchase' : plan.status === 'purchased' ? 'View purchase record' : plan.status === 'withdrawn' ? 'View withdrawn request' : 'View decision'} &rarr;</AppLink>}
      {canEdit && draft && <PlanButton ref={editRef} variant="secondary" disabled={busy} onClick={onEdit}>Edit</PlanButton>}
    </div>
  </section>;
}

/** Disclosure menu for less frequent actions. Delete still opens the same confirmation dialog. */
function PlanMenu({ quantity, busy, triggerRef, onDelete }: {
  quantity: string; busy: boolean; triggerRef?: RefObject<HTMLButtonElement | null>; onDelete(): void;
}) {
  const [open, setOpen] = useState(false);
  const localTrigger = useRef<HTMLButtonElement>(null);
  const trigger = triggerRef ?? localTrigger;
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!menu.current?.parentElement?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useEffect(() => { if (busy) setOpen(false); }, [busy]);

  return <div className="pp-menu" onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button ref={trigger} type="button" className="pp-menu-trigger" aria-label={`More actions for ${quantity} MT plan`}
      aria-expanded={open} aria-controls={menuId} disabled={busy} onClick={() => setOpen(value => !value)}>
      <Icon name="more" />
    </button>
    <div ref={menu} id={menuId} className="pp-menu-list" hidden={!open}>
      <button type="button" className="pp-menu-item pp-menu-item--danger" onClick={() => {
        // Focus the trigger first so the dialog returns focus there when it closes.
        trigger.current?.focus();
        setOpen(false);
        onDelete();
      }}><Icon name="trash" />Delete</button>
    </div>
  </div>;
}
