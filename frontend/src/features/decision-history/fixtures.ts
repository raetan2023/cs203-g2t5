import type { ApprovalDecision, PlanAnalysis, PurchasePlan, PurchasePlanService, SubmissionResponse } from '../purchase-plan/types';
import { PlanError } from '../purchase-plan/types';

/** Sample data for the decision history tests and its layout preview: one plan at each stage, plus a draft that must stay hidden. */
export const DECISION_FIXTURE_TODAY = '2026-11-06';

const plan = (id: string, status: PurchasePlan['status'], quantity_mt: number, purchase_deadline: string, submitted_at: string | null = '2026-11-06T00:57:00Z'): PurchasePlan =>
  ({ plan_id: id, status, quantity_mt, purchase_deadline, scenario_as_of_date: DECISION_FIXTURE_TODAY, days_remaining: 20, submitted_at });

export const analysisFixture = (id: string, action: string, explanation: string, options: { target?: string; reference?: number; forecast?: [number, number]; quantity: number }): PlanAnalysis => {
  const { target = '2026-12-06', reference = 1351.5, forecast = [1100, 1180], quantity } = options;
  const basis = { commodity: 'MGO', currency: 'USD', unit: 'MT' };
  return {
    source: 'api', approval_fingerprint: `fp-${id}`,
    context: { plan_id: id, quantity_mt: quantity, purchase_deadline: '2027-07-06', scenario_as_of_date: DECISION_FIXTURE_TODAY },
    reference: { status: 'ready', value: { price: reference, observation_date: DECISION_FIXTURE_TODAY, basis } },
    forecast: { status: 'ready', value: { prices: { lower: forecast[0], upper: forecast[1] }, target_date: target, basis, range_description: 'Likely range' } },
    cost_impact: { status: 'ready', value: { currency: 'USD', target_date: target, reference_total: reference * quantity,
      forecast_total: { lower: forecast[0] * quantity, upper: forecast[1] * quantity },
      difference_total: { lower: (forecast[0] - reference) * quantity, upper: (forecast[1] - reference) * quantity } } },
    recommendation: { status: 'ready', value: { recommendation_id: `rec-${id}`, action, explanation } },
  };
};

const decision = (decision: 'approved' | 'rejected', comment = ''): ApprovalDecision => ({
  decision_id: `d-${decision}`, decision, comment, manager_clerk_user_id: 'user_m', manager_label: 'Alex Tan', decided_at: '2026-11-06T03:15:00Z',
});

export const PENDING_PLAN = plan('p1', 'submitted', 888, '2026-11-26');
export const APPROVED_PLAN = plan('p2', 'approved', 6767, '2027-07-06', '2026-11-05T09:00:00Z');
export const REJECTED_PLAN = plan('p3', 'rejected', 500, '2026-12-20', '2026-11-04T09:00:00Z');
export const COMPLETED_PLAN = plan('p4', 'purchased', 1000, '2026-11-20', '2026-11-01T09:00:00Z');
export const WITHDRAWN_PLAN = plan('p5', 'withdrawn', 250, '2026-12-01', '2026-11-02T09:00:00Z');
export const DRAFT_PLAN = plan('p6', 'draft', 999, '2026-12-31', null);
export const ALL_FIXTURE_PLANS = [DRAFT_PLAN, COMPLETED_PLAN, PENDING_PLAN, REJECTED_PLAN, APPROVED_PLAN, WITHDRAWN_PLAN];

export const SUBMISSION_FIXTURES: Record<string, SubmissionResponse> = {
  p1: { submission: { horizon_days: 7, analysis: analysisFixture('p1', 'MONITOR', 'Get a current supplier quote first.', { quantity: 888, forecast: [1300, 1400] }) }, decision: null },
  p2: { submission: { horizon_days: 30, analysis: analysisFixture('p2', 'WAIT', 'Prices are expected to ease by 2026-12-06.', { quantity: 6767 }) }, decision: decision('approved') },
  p3: { submission: { horizon_days: 7, analysis: analysisFixture('p3', 'BUY_NOW', 'Buy now.', { quantity: 500 }) }, decision: decision('rejected', 'Budget is frozen until January.') },
  p4: { submission: { horizon_days: 7, analysis: analysisFixture('p4', 'BUY_NOW', 'Buy now.', { quantity: 1000, reference: 1351.5 }) }, decision: decision('approved'),
    purchase: { purchase_id: 'pu', purchased_on: '2026-11-07', supplier: 'Sing Fuels', quantity_mt: 1000, price_usd_per_mt: 1300, note: '', total_usd: 1_300_000, recorded_at: '2026-11-07T02:00:00Z' },
    comparison: { currency: 'USD', planned_quantity_mt: 1000, actual_quantity_mt: 1000, same_quantity: true, actual_total: 1_300_000, reference_total: 1_351_500, central_total: null, forecast_total: null,
      actual_minus_reference: -51_500, actual_minus_estimate: null, reference_total_for_actual_quantity: 1_351_500, estimate_total_for_actual_quantity: null, actual_minus_adjusted_reference: -51_500, actual_minus_adjusted_estimate: null } },
  p5: { submission: { horizon_days: 7, analysis: analysisFixture('p5', 'WAIT', 'Wait.', { quantity: 250 }) }, decision: null, withdrawal: { reason: 'Vessel rerouted', withdrawn_at: '2026-11-03T01:00:00Z' } },
};

/** A plan service that only lists and reads submissions; everything else is unused by the page. */
export function createDecisionFixtureService(plans: PurchasePlan[], overrides: Partial<PurchasePlanService> = {}, delayMs = 0): PurchasePlanService {
  const unused = () => Promise.reject(new Error('not used by the decision history page'));
  const after = <T,>(value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), delayMs));
  return {
    list: () => after({ plans }),
    readSubmission: (id) => SUBMISSION_FIXTURES[id] ? after(SUBMISSION_FIXTURES[id]) : Promise.reject(new PlanError('No saved purchase plan was found.', {}, 404)),
    read: unused, create: unused, update: unused, delete: unused,
    ...overrides,
  };
}
