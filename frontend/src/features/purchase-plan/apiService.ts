import { PlanError, type PlanInput, type PurchasePlan, type PurchasePlanService, type ApprovalNotification, type RecommendationSelection, type PlanResultContext, type DecisionInput, type ApprovalDecision } from './types';
import { parseAnalysis } from '../recommendations/apiService';
import { isValidDate } from './dates';

export interface ApiOptions {
  /** Backend base URL. Defaults to VITE_API_URL, then the local backend. */
  baseUrl?: string;
  /** Shared API key for the market-data routes, sent as X-API-Key. Defaults to VITE_API_KEY. */
  apiKey?: string;
  /**
   * Returns the signed-in user's session token, or null when nobody is signed in.
   * Called per request so a refreshed token is always used.
   */
  getToken?: () => Promise<string | null> | string | null;
}

const env = import.meta.env ?? {};

function parsePlan(payload: { plan?: unknown } | undefined, required: true): { plan: PurchasePlan };
function parsePlan(payload: { plan?: unknown } | undefined, required?: false): { plan: PurchasePlan | null };
function parsePlan(payload: { plan?: unknown } | undefined, required = false): { plan: PurchasePlan | null } {
  if (payload?.plan === null && !required) return { plan: null };
  const p = payload?.plan as Partial<PurchasePlan> | undefined;
  if (!p || typeof p.plan_id !== 'string' || !p.plan_id.trim()
    || typeof p.quantity_mt !== 'number' || !Number.isFinite(p.quantity_mt) || p.quantity_mt <= 0
    || typeof p.purchase_deadline !== 'string' || !isValidDate(p.purchase_deadline)
    || typeof p.scenario_as_of_date !== 'string' || !isValidDate(p.scenario_as_of_date)
    || typeof p.days_remaining !== 'number' || !Number.isSafeInteger(p.days_remaining)) {
    throw new PlanError('The purchase-plan response was invalid. Please retry.', {}, 502);
  }
  if (p.status !== undefined && !['draft', 'submitted', 'approved', 'rejected'].includes(p.status))
    throw new PlanError('The purchase-plan status was invalid. Please retry.', {}, 502);
  return { plan: p as PurchasePlan };
}

const messages: Record<string, string> = {
  GET: "We couldn't load your purchase plan. Please try again.",
  POST: "We couldn't save your plan. Your inputs are still here—try again.",
  PUT: "We couldn't save your changes. Your inputs are still here—try again.",
  DELETE: "We couldn't delete your purchase plan. Please try again.",
};

