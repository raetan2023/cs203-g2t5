import type { ApprovalDecision, NumericRange, PlanAnalysis, PurchasePlan, PurchaseRecord, PurchaseComparison, SubmissionResponse } from '../purchase-plan/types';
import { calendarDays, formatDate } from '../purchase-plan/dates';
import { actionLabel, amount, changeRange, compact, compactRange, dayDate, perMt, readableDates } from '../recommendations/format';

/** Where a submitted plan is in its life. Drafts never appear here: they belong on Purchase plans. */
export type Stage = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'completed';
export type Filter = 'all' | Stage;

export interface DecisionCard {
  plan: PurchasePlan;
  stage: Stage;
  /** Backend action code (BUY_NOW, WAIT, MONITOR, SPLIT) from the frozen submission, when it loaded. */
  action: string | null;
  title: string;
  /** The date the advice pointed at, when it named one. */
  buyDate: string | null;
  /** What the recommendation said, in the backend's words with readable dates. */
  said: string | null;
  /** Buying today, as the submission saw it. */
  referencePrice: number | null;
  referenceTotal: number | null;
  /** Forecast price range for the buy date. */
  forecastPrices: NumericRange | null;
  /** Reference total minus forecast total: positive means the advice expected to save. */
  expectedSaving: NumericRange | null;
  decision: ApprovalDecision | null;
  purchase: PurchaseRecord | null;
  /** Positive when the recorded purchase cost less than buying at submission time. */
  saved: number | null;
  withdrawnAt: string | null;
  /** Set when the plan's submission could not be read; the card then shows the plan alone. */
  detailError: string | null;
}

export interface Tiles { pending: number; approved: number; completed: number; saved: number | null }

export const STAGE_LABEL: Record<Stage, string> = {
  pending: 'Waiting for a manager', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn', completed: 'Completed',
};
export const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'pending', label: 'Pending approval' }, { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' }, { id: 'completed', label: 'Completed' },
];

export function stageOf(plan: PurchasePlan): Stage | null {
  switch (plan.status) {
    case 'submitted': return 'pending';
    case 'approved': return 'approved';
    case 'rejected': return 'rejected';
    case 'withdrawn': return 'withdrawn';
    case 'purchased': return 'completed';
    default: return null;
  }
}

const ready = <T,>(result: { status: 'ready'; value: T } | { status: 'unavailable' } | undefined): T | null =>
  result && result.status === 'ready' ? result.value : null;

/** The date the advice pointed at: the forecast's target, else the evidence's supported date. */
export function buyDateOf(analysis: PlanAnalysis): string | null {
  const guidance = ready(analysis.recommendation);
  const forecast = ready(analysis.forecast);
  return forecast?.target_date ?? guidance?.evidence?.supported_target_date ?? null;
}

export function titleOf(action: string | null, buyDate: string | null): string {
  if (!action) return 'Recommendation';
  if (action === 'WAIT' && buyDate) return `Wait, buy ${dayDate(buyDate)}`;
  return actionLabel(action);
}

/** Positive numbers mean the forecast was below buying today. Prefers the source's own saving range. */
export function expectedSavingOf(analysis: PlanAnalysis): NumericRange | null {
  const impact = ready(analysis.cost_impact);
  if (!impact) return null;
  if (impact.savings_total) return impact.savings_total;
  return { lower: -impact.difference_total.upper, upper: -impact.difference_total.lower };
}

/** Mirrors the backend comparison: quantity-adjusted reference first, then the plain one, then the snapshot. */
export function savedOf(comparison: PurchaseComparison | null | undefined, purchase: PurchaseRecord | null | undefined, referenceTotal: number | null, plannedQuantity: number): number | null {
  if (comparison) {
    const delta = comparison.actual_minus_adjusted_reference ?? comparison.actual_minus_reference;
    return delta == null ? null : -delta;
  }
  if (!purchase || referenceTotal == null || plannedQuantity <= 0) return null;
  const adjustedReference = referenceTotal * (purchase.quantity_mt / plannedQuantity);
  return adjustedReference - purchase.total_usd;
}

