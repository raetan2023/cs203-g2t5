import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ManagerTeamOverview } from './ManagerTeamOverview';
import { createMockPlanService } from '../mockService';
import { PlanError } from '../types';

const overview = { total_quantity_mt: 61.5, purchased_quantity_mt: 9.5, open_quantity_mt: 30.75,
  reference_price_usd_per_mt: 600, reference_date: '2026-11-02', exposure_usd: 18450 };
// The progress bar repeats some amounts, so figure checks look only at the figures.
const totals = () => within(document.querySelector<HTMLElement>('.pp-team-totals')!);
const service = () => ({ ...createMockPlanService({ delayMs: 0 }), managerOverview: vi.fn().mockResolvedValue(overview) });

it('shows team MT and dated estimated exposure, and clears data when refresh is denied', async () => {
  const api = service();
  render(<ManagerTeamOverview service={api} />);
  expect(await screen.findByText('$18,450.00')).toBeVisible();
  expect(totals().getByText('61.5 MT')).toBeVisible();
  expect(totals().getByText('9.5 MT')).toBeVisible();
  expect(totals().getByText('30.75 MT')).toBeVisible();
  expect(totals().getByText('Remaining to buy')).toBeVisible();
  expect(screen.getByText('Estimated remaining cost')).toBeVisible();
  expect(screen.getByText('Estimated remaining cost = Remaining to buy × Singapore MGO price (USD 600/MT on 02 Nov 2026)')).toBeVisible();
  expect(screen.getByText(/Updated as of/)).toBeVisible();
  for (const removed of ['Total plans', 'Awaiting approval', 'Open volume', 'Estimated open exposure', /Planned volume counts/, /No observed USD\/MT/])
    expect(screen.queryByText(removed)).not.toBeInTheDocument();
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
  expect(screen.getByText(/No price is available yet/)).toBeVisible();
  expect(totals().getByText('61.5 MT')).toBeVisible();
  expect(totals().getByText('9.5 MT')).toBeVisible();
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
  next.managerOverview.mockResolvedValue({ ...overview, exposure_usd: 0, total_quantity_mt: 0, purchased_quantity_mt: 0, open_quantity_mt: 0 });
  const view = render(<ManagerTeamOverview service={previous} />);
  view.rerender(<ManagerTeamOverview service={next} />);
  await screen.findByText('$0.00');
  await act(async () => resolve(overview));
  expect(screen.queryByText('$18,450.00')).not.toBeInTheDocument();
});

it('switches between 30 days and all time, and only shows the chosen period', async () => {
  const api = service();
  render(<ManagerTeamOverview service={api} />);
  await screen.findByText('$18,450.00');
  expect(api.managerOverview).toHaveBeenLastCalledWith('all', []);
  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  let finish!: (value: unknown) => void;
  api.managerOverview.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await userEvent.click(screen.getByRole('button', { name: '30 days' }));
  expect(api.managerOverview).toHaveBeenLastCalledWith('30d', []);
  expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
  // The current figures stay, dimmed, while the 30-day figures load, so nothing jumps.
  expect(screen.getByText('$18,450.00')).toBeVisible();
  expect(document.querySelector('.pp-refresh-content--pending')).not.toBeNull();
  expect(document.querySelector('.pp-manager-skeleton')).toBeNull();
  await act(async () => finish({ ...overview, total_quantity_mt: 5, purchased_quantity_mt: 0, exposure_usd: 3000 }));
  expect(await screen.findByText('$3,000.00')).toBeVisible();
  expect(totals().getByText('5 MT')).toBeVisible();
});

it('shows Singapore time in 24-hour format, and marks the figures out of date after 1 minute', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-11T14:45:00Z'));
  try {
    render(<ManagerTeamOverview service={service()} />);
    expect(await screen.findByText('11 Nov 2026, 22:45:00')).toBeVisible();
    expect(screen.getByText('Up to date.', { exact: false })).toBeInTheDocument();
    expect(document.querySelector('.pp-updated-dot--fresh')).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(55_000); });
    expect(document.querySelector('.pp-updated-dot--fresh')).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(screen.getByText('May be out of date.', { exact: false })).toBeInTheDocument();
    expect(document.querySelector('.pp-updated-dot--fresh')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh team overview' }));
    expect(await screen.findByText('Up to date.', { exact: false })).toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});