/** Talks to the backend's /api/v1/purchase-plans endpoints. */
export function createApiPlanService(options: ApiOptions = {}): PurchasePlanService {
  const baseUrl = (options.baseUrl ?? env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
  const getToken = options.getToken;

  async function request(method: string, body?: PlanInput | RecommendationSelection | DecisionInput, planId?: string, action?: string) {
    // Plan routes are per-user, so the session token is the only credential they take.
    const token = getToken ? await getToken() : null;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/v1/purchase-plans${planId ? `/${encodeURIComponent(planId)}` : ''}${action ? `/${action}` : ''}`, {
        method,
        cache: 'no-store',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(body && { 'Content-Type': 'application/json' }),
        },
        ...(body && { body: JSON.stringify(body) }),
      });
    } catch {
      // Network failure, backend not running, or a blocked cross-origin request.
      throw new PlanError(messages[method], {}, 0);
    }

    if (response.status === 204) return undefined;

    let payload: { plan?: unknown; plans?: unknown; notifications?: unknown; submission?: unknown; decision?: unknown; detail?: string; field_errors?: Record<string, string> } = {};
    try {
      const data: unknown = await response.json();
      if (data && typeof data === 'object' && !Array.isArray(data)) payload = data;
    } catch {
      // Keep the status-based message below rather than failing on an empty body.
    }

    if (!response.ok) {
      throw new PlanError(payload.detail ?? messages[method], payload.field_errors ?? {}, response.status);
    }
    return payload;
  }

  return {
    async submit(planId, selection) {
      if (!planId) throw new PlanError('Select a purchase plan first.', {}, 400);
      const result = parsePlan(await request('POST', selection, planId, 'submit'), true);
      if (result.plan.status !== 'submitted') throw new PlanError('The submission response was invalid. Reload your plans.', {}, 502);
      return result;
    },
    async decide(planId, input) {
      if (!planId) throw new PlanError('Select a submitted request first.', {}, 400);
      const saved = parsePlan(await request('POST', input, planId, 'decision'), true);
      if (saved.plan.status !== input.decision) throw new PlanError('Could not verify the decision. Reload the request.', {}, 502);
      return saved;
    },
    async readSubmission(planId) {
      if (!planId) throw new PlanError('Select a purchase plan first.', {}, 400);
      const payload = await request('GET', undefined, planId, 'submission');
      const value = payload?.decision as Partial<ApprovalDecision> | null | undefined;
      if (value != null && (!value || typeof value !== 'object'
          || typeof value.decision_id !== 'string' || !value.decision_id
          || !['approved', 'rejected'].includes(value.decision ?? '') || typeof value.comment !== 'string'
          || (value.decision === 'rejected' && !value.comment.trim())
          || typeof value.manager_clerk_user_id !== 'string' || !value.manager_clerk_user_id
          || typeof value.manager_label !== 'string' || !value.manager_label
          || typeof value.decided_at !== 'string' || !Number.isFinite(Date.parse(value.decided_at))))
        throw new PlanError('The approval decision response was invalid. Please retry.', {}, 502);
      const decision = value == null ? null : value as ApprovalDecision;
      if (payload?.submission === null) return { submission: null, decision };
      const snapshot = payload?.submission as { horizon_days?: number; analysis?: { context?: PlanResultContext } } | undefined;
      if (!snapshot || ![7, 14, 30].includes(snapshot.horizon_days ?? 0) || !snapshot.analysis?.context
          || snapshot.analysis.context.plan_id !== planId) throw new PlanError('The submitted recommendation was invalid.', {}, 502);
      return { submission: { horizon_days: snapshot.horizon_days as 7 | 14 | 30,
        analysis: parseAnalysis(snapshot.analysis, snapshot.analysis.context) }, decision };
    },
    async notifications() {
      const payload = await request('GET', undefined, undefined, 'approval-notifications');
      if (!Array.isArray(payload?.notifications) || payload.notifications.some((item: unknown) => {
        const n = item as Partial<ApprovalNotification> | null;
        return !n || typeof n.notification_id !== 'string' || !n.notification_id
          || typeof n.plan_id !== 'string' || !n.plan_id
          || typeof n.created_at !== 'string' || !Number.isFinite(Date.parse(n.created_at))
          || typeof n.quantity_mt !== 'number' || !Number.isFinite(n.quantity_mt) || n.quantity_mt <= 0
          || typeof n.purchase_deadline !== 'string' || !isValidDate(n.purchase_deadline)
          || !['submitted', 'approved', 'rejected'].includes(n.status ?? '');
      })) throw new PlanError('The approval inbox response was invalid. Please retry.', {}, 502);
      return { notifications: payload.notifications as ApprovalNotification[] };
    },
    async list() {
      const payload = await request('GET');
      if (!Array.isArray(payload?.plans)) throw new PlanError('The purchase-plan response was invalid. Please retry.', {}, 502);
      const plans = payload.plans.map(plan => parsePlan({ plan }, true).plan);
      if (new Set(plans.map(plan => plan.plan_id)).size !== plans.length) throw new PlanError('The purchase-plan response was invalid. Please retry.', {}, 502);
      return { plans };
    },
    async read(planId) {
      if (!planId) throw new PlanError('Select a purchase plan first.', {}, 400);
      try { return parsePlan(await request('GET', undefined, planId), true); }
      catch (error) {
        if (error instanceof PlanError && error.status === 404) return { plan: null };
        throw error;
      }
    },
    async create(input) {
      return parsePlan(await request('POST', input), true);
    },
    async update(planId, input) {
      if (!planId) throw new PlanError('Select a purchase plan first.', {}, 400);
      return parsePlan(await request('PUT', input, planId), true);
    },
    async delete(planId) {
      if (!planId) throw new PlanError('Select a purchase plan first.', {}, 400);
      await request('DELETE', undefined, planId);
    },
  };
}

/** The scenario date the backend treats as "today"; needed before any plan exists. */
export async function fetchScenarioDate(options: ApiOptions = {}): Promise<string> {
  const baseUrl = (options.baseUrl ?? env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
  const apiKey = options.apiKey ?? env.VITE_API_KEY ?? '';
  const response = await fetch(`${baseUrl}/api/v1/config`, {
    cache: 'no-store',
    headers: { ...(apiKey && { 'X-API-Key': apiKey }) },
  });
  if (!response.ok) throw new PlanError('Could not load the scenario date.', {}, response.status);
  const payload = (await response.json()) as { scenario_as_of_date?: unknown } | null;
  if (typeof payload?.scenario_as_of_date !== 'string' || !isValidDate(payload.scenario_as_of_date)) {
    throw new PlanError('The scenario date response was invalid. Please retry.', {}, 502);
  }
  return payload.scenario_as_of_date;
}
