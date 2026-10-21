import type { ApiOptions } from '../purchase-plan/apiService';
import { isValidDate } from '../purchase-plan/dates';
import { PlanError, type AvailableResult, type PlanAnalysis, type PlanResultContext, type PriceBasis, type NumericRange, type ResultUnavailableReason } from '../purchase-plan/types';
import { sameContext, type RecommendationService } from './service';

const invalid = () => new PlanError('The analysis response was invalid. Please retry.', {}, 502);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid();
  return value;
}
function number(value: unknown, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value < 0)) throw invalid();
  return value;
}
function date(value: unknown): string {
  const result = text(value);
  if (!isValidDate(result)) throw invalid();
  return result;
}
function basis(value: unknown): PriceBasis {
  const v = object(value);
  return { commodity: text(v.commodity), currency: text(v.currency), unit: text(v.unit) };
}
function range(value: unknown, positive = false): NumericRange {
  const v = object(value), lower = number(v.lower, positive), upper = number(v.upper, positive);
  if (lower > upper) throw invalid();
  return { lower, upper };
}
const reasons = new Set(['missing_forecast', 'missing_reference', 'unsupported_horizon', 'incompatible_basis', 'invalid_bounds', 'recommendation_unavailable']);
function result<T>(value: unknown, parse: (v: Record<string, unknown>) => T): AvailableResult<T> {
  const v = object(value);
  if (v.status === 'ready') return { status: 'ready', value: parse(object(v.value)) };
  if (v.status !== 'unavailable' || !reasons.has(text(v.reason))) throw invalid();
  return { status: 'unavailable', reason: v.reason as ResultUnavailableReason, message: text(v.message) };
}

/** Validate every transport value before exposing it to display components. Never derive totals here. */
export function parseAnalysis(payload: unknown, expected: PlanResultContext): PlanAnalysis {
  const v = object(payload), c = object(v.context);
  const context = { plan_id: text(c.plan_id), quantity_mt: number(c.quantity_mt), purchase_deadline: date(c.purchase_deadline), scenario_as_of_date: date(c.scenario_as_of_date) };
  if (context.quantity_mt <= 0) throw invalid();
  if (!sameContext(context, expected)) throw new PlanError('Your saved plan or scenario changed. Reload the purchase plan.', {}, 409);
  if (!['fixture', 'model', 'unavailable'].includes(text(v.provenance))) throw invalid();
  const analysis: PlanAnalysis = {
    source: 'api', provenance: v.provenance as PlanAnalysis['provenance'], context,
    reference: result(v.reference, r => ({ price: number(r.price, true), observation_date: date(r.observation_date), basis: basis(r.basis) })),
    forecast: result(v.forecast, f => {
      const prices = range(f.prices, true);
      const central = f.central_estimate == null ? undefined : number(f.central_estimate, true);
      if (central !== undefined && (central < prices.lower || central > prices.upper)) throw invalid();
      return { prices, target_date: date(f.target_date), basis: basis(f.basis), range_description: text(f.range_description),
        ...(central !== undefined && { central_estimate: central }),
        ...(f.horizon_description != null && { horizon_description: text(f.horizon_description) }) };
    }),
    recommendation: result(v.recommendation, r => ({ recommendation_id: text(r.recommendation_id), action: text(r.action), explanation: text(r.explanation) })),
    cost_impact: result(v.cost_impact, i => {
      if (i.currency !== 'USD') throw invalid();
      const forecast = range(i.forecast_total, true);
      const central = i.central_total == null ? undefined : number(i.central_total, true);
      if (central !== undefined && (central < forecast.lower || central > forecast.upper)) throw invalid();
      return { currency: 'USD' as const, target_date: date(i.target_date), reference_total: number(i.reference_total, true),
        forecast_total: forecast, difference_total: range(i.difference_total),
        ...(central !== undefined && { central_total: central }),
        ...(i.savings_total != null && { savings_total: range(i.savings_total) }) };
    }),
  };
  if (analysis.cost_impact.status === 'ready') {
    if (analysis.reference.status !== 'ready' || analysis.forecast.status !== 'ready') throw invalid();
    const r = analysis.reference.value, f = analysis.forecast.value;
    if (r.basis.commodity !== f.basis.commodity || r.basis.currency !== 'USD' || f.basis.currency !== 'USD'
      || r.basis.unit !== 'MT' || f.basis.unit !== 'MT' || analysis.cost_impact.value.target_date !== f.target_date
      || r.observation_date > context.scenario_as_of_date || f.target_date < context.scenario_as_of_date) throw invalid();
  }
  if (analysis.provenance === 'unavailable' && [analysis.reference, analysis.forecast, analysis.recommendation, analysis.cost_impact].some(r => r.status === 'ready')) throw invalid();
  return analysis;
}

export function createApiRecommendationService(options: ApiOptions = {}): RecommendationService {
  const base = (options.baseUrl ?? import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
  async function read(endpoint: string, context: PlanResultContext) {
    const token = await options.getToken?.();
    if (!token) throw new PlanError('Please sign in again.', {}, 401);
    const query = new URLSearchParams({ plan_id: context.plan_id, quantity_mt: String(context.quantity_mt),
      purchase_deadline: context.purchase_deadline, scenario_as_of_date: context.scenario_as_of_date });
    let response: Response;
    try {
      response = await fetch(`${base}/api/v1/purchase-plans/${endpoint}?${query}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
    } catch { throw new PlanError('Could not reach the analysis service. Please retry.', {}, 0); }
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new PlanError('The analysis service returned an unreadable response.', {}, response.ok ? 502 : response.status); }
    if (!response.ok) {
      const detail = payload && typeof payload === 'object' && 'detail' in payload && typeof payload.detail === 'string' ? payload.detail : 'Could not load analysis. Please retry.';
      throw new PlanError(detail, {}, response.status);
    }
    return parseAnalysis(payload, context);
  }
  return { read: context => read('recommendation', context), readImpact: context => read('cost-impact', context) };
}