it('runs the refresh line for a full sweep even when the reload is instant', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  try {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(<ManagerTeamOverview service={service()} />);
    await screen.findByText('$18,450.00');
    expect(container.querySelector('.pp-refresh-bar')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Refresh team overview' }));
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(container.querySelector('.pp-refresh-bar')).not.toBeNull();
    expect(container.querySelector('.pp-refresh-content--pending')).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(900); });
    expect(container.querySelector('.pp-refresh-bar')).toBeNull();
    expect(container.querySelector('.pp-refresh-content--pending')).toBeNull();
  } finally { vi.useRealTimers(); }
});

it('filters the figures by the officers chosen', async () => {
  const api = service();
  api.managerOverview.mockResolvedValue({ ...overview, officers: [
    { user_id: 'u-rae', label: 'Rae Tan', plan_count: 2 }, { user_id: 'u-yash', label: 'Yashwanth Annem', plan_count: 1 }] });
  const user = userEvent.setup();
  render(<ManagerTeamOverview service={api} />);
  await screen.findByText('$18,450.00');
  expect(api.managerOverview).toHaveBeenLastCalledWith('all', []);
  await user.click(screen.getByRole('button', { name: /All officers/ }));
  api.managerOverview.mockResolvedValue({ ...overview, total_quantity_mt: 7, exposure_usd: 4200, officers: [
    { user_id: 'u-rae', label: 'Rae Tan', plan_count: 2 }, { user_id: 'u-yash', label: 'Yashwanth Annem', plan_count: 1 }] });
  // Everyone starts ticked; unticking "Select all" clears the boxes without changing the figures yet.
  const selectAll = screen.getByRole('checkbox', { name: /Select all/ });
  expect(selectAll).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Rae Tan/ })).toBeChecked();
  await user.click(selectAll);
  expect(screen.getByRole('checkbox', { name: /Rae Tan/ })).not.toBeChecked();
  expect(screen.getByText('Tick at least one officer.')).toBeVisible();
  expect(api.managerOverview).toHaveBeenLastCalledWith('all', []);
  await user.click(screen.getByRole('checkbox', { name: /Yashwanth Annem/ }));
  expect(api.managerOverview).toHaveBeenLastCalledWith('all', ['u-yash']);
  expect(await screen.findByText('$4,200.00')).toBeVisible();
  expect(screen.getByRole('button', { name: /Yashwanth Annem/ })).toBeVisible();
  expect(screen.getByRole('checkbox', { name: /Select all/ })).not.toBeChecked();
  // Ticking "Select all" goes back to everyone.
  await user.click(screen.getByRole('checkbox', { name: /Select all/ }));
  expect(api.managerOverview).toHaveBeenLastCalledWith('all', []);
  expect(screen.getByRole('button', { name: /All officers/ })).toBeVisible();
});

it('no longer compares purchases with the plan: a purchase is always the whole plan', async () => {
  const api = service();
  render(<ManagerTeamOverview service={api} />);
  await screen.findByText('$18,450.00');
  expect(screen.queryByText(/than planned/)).not.toBeInTheDocument();
  expect(document.querySelector('.pp-progress-part--shortfall')).toBeNull();
});

it('gives admins the organisation figures, filterable by PM and officer', async () => {
  const api = service();
  api.managerOverview.mockResolvedValue({ ...overview, officers: [
    { user_id: 'u-rae', label: 'Rae Tan', plan_count: 2, pm_user_id: 'u-wunna', pm_label: 'Wunna Aung' },
    { user_id: 'u-yash', label: 'Yashwanth Annem', plan_count: 1, pm_user_id: null, pm_label: null }] });
  const user = userEvent.setup();
  render(<ManagerTeamOverview service={api} audience="admin" />);
  expect(await screen.findByRole('heading', { name: 'Organisation oversight' })).toBeVisible();
  expect(screen.getByText('Plans from every officer in your organisation.')).toBeVisible();
  await screen.findByText('$18,450.00');
  await user.click(screen.getByRole('button', { name: /Everyone/ }));
  expect([...document.querySelectorAll('.pp-people-pm')].map(label => label.textContent)).toEqual(['Wunna Aung · PM2', 'No PM assigned1']);
  await user.click(screen.getByRole('checkbox', { name: /Select all/ }));
  await user.click(screen.getByRole('checkbox', { name: /Wunna Aung/ }));
  expect(api.managerOverview).toHaveBeenLastCalledWith('all', ['u-rae']);
});
