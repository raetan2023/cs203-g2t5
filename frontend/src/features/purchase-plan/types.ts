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
