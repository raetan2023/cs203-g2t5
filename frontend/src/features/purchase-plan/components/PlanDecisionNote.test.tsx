import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PlanDecisionNote } from './PlanDecisionNote';
import { DEMO_PLAN } from '../fixtures';

it('says a purchase was recorded without an amount, since a purchase is always the whole plan', () => {
  const plan = { ...DEMO_PLAN, quantity_mt: 200, status: 'purchased' as const, submitted_at: '2026-11-01T00:00:00Z' };
  const view = render(<PlanDecisionNote plan={plan} canAct={false} />);
  expect(screen.getByText('Purchase recorded. Open this plan to see the actual cost and saved estimate.')).toBeVisible();
  expect(screen.queryByText(/Bought/)).not.toBeInTheDocument();
  view.unmount();
  render(<PlanDecisionNote plan={plan} canAct />);
  expect(screen.getByText('Purchase recorded. See the actual cost and saved estimate.')).toBeVisible();
});

it.each([
  ['deadline_passed', 'Closed because it was not bought by the purchase deadline. It can no longer be bought.'],
  ['role_change', 'Closed because the officer is no longer a procurement officer. It can no longer be bought.'],
  [undefined, 'This plan was closed and can no longer be bought.'],
] as const)('gives the closed reason %s, and does not guess one when it is missing', (closed_reason, text) => {
  render(<PlanDecisionNote plan={{ ...DEMO_PLAN, status: 'closed', closed_reason }} canAct />);
  expect(screen.getByText(text)).toBeVisible();
});
