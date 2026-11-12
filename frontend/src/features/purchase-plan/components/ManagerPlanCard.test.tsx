import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ManagerPlanCard } from './ManagerPlanCard';
import { DEMO_PLAN } from '../fixtures';
import type { PurchasePlanService } from '../types';

const decided = (decision: 'approved' | 'rejected', comment = '') => ({ decision_id: 'd1', decision, comment, manager_clerk_user_id: 'user_pm',
  manager_label: 'Wunna Aung', decided_at: '2026-11-02T15:54:00Z' });
const service = (reply: object) => ({ readSubmission: vi.fn().mockResolvedValue({ submission: null, buyer_label: 'Rae Tan', ...reply }) }) as unknown as PurchasePlanService;
const plan = (status: 'approved' | 'purchased' | 'rejected') => ({ ...DEMO_PLAN, quantity_mt: 500, status, submitted_at: '2026-11-01T15:54:04Z' });

it('shows the status on top, then who submitted, when, and the outcome', async () => {
  const { container } = render(<ManagerPlanCard plan={plan('approved')} service={service({ decision: decided('approved') })} />);
  expect(await screen.findByText('Rae Tan')).toBeVisible();
  expect(screen.getByText('01 Nov 2026, 23:54:04')).toBeVisible();
  expect(screen.getByText('Approved by Wunna Aung · 02 Nov 2026, 23:54:00')).toBeVisible();
  expect(screen.getByRole('link', { name: /View decision/ })).toBeVisible();
  // An approved plan still to be bought, in the top-right corner with a clock symbol.
  const status = container.querySelector('.pp-card-top .pp-tag')!;
  expect(status).toHaveTextContent('to buy');
  expect(status).toHaveClass('pp-tag--to-buy');
  expect(status.querySelector('svg')).not.toBeNull();
});

it('shows the approval but no amount for a purchase, and the reason for a rejection', async () => {
  const purchase = { purchase_id: 'p1', quantity_mt: 495, price_usd_per_mt: 640, purchased_on: '2026-11-03', supplier: 'S', note: '', total_usd: 316800, recorded_at: '2026-11-03T00:00:00Z' };
  const view = render(<ManagerPlanCard plan={plan('purchased')} service={service({ decision: decided('approved'), purchase })} />);
  expect(await screen.findByText('Approved by Wunna Aung · 02 Nov 2026, 23:54:00')).toBeVisible();
  // A purchase is always the whole plan, so there is no "Bought … of … planned" line.
  expect(screen.queryByText(/Bought/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /View purchase record/ })).toBeVisible();
  expect(view.container.querySelector('.pp-tag--purchased')).toHaveTextContent('purchased');
  view.unmount();
  const rejected = render(<ManagerPlanCard plan={plan('rejected')} service={service({ decision: decided('rejected', 'Over budget') })} />);
  expect(await screen.findByText('Reason: “Over budget”')).toBeVisible();
  expect(rejected.container.querySelector('.pp-tag--rejected')).toHaveTextContent('rejected');
});
