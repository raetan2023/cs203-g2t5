// Buyer's own answer to a recommendation: accept / reject / ignore, with an
// optional reason, kept as a decision log. Each entry is tied to the
// recommendation version (recommendation_id) the buyer saw.
//
// Stored locally (localStorage) for now so the flow works end to end without a
// backend; a server sync is the next step. Keeping it in one module means the
// store can be swapped for an API call later without touching the UI.

const KEY = 'bb:buyer-decisions';
const ACTIONS = ['accept', 'reject', 'ignore'];

export function getDecisions() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Latest recorded decision for a given recommendation version (newest first).
export function getDecisionFor(recommendationId) {
  if (!recommendationId) return null;
  return getDecisions().find((d) => d.recommendation_id === recommendationId) || null;
}

export function recordDecision({ planId, recommendationId, runId, action, decision, reason } = {}) {
  if (!recommendationId) throw new Error('A current recommendation is required to record a decision.');
  if (!ACTIONS.includes(decision)) throw new Error('Choose accept, reject or ignore.');
  if (decision === 'reject' && !String(reason || '').trim()) {
    throw new Error('A reason is required when rejecting a recommendation.');
  }
  const entry = {
    id: `${recommendationId}:${Date.now()}`,
    plan_id: planId ?? null,
    recommendation_id: recommendationId,
    run_id: runId ?? null,
    action: action ?? null,
    decision,
    reason: String(reason || '').trim(),
    decided_at: new Date().toISOString(),
  };
  const next = [entry, ...getDecisions()]; // append, newest first, full history kept
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return entry;
}
