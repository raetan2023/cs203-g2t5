import type { ForecastService, Horizon, ReadyForecast } from '../features/forecast/apiService';
import { buildMockForecast } from '../features/forecast/mockService';
import type { RecommendationService } from '../features/recommendations/service';
import { RECOMMENDATION_DEMO_PLAN } from '../features/recommendations/mockService';
import type { CurrentRecommendation, PlanAnalysis, PlanResultContext, PurchasePlan } from '../features/purchase-plan/types';

/**
 * Fixed preview data for the Monitor, Buy now and Wait mockups (docs/ui-revamp/assets/inspo/recommendations-page).
 * Guidance values were worked out by hand from RecommendationPolicy deadline-weighted-v1; nothing here runs a policy.
 */
export type RecommendationScenario = 'monitor' | 'buy' | 'wait';
export const SCENARIO_DATE = '2026-10-28';
const QUOTE_DATE = '2026-10-26', PRICE = 1352, QUANTITY = 47;
const basis = { commodity: 'MGO', currency: 'USD', unit: 'MT' };
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const SCENARIOS: Record<RecommendationScenario, { deadline: string; prices: Record<Horizon, [number, number, number]>; guidance: CurrentRecommendation }> = {
  monitor: {
    deadline: '2026-11-05',
    prices: { 7: [1200, 1352, 1386], 14: [1020, 1352, 1596], 30: [1178, 1352, 1735] },
    guidance: guidance('monitor', 'MONITOR', 'Monitor prices. The weighted uncertainty range overlaps today\'s price, so the buying direction is uncertain.', {
      direction: 'FLAT', interval_width_fraction: 0.1376, alternative_cost_usd: 63544, alternative_minus_now_usd: 0, supported_target_date: SCENARIO_DATE,
      reasons: ['8 calendar days remain until the saved deadline 2026-11-05.', 'Excluded forecast for 2026-11-09: after the purchase deadline.',
        'Excluded forecast for 2026-11-25: after the purchase deadline.', 'Used the 2026-11-02 forecast at 100% weight: it is the only eligible forecast.',
        'Eligible price signal: $1352.00/mt; weighted uncertainty range $1200.00–$1386.00/mt.',
        'Compared buying today at $1352.00/mt with 1 eligible forecasts. Up to two nearest eligible targets form the signal; uncertainty can require monitoring.',
        'Estimated savings: $0.00/mt; $0.00 for 47 MT.', 'Review fresh prices before committing; do not wait beyond 2026-11-05.'],
      blended: false }),
  },
  buy: {
    deadline: '2026-11-30',
    prices: { 7: [1370, 1402, 1445], 14: [1380, 1436, 1520], 30: [1395, 1478, 1610] },
    guidance: guidance('buy', 'BUY_NOW', 'Buy today. The eligible forecast signal does not offer a saving over today\'s reference price.', {
      direction: 'UP', interval_width_fraction: 0.1484, alternative_cost_usd: 63544, alternative_minus_now_usd: 0, supported_target_date: SCENARIO_DATE,
      reasons: ['33 calendar days remain until the saved deadline 2026-11-30.',
        'Blended signal: 80.77% of the 2026-11-25 forecast ($1478.00/mt) + 19.23% of the 2026-11-09 forecast ($1436.00/mt). Weights use inverse distance to the deadline.',
        'Eligible price signal: $1469.92/mt; weighted uncertainty range $1392.12–$1592.69/mt.',
        'Compared buying today at $1352.00/mt with 3 eligible forecasts. Up to two nearest eligible targets form the signal; uncertainty can require monitoring.',
        'Estimated savings: $0.00/mt; $0.00 for 47 MT.'],
      blended: true }),
  },
  wait: {
    deadline: '2026-11-30',
    prices: { 7: [1290, 1330, 1365], 14: [1240, 1285, 1330], 30: [1180, 1240, 1300] },
    guidance: guidance('wait', 'WAIT', 'Buy in 28 days (2026-11-25). Estimated MGO price signal is $1248.65/mt, representing a potential saving of $103.35/mt compared with buying today.', {
      direction: 'DOWN', interval_width_fraction: 0.0845, alternative_cost_usd: 58686.73, alternative_minus_now_usd: -4857.27, supported_target_date: '2026-11-25',
      reasons: ['33 calendar days remain until the saved deadline 2026-11-30.',
        'Blended signal: 80.77% of the 2026-11-25 forecast ($1240.00/mt) + 19.23% of the 2026-11-09 forecast ($1285.00/mt). Weights use inverse distance to the deadline.',
        'Eligible price signal: $1248.65/mt; weighted uncertainty range $1191.54–$1305.77/mt.',
        'Compared buying today at $1352.00/mt with 3 eligible forecasts. Up to two nearest eligible targets form the signal; uncertainty can require monitoring.',
        'Estimated savings: $103.35/mt; $4857.27 for 47 MT.'],
      blended: true }),
  },
};

