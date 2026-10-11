import { DEMO_ANALYSIS, DEMO_PLAN } from '../purchase-plan/fixtures';
import type { PlanAnalysis } from '../purchase-plan/types';
import type { RecommendationService } from './service';

export const RECOMMENDATION_DEMO_PLAN = { ...DEMO_PLAN, quantity_mt: 100, purchase_deadline: '2025-10-30', days_remaining: 6 };
export type RecommendationExample = 'ready' | 'unavailable' | 'missing-forecast' | 'unsupported';

/** Fixed layout examples, never a recommendation algorithm or API fallback. */
export function createMockRecommendationService(options: { example?: RecommendationExample; delayMs?: number; impactDelayMs?: number; failOnce?: boolean; impactFailOnce?: boolean } = {}): RecommendationService {
  let fail = options.failOnce;
  let impactFail = options.impactFailOnce;
  function example(context: PlanAnalysis['context']): PlanAnalysis {
    const result: PlanAnalysis = structuredClone(DEMO_ANALYSIS);
    result.context = { ...context };
    result.cost_impact = { status: 'ready', value: { currency: 'USD', target_date: '2025-10-29', reference_total: 70000, forecast_total: { lower: 67000, upper: 70000 }, difference_total: { lower: -3000, upper: 0 }, savings_total: { lower: 0, upper: 3000 }, central_total: 68500 } };
    result.forecast = { status: 'ready', value: {
      prices: { lower: 670, upper: 700 }, target_date: '2025-10-29',
      central_estimate: 685,
      basis: { commodity: 'MGO', currency: 'USD', unit: 'MT' },
      range_description: 'Synthetic illustrative bounds; no calibrated confidence level.',
      horizon_description: 'Seven-day demo forecast from 24 October 2025, covering 25–31 October 2025.',
    } };
    result.recommendation = { status: 'ready', value: {
      recommendation_id: 'synthetic-recommendation-29-oct',
      action: 'Consider purchasing on 29 October',
      explanation: 'This date has the lowest central forecast price within your remaining purchase window. Forecast uncertainty remains.',
    } };
    // Only this exact fixture has invented guidance. Other saved inputs remain usable.
    if (options.example === 'unsupported' || context.scenario_as_of_date !== '2025-10-24' || context.purchase_deadline !== '2025-10-30' || context.quantity_mt !== 100) {
      result.forecast = { status: 'unavailable', reason: 'unsupported_horizon', message: 'No synthetic forecast is configured for these saved inputs and historical scenario.' };
      result.cost_impact = result.forecast;
      result.recommendation = { status: 'unavailable', reason: 'recommendation_unavailable', message: 'No synthetic recommendation is configured for this plan and scenario.' };
    } else if (options.example === 'missing-forecast') {
      result.forecast = { status: 'unavailable', reason: 'missing_forecast', message: 'No forecast is available for this plan and scenario.' };
      result.cost_impact = result.forecast;
      result.recommendation = { status: 'unavailable', reason: 'missing_forecast', message: 'Guidance is unavailable while forecast data is missing.' };
    } else if (options.example === 'unavailable') {
      result.recommendation = { status: 'unavailable', reason: 'recommendation_unavailable', message: 'Forecast data is available, but purchase guidance is not available.' };
    }
    return result;
  }
  return {
    async read(context) {
      await new Promise(resolve => setTimeout(resolve, options.delayMs ?? 700));
      if (fail) { fail = false; throw new Error('Synthetic request failure.'); }
      return example(context);
    },
    async readImpact(context) {
      await new Promise(resolve => setTimeout(resolve, options.impactDelayMs ?? options.delayMs ?? 700));
      if (impactFail) { impactFail = false; throw new Error('Synthetic impact failure.'); }
      return example(context);
    },
  };
}
