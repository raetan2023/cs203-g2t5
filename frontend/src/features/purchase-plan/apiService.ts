import { PlanError, type PlanInput, type PurchasePlanService } from './types';

export interface ApiOptions {
  /** Backend base URL. Defaults to VITE_API_URL, then the local backend. */
  baseUrl?: string;
  /**
   * Returns the signed-in user's session token, or null when nobody is signed in.
   * Called per request so a refreshed token is always used.
   */
  getToken?: () => Promise<string | null> | string | null;
}

const env = import.meta.env ?? {};

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
      payload = await response.json();
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
      return (await request('GET')) as { plan: never };
    },
    async create(input) {
      return (await request('POST', input)) as { plan: never };
    },
    async update(input) {
      return (await request('PUT', input)) as { plan: never };
    },
    async delete() {
      await request('DELETE');
    },
  };
}

/** The scenario date the backend treats as "today"; needed before any plan exists. */
export async function fetchScenarioDate(options: ApiOptions = {}): Promise<string> {
  const baseUrl = (options.baseUrl ?? env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/v1/config`);
  if (!response.ok) throw new PlanError('Could not load the scenario date.', {}, response.status);
  const payload = (await response.json()) as { scenario_as_of_date: string };
  return payload.scenario_as_of_date;
}