function guidance(name: string, action: string, explanation: string, e: {
  direction: string; interval_width_fraction: number; alternative_cost_usd: number; alternative_minus_now_usd: number;
  supported_target_date: string; reasons: string[]; blended: boolean;
}): CurrentRecommendation {
  const { blended, ...rest } = e;
  return { recommendation_id: `preview-${name}`, action, explanation, evidence: {
    ...rest, policy_version: 'deadline-weighted-v1', urgency: 'NORMAL', buy_now_cost_usd: PRICE * QUANTITY, reference_age_days: 2,
    horizon_description: 'One deadline-based comparison of today against the weighted eligible forecast signal.', allocations: [],
    limitations: ['Forecast savings are estimates, not guaranteed. Obtain a current supplier quote before buying.',
      'Reference prices are dated observations, not executable quotes. Costs exclude freight, fees and taxes.',
      'Only available 7, 14 and 30 day forecasts are compared; no prices are interpolated between targets.',
      ...(blended ? ['The blend is a timing signal, not a forecast for the recommended date or a split purchase schedule.'] : []),
      'Weighted uncertainty bounds are a descriptive signal, not a calibrated confidence interval.'],
  } };
}

export function scenarioPlan(scenario: RecommendationScenario): PurchasePlan {
  const deadline = SCENARIOS[scenario].deadline;
  return { plan_id: RECOMMENDATION_DEMO_PLAN.plan_id, status: 'draft', quantity_mt: QUANTITY, purchase_deadline: deadline,
    scenario_as_of_date: SCENARIO_DATE, days_remaining: Math.round((Date.parse(deadline) - Date.parse(SCENARIO_DATE)) / 86_400_000) };
}

export function createScenarioForecastService(scenario: RecommendationScenario): ForecastService {
  return { async read(horizon) {
    const [low, forecast, high] = SCENARIOS[scenario].prices[horizon];
    return { ...buildMockForecast(horizon), run_id: `preview-${scenario}`, forecast_origin_date: QUOTE_DATE, anchor_quote_date: QUOTE_DATE,
      anchor_price: PRICE, target_date: addDays(QUOTE_DATE, horizon), forecast, low, high, model_version: `ridge-${horizon}d-sha256-preview00000000`,
      source_dates: { mgo: QUOTE_DATE }, news_window_start: `${QUOTE_DATE}T00:00:00Z`, news_window_end: `${SCENARIO_DATE}T00:00:00Z`,
      interval: { method: 'experimental_gdelt_scaled_quantiles', nominal_coverage: null, empirical_coverage: null, evaluation_rows: 0,
        baseline_coverage: null, baseline_mean_width: null, mean_width: null, evaluation_scope: 'Synthetic preview; not evaluated',
        limitations: 'Illustrative prices and ranges. No measured coverage or model performance.' } } as ReadyForecast;
  } };
}

export function createScenarioRecommendationService(scenario: RecommendationScenario, delayMs = 600): RecommendationService {
  const { deadline, prices, guidance } = SCENARIOS[scenario];
  async function read(context: PlanResultContext, horizon: Horizon = 7): Promise<PlanAnalysis> {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    const [low, central, high] = prices[horizon];
    const target = addDays(QUOTE_DATE, horizon);
    const q = context.quantity_mt, reference = PRICE * q;
    return {
      source: 'mock', provenance: 'fixture', context: { ...context, urgency: context.urgency ?? 'NORMAL' },
      reference: { status: 'ready', value: { price: PRICE, observation_date: QUOTE_DATE, basis } },
      forecast: { status: 'ready', value: { prices: { lower: low, upper: high }, central_estimate: central, target_date: target, basis,
        run_id: `preview-${scenario}`, model_version: `ridge-${horizon}d-sha256-preview00000000`,
        range_description: 'Synthetic preview range; no measured confidence coverage.' } },
      cost_impact: target > deadline
        ? { status: 'unavailable', reason: 'unsupported_horizon', message: `The forecast targets ${target}, after your purchase deadline of ${deadline}. No cost estimate is available within this purchase window.` }
        : { status: 'ready', value: { currency: 'USD', target_date: target, reference_total: reference, central_total: central * q,
          forecast_total: { lower: low * q, upper: high * q }, difference_total: { lower: low * q - reference, upper: high * q - reference } } },
      recommendation: { status: 'ready', value: guidance },
    };
  }
  return { read, readImpact: read };
}
