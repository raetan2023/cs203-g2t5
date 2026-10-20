import type { PlanAnalysis, PlanAnalysisState, PlanResultContext, PurchasePlan } from './types';

// Explicitly synthetic. This is the backend's configured demo date, never today's date.
export const DEMO_SCENARIO_DATE = '2025-10-24';
export const DEMO_PLAN: PurchasePlan = {
  plan_id: '8a9d4260-9070-4bb1-b5af-a71f458a3f47',
  quantity_mt: 500,
  purchase_deadline: '2025-11-15',
  scenario_as_of_date: DEMO_SCENARIO_DATE,
  days_remaining: 22,
};

/** Synthetic Sprint 4 examples only. No model output or real-request fallback. */
export const ANALYSIS_MOCK_LABEL = 'Mock data - demonstration only';
export const ANALYSIS_DEMO_PLAN: PurchasePlan = { ...DEMO_PLAN, quantity_mt: 100 };
export const ANALYSIS_DEMO_CONTEXT: PlanResultContext = {
  plan_id: ANALYSIS_DEMO_PLAN.plan_id,
  quantity_mt: 100,
  purchase_deadline: '2025-11-15',
  scenario_as_of_date: DEMO_SCENARIO_DATE,
};

export const DEMO_ANALYSIS: PlanAnalysis = {
  source: 'mock',
  context: ANALYSIS_DEMO_CONTEXT,
  reference: { status: 'ready', value: {
    price: 700, observation_date: '2025-10-24',
    basis: { commodity: 'MGO', currency: 'USD', unit: 'MT' },
  } },
  forecast: { status: 'ready', value: {
    prices: { lower: 680, upper: 740 }, target_date: '2025-11-15',
    basis: { commodity: 'MGO', currency: 'USD', unit: 'MT' },
    range_description: 'Synthetic illustrative bounds; no calibrated confidence level.',
  } },
  cost_impact: { status: 'ready', value: {
    currency: 'USD', reference_total: 70000,
    forecast_total: { lower: 68000, upper: 74000 },
    difference_total: { lower: -2000, upper: 4000 },
  } },
  recommendation: { status: 'ready', value: {
    recommendation_id: 'synthetic-recommendation-1',
    action: 'Consider buying earlier',
    explanation: 'Synthetic wording for layout testing, not advice derived from these price bounds.',
  } },
};

const missingForecast = {
  status: 'unavailable', reason: 'missing_forecast', message: 'No forecast is available for this plan and scenario.',
} as const;
const noRecommendation = {
  status: 'unavailable', reason: 'recommendation_unavailable', message: 'Purchase guidance is not available.',
} as const;
const unsupportedHorizon = {
  status: 'unavailable', reason: 'unsupported_horizon', message: 'The purchase deadline is outside the supported forecast horizon.',
} as const;
const incompatibleBasis = {
  status: 'unavailable', reason: 'incompatible_basis', message: 'Gasoil prices in USD per barrel cannot be compared with MGO prices in USD per metric tonne.',
} as const;

/** Read-only by convention; consumers should clone fixtures before mutating them. */
export const PLAN_ANALYSIS_FIXTURES = {
  noPlan: { status: 'no_plan' },
  loading: { status: 'loading', context: ANALYSIS_DEMO_CONTEXT },
  failedRequest: { status: 'error', context: ANALYSIS_DEMO_CONTEXT, message: 'Could not load purchase analysis. Please retry.' },
  ready: { status: 'loaded', analysis: DEMO_ANALYSIS },
  planWithoutForecast: { status: 'loaded', analysis: {
    ...DEMO_ANALYSIS, forecast: missingForecast, cost_impact: missingForecast, recommendation: noRecommendation,
  } },
  predictionsOnly: { status: 'loaded', analysis: { ...DEMO_ANALYSIS, recommendation: noRecommendation } },
  unsupportedHorizon: { status: 'loaded', analysis: {
    ...DEMO_ANALYSIS, forecast: unsupportedHorizon, cost_impact: unsupportedHorizon, recommendation: noRecommendation,
  } },
  incompatibleBasis: { status: 'loaded', analysis: {
    ...DEMO_ANALYSIS,
    forecast: { status: 'ready', value: {
      prices: { lower: 80, upper: 90 }, target_date: '2025-11-15',
      basis: { commodity: 'Gasoil', currency: 'USD', unit: 'bbl' },
      range_description: 'Synthetic bounds for an incompatible commodity and unit.',
    } },
    cost_impact: incompatibleBasis, recommendation: noRecommendation,
  } },
  changedScenario: {
    status: 'stale', context: { ...ANALYSIS_DEMO_CONTEXT, scenario_as_of_date: '2025-11-01' }, previous: DEMO_ANALYSIS,
  },
} satisfies Record<string, PlanAnalysisState>;

/** Expected refreshed backend result for the changed-scenario example: 14 calendar days. */
export const CHANGED_SCENARIO_DEMO_PLAN: PurchasePlan = {
  ...ANALYSIS_DEMO_PLAN, scenario_as_of_date: '2025-11-01', days_remaining: 14,
};
