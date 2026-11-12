import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PlanDecisionNote, boughtText } from './PlanDecisionNote';
import { DEMO_PLAN } from '../fixtures';
import type { PurchasePlanService } from '../types';

it('describes how much was actually bought', () => {
  expect(boughtText(undefined, 200)).toBe('');
  expect(boughtText(200, 200)).toBe('Bought all 200 MT. ');
  expect(boughtText(195, 200)).toBe('Bought 195 MT of 200 MT planned. ');
});

it('shows the bought amount on a purchased card for officers and managers', async () => {
  const plan = { ...DEMO_PLAN, quantity_mt: 200, status: 'purchased' as const, submitted_at: '2026-11-01T00:00:00Z' };
  const service = { readSubmission: vi.fn().mockResolvedValue({ submission: null, decision: null,
    purchase: { purchase_id: 'r1', quantity_mt: 195, price_usd_per_mt: 640, purchased_on: '2026-11-03', supplier: 'S', note: '', total_usd: 124800, recorded_at: '2026-11-03T00:00:00Z' } }) } as unknown as PurchasePlanService;
  const view = render(<PlanDecisionNote plan={plan} service={service} canAct={false} />);
  expect(await screen.findByText(/Bought 195 MT of 200 MT planned\./)).toBeVisible();
  view.unmount();
  render(<PlanDecisionNote plan={plan} service={service} canAct />);
  expect(await screen.findByText(/Bought 195 MT of 200 MT planned\. See the actual cost/)).toBeVisible();
});
