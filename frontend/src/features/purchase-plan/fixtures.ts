import type { PurchasePlan } from './types';

// Explicitly synthetic. This is the backend's configured demo date, never today's date.
export const DEMO_SCENARIO_DATE = '2025-10-24';
export const DEMO_PLAN: PurchasePlan = {
  plan_id: '8a9d4260-9070-4bb1-b5af-a71f458a3f47',
  quantity_mt: 500,
  purchase_deadline: '2025-11-15',
  scenario_as_of_date: DEMO_SCENARIO_DATE,
  days_remaining: 22,
};