export function buildCard(plan: PurchasePlan, stage: Stage, response: SubmissionResponse | null, detailError: string | null = null): DecisionCard {
  const analysis = response?.submission?.analysis ?? null;
  const guidance = analysis ? ready(analysis.recommendation) : null;
  const reference = analysis ? ready(analysis.reference) : null;
  const impact = analysis ? ready(analysis.cost_impact) : null;
  const forecast = analysis ? ready(analysis.forecast) : null;
  const action = guidance?.action ?? null;
  const buyDate = analysis ? buyDateOf(analysis) : null;
  const referenceTotal = impact?.reference_total ?? guidance?.evidence?.buy_now_cost_usd ?? (reference ? reference.price * plan.quantity_mt : null);
  return {
    plan, stage, action, title: titleOf(action, buyDate), buyDate,
    said: guidance ? readableDates(guidance.explanation) : null,
    referencePrice: reference?.price ?? null,
    referenceTotal,
    forecastPrices: forecast?.prices ?? null,
    expectedSaving: analysis ? expectedSavingOf(analysis) : null,
    decision: response?.decision ?? null,
    purchase: response?.purchase ?? null,
    saved: stage === 'completed' ? savedOf(response?.comparison, response?.purchase, referenceTotal, plan.quantity_mt) : null,
    withdrawnAt: response?.withdrawal?.withdrawn_at ?? null,
    detailError,
  };
}

/** Newest submission first; plans without a submission time fall back to the nearest deadline. */
export function sortCards(cards: DecisionCard[]): DecisionCard[] {
  const key = (c: DecisionCard) => c.plan.submitted_at ? Date.parse(c.plan.submitted_at) : Date.parse(`${c.plan.purchase_deadline}T00:00:00Z`);
  return [...cards].sort((a, b) => key(b) - key(a));
}

export function tilesOf(cards: DecisionCard[]): Tiles {
  const completed = cards.filter(c => c.stage === 'completed');
  const measured = completed.filter(c => c.saved != null);
  return {
    pending: cards.filter(c => c.stage === 'pending').length,
    approved: cards.filter(c => c.stage === 'approved').length,
    completed: completed.length,
    saved: measured.length ? measured.reduce((sum, c) => sum + (c.saved as number), 0) : null,
  };
}

/** The search box matches the tonnage or the deadline, in any of the forms the page prints them. */
export function matches(card: DecisionCard, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { quantity_mt, purchase_deadline } = card.plan;
  const haystack = [
    String(quantity_mt), amount(quantity_mt), purchase_deadline, formatDate(purchase_deadline), dayDate(purchase_deadline, true), card.title,
  ].join(' ').toLowerCase();
  return q.split(/\s+/).every(word => haystack.includes(word));
}

export function filterCards(cards: DecisionCard[], filter: Filter, query: string): DecisionCard[] {
  return cards.filter(c => (filter === 'all' || c.stage === filter) && matches(c, query));
}

/* Display helpers. Totals shorten above a million like the recommendation page does. */
export const usdCompact = (value: number) => `USD ${compact(value)}`;
export const usdRange = (range: NumericRange) => `USD ${compactRange(range.lower, range.upper)}`;
export const pricePerMt = (value: number) => `$${perMt(value)}/MT`;

/** "Fri 06 Nov 2026, 8:57 am" for timestamps the person acted at; these stay in local time. */
export function dateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(date).replace(',', '');
  const time = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date).replace(/\s?(am|pm)/i, ' $1').toLowerCase();
  return `${day}, ${time}`;
}

/** "in 30 days", "today", "3 days ago" for a date-only string against the scenario date. */
export function relativeDays(from: string, to: string): string {
  const days = calendarDays(from, to);
  if (days === 0) return 'today';
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`;
  return `${-days} day${days === -1 ? '' : 's'} ago`;
}

/** Positive is a saving. Wording never implies the forecast was certain. */
export function expectedSavingText(range: NumericRange): string | null {
  if (range.upper <= 0) return `Expected to cost ${usdRange({ lower: -range.upper, upper: -range.lower })} more`;
  if (range.lower <= 0) return `Expected change: ${changeRange(-range.upper, -range.lower)}`;
  return `Expected saving ≈ ${usdRange(range)}`;
}
