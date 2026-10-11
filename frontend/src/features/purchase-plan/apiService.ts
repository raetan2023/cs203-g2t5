import { PlanError, type PlanInput, type PurchasePlan, type PurchasePlanService } from './types';
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
  return { plan: p as PurchasePlan };
}

const messages: Record<string, string> = {
  GET: "We couldn't load your purchase plan. Please try again.",
  POST: "We couldn't save your plan. Your inputs are still here—try again.",
  PUT: "We couldn't save your changes. Your inputs are still here—try again.",
  DELETE: "We couldn't delete your purchase plan. Please try again.",
};

/** Talks to the backend's /api/v1/purchase-plan endpoints. */
export function createApiPlanService(options: ApiOptions = {}): PurchasePlanService {
  const baseUrl = (options.baseUrl ?? env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
  const getToken = options.getToken;

  async function request(method: string, body?: PlanInput) {
    // Plan routes are per-user, so the session token is the only credential they take.
    const token = getToken ? await getToken() : null;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/v1/purchase-plan`, {
        method,
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

    let payload: { plan?: unknown; detail?: string; field_errors?: Record<string, string> } = {};
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
    async read() {
      return parsePlan(await request('GET'));
    },
    async create(input) {
      return parsePlan(await request('POST', input), true);
    },
    async update(input) {
      return parsePlan(await request('PUT', input), true);
    },
    async delete() {
      await request('DELETE');
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
