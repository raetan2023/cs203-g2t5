import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { RecommendationEvidence } from '../purchase-plan/types';
import { CalculationSteps } from './CalculationSteps';
import type { Column } from './TimingComparison';

const column = (id: 14 | 30, date: string, late = false) => ({ id, label: `${id} days`, date, low: 1, mid: 1, high: 1, observed: false, late, past: false, forecast: {} }) as Column;
const evidence = (overrides: Partial<RecommendationEvidence>): RecommendationEvidence => ({ policy_version: 'v1', urgency: 'NORMAL', direction: 'DOWN', interval_width_fraction: .1,
  buy_now_cost_usd: 13000, alternative_cost_usd: 12000, alternative_minus_now_usd: -1000, reference_age_days: 1, supported_target_date: '2026-11-25', horizon_description: null,
  reasons: [], limitations: [], allocations: [], signal_price: 1200, signal_low: 1100, signal_high: 1250, signal_inputs: [{ target_date: '2026-11-25', weight: 1, price: 1200 }], ...overrides });
const show = (e: RecommendationEvidence, action: string, columns = [column(14, '2026-11-09', true), column(30, '2026-11-25')]) =>
  render(<CalculationSteps evidence={e} action={action} columns={columns} deadline="2026-11-26" quantity={10} />);

it('explains a Wait: one forecast on its own, the expected saving and the date', () => {
  show(evidence({}), 'WAIT');
  expect(screen.getByText('30-day')).toBeVisible();
  expect(screen.getByText('It lands before your Thu 26 Nov deadline.')).toBeVisible();
  expect(screen.getByText('Uses the 30-day forecast on its own.')).toBeVisible();
  expect(screen.getByText('Expected saving')).toBeVisible();
  expect(screen.getByText('Today is USD 1,300.00/MT, so waiting could cost about USD 1,000 less.')).toBeVisible();
  expect(screen.getByText(/so buying on Wed 25 Nov is expected to cost less/)).toBeVisible();
});

it('explains a Buy now when forecasts sit above today', () => {
  show(evidence({ signal_price: 1400, signal_low: 1350, signal_high: 1450, supported_target_date: '2026-11-06' }), 'BUY_NOW');
  expect(screen.getByText('No expected saving')).toBeVisible();
  expect(screen.getByText('Today is USD 1,300.00/MT, so waiting could cost about USD 1,000 more.')).toBeVisible();
  expect(screen.getByText(/buying today is the better option/)).toBeVisible();
});

it('names only the cause that applies to a Monitor', () => {
  show(evidence({ signal_price: 1300, signal_low: 1250, signal_high: 1350 }), 'MONITOR');
  expect(screen.getByText('The range overlaps today’s price, so the direction is uncertain.')).toBeVisible();
});

it('stays out of the way for saved or illustrative evidence with no signal', () => {
  const { container } = show(evidence({ signal_price: undefined, signal_inputs: undefined }), 'WAIT');
  expect(container).toBeEmptyDOMElement();
});
