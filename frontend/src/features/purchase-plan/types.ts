export type PlanStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export interface ApprovalNotification {
  notification_id: string;
  plan_id: string;
  created_at: string;
  quantity_mt: number;
  purchase_deadline: string;
  status: PlanStatus;
}

export interface PurchasePlan {
  /** Optional for standalone previews created before the approval workflow. */
  status?: PlanStatus;
  submitted_at?: string | null;
  plan_id: string;
  quantity_mt: number;
  purchase_deadline: string;
  scenario_as_of_date: string;
  days_remaining: number;
}

export interface RecommendationSelection {
  horizon_days: 7 | 14 | 30;
  run_id: string;
  recommendation_id: string;
  approval_fingerprint: string;
  urgency: Urgency;
  quantity_mt: number;
  purchase_deadline: string;
  scenario_as_of_date: string;
}
export interface ApprovalDecision {
  decision_id: string;
  decision: 'approved' | 'rejected';
  comment: string;
  manager_clerk_user_id: string;
  manager_label: string;
  decided_at: string;
}
export interface DecisionInput {
  decision: 'approved' | 'rejected';
  comment: string;
  approval_fingerprint: string;
}
export interface SubmittedRecommendation { horizon_days: 7 | 14 | 30; analysis: PlanAnalysis }

export interface PlanInput {
  quantity_mt: number;
  purchase_deadline: string;
}

export interface PlansResponse { plans: PurchasePlan[] }
export interface PlanResponse { plan: PurchasePlan | null }
export interface SavedPlanResponse { plan: PurchasePlan }

/** Analysis view models. The API adapter validates the Sprint 4 transport contract. */
export type Urgency = 'LOW' | 'NORMAL' | 'HIGH';

export interface PlanResultContext {
  urgency?: Urgency;
  plan_id: string;
  quantity_mt: number;
  purchase_deadline: string;
  /** Active historical date used for this result; never the device clock. */
  scenario_as_of_date: string;
}

export interface PriceBasis {
  commodity: string;
  currency: string;
  unit: string;
}

export interface ReferencePrice {
  price: number;
  observation_date: string;
  basis: PriceBasis;
}

export interface NumericRange { lower: number; upper: number }

export interface PlanForecast {
  run_id?: string;
  model_version?: string;
  central_estimate?: number;
  prices: NumericRange;
  target_date: string;
  basis: PriceBasis;
  /** Source-supplied meaning; do not invent a confidence percentage. */
  range_description: string;
  /** Optional source-supplied coverage description; never inferred from device time. */
  horizon_description?: string;
}

export type ResultUnavailableReason =
  | 'missing_forecast'
  | 'missing_reference'
  | 'unsupported_horizon'
  | 'incompatible_basis'
  | 'invalid_bounds'
  | 'recommendation_unavailable';

export type AvailableResult<T> =
  | { status: 'ready'; value: T }
  | { status: 'unavailable'; reason: ResultUnavailableReason; message: string };

/** Backend-supplied totals for comparable USD/MT prices; display only. */
export interface PlanCostImpact {
  /** Date actually used by the source for these totals. */
  target_date?: string;
  central_total?: number;
  /** Optional source-supplied reference-minus-forecast range, not realized savings. */
  savings_total?: NumericRange;
  currency: 'USD';
  reference_total: number;
  forecast_total: NumericRange;
  /** Forecast total minus reference total; not realized savings. */
  difference_total: NumericRange;
}

export interface RecommendationEvidence {
  policy_version: string;
  urgency: Urgency;
  direction: string;
  interval_width_fraction: number | null;
  buy_now_cost_usd: number | null;
  alternative_cost_usd: number | null;
  alternative_minus_now_usd: number | null;
  reference_age_days: number | null;
  supported_target_date: string | null;
  horizon_description: string | null;
  reasons: string[];
  limitations: string[];
  allocations: { date: string; quantity_mt: number }[];
}
export interface CurrentRecommendation {
  evidence?: RecommendationEvidence;
  recommendation_id: string;
  action: string;
  explanation: string;
}

export interface PlanAnalysis {
  source: 'mock' | 'api';
  approval_fingerprint?: string;
  provenance?: 'fixture' | 'model' | 'unavailable';
  context: PlanResultContext;
  reference: AvailableResult<ReferencePrice>;
  forecast: AvailableResult<PlanForecast>;
  cost_impact: AvailableResult<PlanCostImpact>;
  recommendation: AvailableResult<CurrentRecommendation>;
}

/** Local UI states: loading/error/stale are not proposed HTTP response bodies. */
export type PlanAnalysisState =
  | { status: 'no_plan' }
  | { status: 'loading'; context: PlanResultContext }
  | { status: 'error'; context: PlanResultContext; message: string }
  | { status: 'loaded'; analysis: PlanAnalysis }
  | { status: 'stale'; context: PlanResultContext; previous: PlanAnalysis };

export type FieldErrors = Partial<Record<keyof PlanInput, string>>;

/** Wunna's future request-helper adapter can implement this interface. */
export interface PurchasePlanService {
  submit?(planId: string, selection: RecommendationSelection): Promise<SavedPlanResponse>;
  decide?(planId: string, input: DecisionInput): Promise<SavedPlanResponse>;
  readSubmission?(planId: string): Promise<{ submission: SubmittedRecommendation | null; decision?: ApprovalDecision | null }>;
  notifications?(): Promise<{ notifications: ApprovalNotification[] }>;
  list(): Promise<PlansResponse>;
  read(planId: string): Promise<PlanResponse>;
  create(input: PlanInput): Promise<SavedPlanResponse>;
  update(planId: string, input: PlanInput): Promise<SavedPlanResponse>;
  delete(planId: string): Promise<void>;
}

export class PlanError extends Error {
  constructor(public detail: string, public field_errors: FieldErrors = {}, public status = 500) {
    super(detail);
    this.name = 'PlanError';
  }
}

export function requestError(error: unknown): PlanError {
  return error instanceof PlanError ? error : new PlanError('Something went wrong. Please try again.');
}
