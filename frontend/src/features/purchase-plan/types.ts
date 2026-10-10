export interface PurchasePlan {
  plan_id: string;
  quantity_mt: number;
  purchase_deadline: string;
  scenario_as_of_date: string;
  days_remaining: number;
}

export interface PlanInput {
  quantity_mt: number;
  purchase_deadline: string;
}

export interface PlanResponse { plan: PurchasePlan | null }
export interface SavedPlanResponse { plan: PurchasePlan }

/** Provisional frontend models, NOT agreed backend JSON. See the Sprint 4 API draft. */
export interface PlanResultContext {
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

export interface CurrentRecommendation {
  recommendation_id: string;
  action: string;
  explanation: string;
}

export interface PlanAnalysis {
  source: 'mock' | 'api';
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
  read(): Promise<PlanResponse>;
  create(input: PlanInput): Promise<SavedPlanResponse>;
  update(input: PlanInput): Promise<SavedPlanResponse>;
  delete(): Promise<void>;
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
