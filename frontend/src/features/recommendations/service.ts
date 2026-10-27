import type { PlanAnalysis, PlanResultContext } from '../purchase-plan/types';

/** Independent analysis reads; apiService maps the authenticated backend contract. */
export interface RecommendationService {
  read(context: PlanResultContext, horizonDays?: number, runId?: string): Promise<PlanAnalysis>;
  readImpact?(context: PlanResultContext, horizonDays?: number, runId?: string): Promise<PlanAnalysis>;
}

export function sameContext(a: PlanResultContext, b: PlanResultContext) {
  return (a.urgency ?? 'NORMAL') === (b.urgency ?? 'NORMAL') && a.plan_id === b.plan_id && a.quantity_mt === b.quantity_mt
    && a.purchase_deadline === b.purchase_deadline && a.scenario_as_of_date === b.scenario_as_of_date;
}
