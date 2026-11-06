/** Display-only helpers shared by the market blocks; nothing here changes a stored value. */

/** Older than this, a value is called out, matching the quote-age rule on the recommendation page. */
export const STALE_AFTER_DAYS = 7;

/** Whole calendar days between two ISO dates, ignoring time zones. */
export function daysOld(observedDate: string, today: string) {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${observedDate}T00:00:00Z`)) / 86_400_000);
}

export const ageLabel = (days: number) => `${days} ${days === 1 ? 'day' : 'days'} old`;

/** Typographic minus, so negative figures line up with the arrows beside them. */
export const withMinus = (text: string) => text.replace('-', '−');

/** Today in Singapore, for screens rendered before the application date is known. */
export const singaporeToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
