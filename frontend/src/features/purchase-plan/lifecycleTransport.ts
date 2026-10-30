import { isValidDate } from './dates';
import { PlanError, type BuyerNotificationsResponse, type PurchaseRecord, type PurchaseComparison, type SubmissionResponse } from './types';

const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === 'string' && !!v.trim();
const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown) => number(v) && (v as number) > 0;
function invalid(): never { throw new PlanError('The purchase outcome response was invalid. Please reload.', {}, 502); }

export function parseOutcomes(payload: unknown): Pick<SubmissionResponse, 'purchase' | 'comparison' | 'withdrawal' | 'revision_plan_ids'> {
  const p = object(payload), purchase = object(p.purchase), comparison = object(p.comparison), withdrawal = object(p.withdrawal);
  if (p.purchase != null && (!text(purchase.purchase_id) || !isValidDate(String(purchase.purchased_on)) || !text(purchase.supplier)
      || !positive(purchase.quantity_mt) || !positive(purchase.price_usd_per_mt) || !positive(purchase.total_usd)
      || !timestamp(purchase.recorded_at) || (purchase.note != null && typeof purchase.note !== 'string'))) invalid();
  if (p.withdrawal != null && (typeof withdrawal.reason !== 'string' || !timestamp(withdrawal.withdrawn_at))) invalid();
  if (p.comparison != null) {
    if (p.purchase == null || comparison.currency !== 'USD' || !positive(comparison.planned_quantity_mt)
        || !positive(comparison.actual_quantity_mt) || !positive(comparison.actual_total) || typeof comparison.same_quantity !== 'boolean') invalid();
    for (const key of ['reference_total', 'central_total', 'actual_minus_reference', 'actual_minus_estimate',
      'reference_total_for_actual_quantity', 'estimate_total_for_actual_quantity', 'actual_minus_adjusted_reference', 'actual_minus_adjusted_estimate'])
      if (comparison[key] != null && !number(comparison[key])) invalid();
    if (comparison.forecast_total != null) {
      const range = object(comparison.forecast_total);
      if (!positive(range.lower) || !positive(range.upper) || (range.lower as number) > (range.upper as number)) invalid();
    }
  }
  if (p.revision_plan_ids != null && (!Array.isArray(p.revision_plan_ids) || !p.revision_plan_ids.every(text))) invalid();
  return { purchase: p.purchase == null ? null : purchase as unknown as PurchaseRecord,
    comparison: p.comparison == null ? null : comparison as unknown as PurchaseComparison,
    withdrawal: p.withdrawal == null ? null : withdrawal as { reason: string; withdrawn_at: string },
    revision_plan_ids: p.revision_plan_ids == null ? [] : p.revision_plan_ids as string[] };
}

export function parseBuyerNotifications(payload: unknown): BuyerNotificationsResponse {
  const p = object(payload);
  if (!Array.isArray(p.notifications) || !Number.isSafeInteger(p.unread_count) || (p.unread_count as number) < 0) invalid();
  for (const value of p.notifications as unknown[]) {
    const n = object(value);
    if (!text(n.notification_id) || !text(n.plan_id) || !['approved', 'rejected'].includes(String(n.decision))
        || !timestamp(n.created_at) || (n.seen_at !== null && !timestamp(n.seen_at)) || !positive(n.quantity_mt)
        || !isValidDate(String(n.purchase_deadline)) || !text(n.manager_label) || typeof n.comment !== 'string') invalid();
  }
  const ids = (p.notifications as { notification_id: string }[]).map(n => n.notification_id);
  if (new Set(ids).size !== ids.length) invalid();
  return p as unknown as BuyerNotificationsResponse;
}
