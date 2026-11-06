import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { PlanAnalysis, PurchasePlan } from '../purchase-plan/types';
import { EvidenceView } from './RecommendationEvidence';

const plan: PurchasePlan = { plan_id: '20bf680d-f6ed-440c-a201-08f42f3ca13c', status: 'submitted', quantity_mt: 998,
  purchase_deadline: '2026-12-10', scenario_as_of_date: '2026-11-20', days_remaining: 20 };
const analysis = {
  context: { plan_id: plan.plan_id, quantity_mt: 998, purchase_deadline: '2026-12-10', scenario_as_of_date: '2026-11-07' },
  reference: { status: 'ready', value: { price: 1351.5, observation_date: '2026-10-26', basis: { commodity: 'MGO', currency: 'USD', unit: 'MT' } } },
  forecast: { status: 'ready', value: { target_date: '2026-12-07', range_description: 'Experimental news-adjusted bounds; no measured coverage.', model_version: 'ridge-decision-gdelt-v1' } },
  cost_impact: { status: 'unavailable' },
  recommendation: { status: 'ready', value: { recommendation_id: 'rec-1', action: 'WAIT', explanation: 'Buy in 30 days.', evidence: {
    policy_version: 'deadline-weighted-v1', urgency: 'NORMAL', direction: 'DOWN', interval_width_fraction: 0.3, horizon_description: 'One deadline-based comparison.',
    buy_now_cost_usd: 1348797, alternative_cost_usd: 1169812.59, alternative_minus_now_usd: -178984.41, reference_age_days: 12, supported_target_date: '2026-12-07',
    signal_price: 1172.16, signal_low: 870.3, signal_high: 1213.17, allocations: [],
    signal_inputs: [{ target_date: '2026-12-07', weight: 0.8636, price: 1185.38 }, { target_date: '2026-11-21', weight: 0.1364, price: 1088.39 }],
    reasons: ['33 calendar days remain until the saved deadline 2026-12-10.'],
    limitations: ['Forecast savings are estimates, not guaranteed. Obtain a current supplier quote before buying.',
      'The blend is a timing signal, not a forecast for the recommended date or a split purchase schedule.',
      'Weighted uncertainty bounds are a descriptive signal, not a calibrated confidence interval.',
      'Timing uses the news-aware Ridge central estimate, including when the reference is dated. Wide ranges and quote age remain limitations, not automatic Monitor overrides.',
      'The reference observation is 12 days old. Check a current supplier quote.'],
  } } },
} as unknown as PlanAnalysis;

it('explains the saved recommendation in plain words, using the figures from submission', () => {
  render(<EvidenceView analysis={analysis} plan={plan} />);
  for (const text of [
    'You have 33 days until your purchase deadline on Thu 10 Dec 2026.',
    'The decision combines two forecasts: the 30-day forecast (Mon 07 Dec) at 86% weight and 14-day forecast (Sat 21 Nov) at 14% weight. These are the two closest to your deadline, and the closer one counts more.',
    'So we suggest waiting and buying on Mon 07 Dec 2026, before your deadline.',
  ]) expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.getAllByRole('listitem').length).toBeLessThanOrEqual(12);
  expect(document.body.textContent).not.toMatch(/calendar days|Policy|Ridge|snapshot|q10|inverse distance/i);
});
