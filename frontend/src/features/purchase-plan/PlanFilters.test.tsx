import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { PurchasePlanPage } from './PurchasePlanPage';
import { createMockPlanService } from './mockService';
import { DEMO_PLAN, DEMO_SCENARIO_DATE } from './fixtures';
import type { PlanStatus } from './types';

it('counts only drafts and submitted plans as active and filters finished records', async () => {
  window.history.replaceState(null, '', '/purchase-plans');
  const statuses: PlanStatus[] = ['draft', 'submitted', 'approved', 'rejected', 'withdrawn', 'purchased'];
  const service = createMockPlanService({ delayMs: 0, initialPlans: statuses.map((status, i) => ({ ...DEMO_PLAN, plan_id: `p${i}`, status })) });
  const user = userEvent.setup();
  render(<PurchasePlanPage service={service} scenarioDate={DEMO_SCENARIO_DATE} />);
  const summary = await screen.findByRole('region', { name: 'Plan summary' });
  expect(within(summary).getByText('Active plans').parentElement).toHaveTextContent('Active plans2');
  await user.click(screen.getByRole('button', { name: 'Finished' }));
  expect(screen.getByText('Purchased')).toBeVisible();
  expect(screen.getByText('Withdrawn')).toBeVisible();
  expect(screen.queryByText('Approved', { exact: true })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Open' }));
  expect(screen.getByText('Approved', { exact: true })).toBeVisible();
  expect(screen.queryByText('Purchased')).not.toBeInTheDocument();
});
