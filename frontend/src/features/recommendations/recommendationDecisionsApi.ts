import type { ApiOptions } from '../purchase-plan/apiService';
import { PlanError } from '../purchase-plan/types';

export interface BuyerDecision {
  id: string;
  plan_id: string | null;
  recommendation_id: string;
  run_id: string | null;
  action: string | null;
  decision: 'accept' | 'reject' | 'ignore';
  reason: string;
  decided_at: string;
}

export interface RecordDecisionInput {
  recommendationId: string;
  runId?: string | null;
  action?: string | null;
  decision: 'accept' | 'reject' | 'ignore';
  reason?: string;
}

export interface RecommendationDecisionsService {
  record(planId: string, input: RecordDecisionInput): Promise<BuyerDecision>;
  history(planId?: string): Promise<BuyerDecision[]>;
}

const invalid = () => new PlanError('The decision response was invalid. Please retry.', {}, 502);
const ACTIONS = new Set(['accept', 'reject', 'ignore']);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function str(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid();
  return value;
}
function nullableStr(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw invalid();
  return value;
}
function parseDecision(value: unknown): BuyerDecision {
  const v = object(value);
  const decision = str(v.decision);
  if (!ACTIONS.has(decision)) throw invalid();
  return {
    id: str(v.id),
    plan_id: nullableStr(v.plan_id),
    recommendation_id: str(v.recommendation_id),
    run_id: nullableStr(v.run_id),
    action: nullableStr(v.action),
    decision: decision as BuyerDecision['decision'],
    reason: typeof v.reason === 'string' ? v.reason : '',
    decided_at: str(v.decided_at),
  };
}

export function createRecommendationDecisionsService(options: ApiOptions = {}): RecommendationDecisionsService {
  const base = (options.baseUrl ?? import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');

  async function authHeader(): Promise<Record<string, string>> {
    const token = await options.getToken?.();
    if (!token) throw new PlanError('Please sign in again.', {}, 401);
    return { Authorization: `Bearer ${token}` };
  }

  async function readJson(response: Response): Promise<Record<string, unknown>> {
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new PlanError('The service returned an unreadable response.', {}, response.ok ? 502 : response.status); }
    if (!response.ok) {
      const detail = payload && typeof payload === 'object' && 'detail' in payload && typeof payload.detail === 'string'
        ? payload.detail : 'Could not save your decision. Please retry.';
      throw new PlanError(detail, {}, response.status);
    }
    return object(payload);
  }

  return {
    async record(planId, input) {
      const headers = { ...(await authHeader()), 'Content-Type': 'application/json' };
      const body = JSON.stringify({
        recommendation_id: input.recommendationId,
        run_id: input.runId ?? null,
        action: input.action ?? null,
        decision: input.decision,
        reason: input.reason ?? '',
      });
      let response: Response;
      try {
        response = await fetch(`${base}/api/v1/purchase-plans/${encodeURIComponent(planId)}/recommendation-decision`,
          { method: 'POST', headers, body, cache: 'no-store' });
      } catch { throw new PlanError('Could not reach the service. Please retry.', {}, 0); }
      const payload = await readJson(response);
      return parseDecision(payload.decision);
    },
    async history(planId) {
      const headers = await authHeader();
      const query = planId ? `?plan_id=${encodeURIComponent(planId)}` : '';
      let response: Response;
      try {
        response = await fetch(`${base}/api/v1/purchase-plans/recommendation-decisions${query}`,
          { headers, cache: 'no-store' });
      } catch { throw new PlanError('Could not reach the service. Please retry.', {}, 0); }
      const payload = await readJson(response);
      if (!Array.isArray(payload.decisions)) throw invalid();
      return payload.decisions.map(parseDecision);
    },
  };
}
