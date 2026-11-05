import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ManagerTeamOverview } from './ManagerTeamOverview';
import { createMockPlanService } from '../mockService';
import { PlanError } from '../types';

const overview = { plan_count: 6, total_quantity_mt: 61.5, open_quantity_mt: 30.75,
  pending_approval_count: 1, reference_price_usd_per_mt: 600, reference_date: '2026-11-02', exposure_usd: 18450 };
const service = () => ({ ...createMockPlanService({ delayMs: 0 }), managerOverview: vi.fn().mockResolvedValue(overview) });

it('shows team MT and dated estimated exposure, and clears data when refresh is denied', async () => {
  const api = service();
  render(<ManagerTeamOverview service={api} />);
  expect(await screen.findByText('$18,450.00')).toBeVisible();
  expect(screen.getByText('61.5 MT')).toBeVisible();
  expect(screen.getByText('30.75 MT')).toBeVisible();
  expect(screen.getByText(/observed 2026-11-02/)).toBeVisible();
  api.managerOverview.mockRejectedValue(new PlanError('Manager access changed.', {}, 403));
  await userEvent.click(screen.getByRole('button', { name: 'Refresh team overview' }));
  expect(await screen.findByText('Manager access changed.')).toBeVisible();
  expect(screen.queryByText('$18,450.00')).not.toBeInTheDocument();
});

it('preserves volume totals when a reference price is missing', async () => {
  const api = service();
  api.managerOverview.mockResolvedValue({ ...overview, exposure_usd: null, reference_date: null, reference_price_usd_per_mt: null });
  render(<ManagerTeamOverview service={api} />);
  expect(await screen.findByText('Unavailable')).toBeVisible();
  expect(screen.getByText('30.75 MT')).toBeVisible();
});

it('retains totals during refresh and replaces them after the response', async () => {
  const api = service();
  render(<ManagerTeamOverview service={api} />);
  await screen.findByText('$18,450.00');
  let finish!: (result: unknown) => void;
  api.managerOverview.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await userEvent.click(screen.getByRole('button', { name: 'Refresh team overview' }));
  expect(screen.getByText('$18,450.00')).toBeVisible();
  expect(screen.getByRole('region', { name: 'Team oversight' })).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByText('Updating team exposure…')).toBeInTheDocument();
  await act(async () => finish({ ...overview, exposure_usd: 19000 }));
  expect(await screen.findByText('$19,000.00')).toBeVisible();
  expect(screen.queryByText('$18,450.00')).not.toBeInTheDocument();
});

it('discards a delayed response after switching teams', async () => {
  const previous = service(), next = service();
  let resolve!: (value: typeof overview) => void;
  previous.managerOverview.mockReturnValue(new Promise(done => { resolve = done; }));
  next.managerOverview.mockResolvedValue({ ...overview, exposure_usd: 0, plan_count: 0, total_quantity_mt: 0, open_quantity_mt: 0, pending_approval_count: 0 });
  const view = render(<ManagerTeamOverview service={previous} />);
  view.rerender(<ManagerTeamOverview service={next} />);
  await screen.findByText('$0.00');
  await act(async () => resolve(overview));
  expect(screen.queryByText('$18,450.00')).not.toBeInTheDocument();
});
