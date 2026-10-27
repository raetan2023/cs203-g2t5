import { formatDate } from '../purchase-plan/dates';

/** Display-only formatting for the recommendation page; never changes a calculation. */
export const amount = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
export const price = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
export const usd = (value: number) => `USD ${amount(value)}`;

export function compact(value: number) {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000_000) return `${price(value / 1_000_000_000)}bn`;
  if (magnitude >= 1_000_000) return `${price(value / 1_000_000)}m`;
  return amount(value);
}

/** Totals stay exact below a million and shorten above it, so very large plans stay readable. */
export const total = (value: number) => `USD ${compact(value)}`;
export const totalRange = (lower: number, upper: number) => `USD ${compact(lower)}–${compact(upper)}`;

/** Signed difference against buying today, worded without implying a direction is good or bad. */
export function change(value: number) {
  if (value === 0) return 'no change';
  const magnitude = Math.abs(value);
  const formatted = magnitude >= 100_000 && magnitude < 1_000_000
    ? `${amount(Math.round(magnitude / 1_000))}k` : compact(magnitude);
  return `USD ${formatted} ${value < 0 ? 'less' : 'more'}`;
}

export const changeRange = (lower: number, upper: number) => `${change(lower)} to ${change(upper)}`;

/** "Thu 05 Nov" or, with the year, "Thu 05 Nov 2026"; date-only strings stay in UTC. */
export function dayDate(value: string, withYear = false) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`)).replace(',', '');
}

/** Backend explanations carry ISO dates; show them in the page's date format. */
export const readableDates = (text: string) => text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (_, iso: string) => formatDate(iso));

export const ACTION_LABELS: Record<string, string> = { BUY_NOW: 'Buy now', WAIT: 'Wait', MONITOR: 'Monitor', SPLIT: 'Split purchase' };
export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action;
