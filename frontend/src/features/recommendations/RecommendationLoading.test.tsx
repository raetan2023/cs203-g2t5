import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReadyForecast } from '../forecast/apiService';
import { ForecastProvider } from '../forecast/ForecastContext';
import { buildMockForecast } from '../forecast/mockService';
import { createMockPlanService } from '../purchase-plan/mockService';
import type { PlanAnalysis } from '../purchase-plan/types';
import { RecommendationLoading, SLOW_AFTER_MS, STEP_DWELL_MS } from './RecommendationLoading';
import { RecommendationsPage } from './RecommendationsPage';
import { createMockRecommendationService, RECOMMENDATION_DEMO_PLAN as plan } from './mockService';
import type { Entry } from './TimingComparison';

const TODAY = '2025-10-22', DEADLINE = '2025-10-30';
const ready = (horizon: 7 | 14 | 30, target: string, low: number, high: number) => ({ horizon, forecast: {
  ...buildMockForecast(horizon), anchor_quote_date: '2025-10-22', anchor_price: 700, target_date: target, low, high, forecast: (low + high) / 2,
} as ReadyForecast });
// One forecast lands before the 30 Oct deadline and its whole range is below today's 700.
const entries: Entry[] = [ready(7, '2025-10-29', 650, 690), ready(14, '2025-11-05', 640, 760), ready(30, '2025-11-21', 600, 800)];
const step = (n: number) => screen.getAllByRole('listitem')[n - 1];
// Each step's timer starts after the previous one renders, so advance one dwell at a time.
const tick = (steps: number) => { for (let i = 0; i < steps; i++) act(() => { vi.advanceTimersByTime(STEP_DWELL_MS); }); };
const status = () => within(screen.getByText('Working out your recommendation').parentElement!).getByRole('status');

afterEach(() => { vi.useRealTimers(); });

describe('recommendation loading', () => {
  it('finishes steps one at a time with details from the loaded forecasts, then waits on step 5', () => {
    vi.useFakeTimers();
    render(<RecommendationLoading entries={entries} today={TODAY} deadline={DEADLINE} onRetry={() => {}} />);
    expect(status()).toHaveTextContent('Reading the latest MGO quote…');
    expect(step(1)).toHaveAttribute('aria-current', 'step');
    tick(1);
    expect(step(1)).toHaveTextContent('Wed 22 Oct · USD 700/MT');
    tick(3);
    expect(step(2)).toHaveTextContent('3 forecasts found');
    expect(step(3)).toHaveTextContent('1 of 3 before Thu 30 Oct');
    expect(step(4)).toHaveTextContent('All below today’s price');
    expect(status()).toHaveTextContent('Writing your recommendation…');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(step(5)).toHaveAttribute('aria-current', 'step');
  });

  it('never marks a step done before its data has loaded', () => {
    vi.useFakeTimers();
    const view = render(<RecommendationLoading today={TODAY} deadline={DEADLINE} onRetry={() => {}} />);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(step(1)).toHaveAttribute('aria-current', 'step');
    view.rerender(<RecommendationLoading published={entries[0].forecast} today={TODAY} deadline={DEADLINE} onRetry={() => {}} />);
    tick(8);
    expect(step(2)).toHaveAttribute('aria-current', 'step');
    expect(step(2)).not.toHaveTextContent('forecasts found');
  });

  it('reports partial forecasts and when none fit the deadline', () => {
    vi.useFakeTimers();
    const partial: Entry[] = [{ horizon: 7, message: 'Expired' }, entries[1], entries[2]];
    render(<RecommendationLoading entries={partial} today={TODAY} deadline={DEADLINE} onRetry={() => {}} />);
    tick(4);
    expect(step(2)).toHaveTextContent('2 of 3 found');
    expect(step(3)).toHaveTextContent('None land before Thu 30 Oct');
    expect(step(4)).toHaveTextContent('Only buying today fits your deadline');
  });

  it('offers to keep waiting or retry once the request is slow', () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    render(<RecommendationLoading entries={entries} today={TODAY} deadline={DEADLINE} onRetry={onRetry} />);
    act(() => { vi.advanceTimersByTime(SLOW_AFTER_MS - 1_000); });
    expect(screen.queryByText(/taking longer than usual/)).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1_000); });
    fireEvent.click(screen.getByRole('button', { name: 'Keep waiting' }));
    expect(screen.queryByText(/taking longer than usual/)).not.toBeInTheDocument();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retries and restarts the slow timer', () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    render(<RecommendationLoading entries={entries} today={TODAY} deadline={DEADLINE} onRetry={onRetry} />);
    act(() => { vi.advanceTimersByTime(SLOW_AFTER_MS); });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByText(/taking longer than usual/)).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(SLOW_AFTER_MS); });
    expect(screen.getByText(/taking longer than usual/)).toBeVisible();
  });
});

it('shows progress while live forecasts back the request and swaps in the answer as soon as it arrives', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const forecasts = { read: vi.fn(async (h: 7 | 14 | 30) => ({ ...buildMockForecast(h), anchor_quote_date: '2025-10-22', forecast_origin_date: '2025-10-22',
    target_date: new Date(Date.parse(plan.scenario_as_of_date) + h * 86_400_000).toISOString().slice(0, 10) }) as ReadyForecast) };
  let resolve!: (value: PlanAnalysis) => void;
  const mock = createMockRecommendationService({ delayMs: 0 });
  const service = { ...mock, read: vi.fn(() => new Promise<PlanAnalysis>(r => { resolve = r; })) };
  render(<ForecastProvider service={forecasts} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={plan.plan_id} planService={createMockPlanService({ initialPlan: plan, delayMs: 0 })} service={service} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  const answer = await screen.findByRole('region', { name: 'Recommendation' });
  expect(await within(answer).findByText('Working out your recommendation')).toBeVisible();
  expect(answer).toHaveAttribute('aria-busy', 'true');
  const body = await mock.read(plan, 7, 'synthetic-preview');
  if (body.forecast.status === 'ready') body.forecast.value.target_date = '2025-10-31';
  await act(async () => resolve(body));
  expect(await within(answer).findByText('Consider purchasing on 29 October')).toBeVisible();
  expect(screen.queryByText('Working out your recommendation')).not.toBeInTheDocument();
});
