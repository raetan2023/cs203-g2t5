// Small shared helpers for the forecast widget.

// Readable labels for the model's raw feature names. Anything not listed
// falls back to a tidied version of the raw name.
const DRIVER_LABELS = {
  hsfo_lag1: 'High-sulphur fuel oil (prev day)',
  vlsfo_lag1: 'Very-low-sulphur fuel oil (prev day)',
  brent_fred_lag1: 'Brent crude (prev day)',
  dubai_crude_investing_lag1: 'Dubai crude (prev day)',
  sg_gasoil_investing_lag1: 'Singapore gasoil (prev day)',
  sg_gasoil_investing_ret20: 'Singapore gasoil 20-day trend',
  usd_index_lag1: 'USD index (prev day)',
  mgo_lag_price: 'Last MGO quote',
};

export function driverLabel(feature) {
  if (DRIVER_LABELS[feature]) return DRIVER_LABELS[feature];
  // Fallback: strip common suffixes, replace underscores.
  return String(feature || '')
    .replace(/_lag\d+$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Derive UP / DOWN / FLAT from forecast vs anchor (small band = FLAT).
export function deriveDirection(forecast, anchor) {
  if (forecast == null || anchor == null) return 'flat';
  const diff = forecast - anchor;
  if (diff > 1) return 'up';
  if (diff < -1) return 'down';
  return 'flat';
}

export function formatDate(dStr) {
  if (!dStr) return '';
  try {
    const d = new Date(dStr + (dStr.length === 10 ? 'T00:00:00Z' : ''));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    }
  } catch (e) {}
  return dStr;
}

export function formatShortDate(dStr) {
  if (!dStr) return '';
  try {
    const d = new Date(dStr + (dStr.length === 10 ? 'T00:00:00Z' : ''));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    }
  } catch (e) {}
  return dStr;
}

export function addDays(dStr, n) {
  // UTC math so the date never shifts by a day across timezones.
  const d = new Date(dStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Evidence label metadata: display text + CSS modifier.
export const EVIDENCE = {
  supported: { text: 'supported', tone: 'supported' },
  weak: { text: 'weak', tone: 'weak' },
  no_edge: { text: 'no edge', tone: 'no_edge' },
};

export function evidenceMeta(evidence) {
  return EVIDENCE[evidence] || { text: evidence || 'unknown', tone: 'weak' };
}
