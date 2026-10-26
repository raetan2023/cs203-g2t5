import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ForecastProvider } from '../forecast/ForecastContext';
import { buildMockForecast } from '../forecast/mockService';
import type { ReadyForecast } from '../forecast/apiService';
import { RecommendationsPage } from './RecommendationsPage';
import { createMockRecommendationService, RECOMMENDATION_DEMO_PLAN as plan } from './mockService';
import { createMockPlanService } from '../purchase-plan/mockService';
import type { PlanAnalysis } from '../purchase-plan/types';

const plans = () => createMockPlanService({ initialPlan: plan, delayMs: 0 });
const ready = () => createMockRecommendationService({ delayMs: 0 });

describe('recommendation page', () => {
  it('loads and retries recommendations independently without clearing a ready cost estimate', async () => {
    const service = createMockRecommendationService({ delayMs: 0, failOnce: true });
    const impactRead = vi.spyOn(service, 'readImpact');
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={service} scenarioDate={plan.scenario_as_of_date} />);
    expect(await screen.findByText('USD 67,000–70,000')).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry recommendation' }));
    expect(screen.getByText('USD 67,000–70,000')).toBeVisible();
    expect(await screen.findByText('Consider purchasing on 29 October')).toBeVisible();
    expect(impactRead).toHaveBeenCalledOnce();
  });

  it('retries cost impact without refetching a ready recommendation', async () => {
    const service = createMockRecommendationService({ delayMs: 0, impactFailOnce: true });
    const recommendationRead = vi.spyOn(service, 'read');
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={service} scenarioDate={plan.scenario_as_of_date} />);
    expect(await screen.findByText('Consider purchasing on 29 October')).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry cost impact' }));
    expect(screen.getByText('Consider purchasing on 29 October')).toBeVisible();
    expect(await screen.findByText('USD 67,000–70,000')).toBeVisible();
    expect(recommendationRead).toHaveBeenCalledOnce();
  });

  it('does not display impact returned for stale inputs', async () => {
    const stale = await ready().readImpact!({ ...plan, quantity_mt: 200 });
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={{ ...ready(), readImpact: async () => stale }} scenarioDate={plan.scenario_as_of_date} />);
    expect(await screen.findByRole('button', { name: 'Retry cost impact' })).toBeVisible();
    expect(screen.queryByText('USD 67,000–70,000')).not.toBeInTheDocument();
  });

  it('shows supplied guidance and lets users expand and collapse forecast details', async () => {
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={ready()} scenarioDate={plan.scenario_as_of_date} />);
    expect(await screen.findByText('Consider purchasing on 29 October')).toBeVisible();
    expect(screen.getAllByText(/Synthetic demo data/).length).toBeGreaterThan(0);
    const disclosure = await screen.findByText('Price basis and uncertainty');
    expect(disclosure.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(disclosure);
    expect(disclosure.closest('details')).toHaveAttribute('open');
    expect(await screen.findByText(/Forecast bounds: MGO · USD 670–700\/MT/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to purchase plans' })).toHaveAttribute('href', '/purchase-plans');
    expect(screen.getByText('USD 67,000–70,000')).toBeVisible();
    expect(screen.getByText('USD 0 to 3,000')).toBeVisible();
    fireEvent.click(disclosure);
    expect(disclosure.closest('details')).not.toHaveAttribute('open');
  });

  it('links to plan entry and does not request analysis without a saved plan', async () => {
    const service = { read: vi.fn() };
    render(<RecommendationsPage planId={plan.plan_id} planService={createMockPlanService({ delayMs: 0 })} service={service} scenarioDate={plan.scenario_as_of_date} />);
    expect(await screen.findByRole('link', { name: 'Create purchase plan' })).toHaveAttribute('href', '/purchase-plans');
    expect(service.read).not.toHaveBeenCalled();
  });

  it('retains forecasts when recommendations are unavailable', async () => {
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={createMockRecommendationService({ delayMs: 0, example: 'unavailable' })} scenarioDate={plan.scenario_as_of_date} />);
    expect(await screen.findByText('No recommendation available')).toBeVisible();
    fireEvent.click(await screen.findByText('Price basis and uncertainty'));
    expect(await screen.findByText(/Forecast bounds: MGO · USD 670–700\/MT/)).toBeVisible();
  });

  it('retries failed reads without replacing them with mock success', async () => {
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={createMockRecommendationService({ delayMs: 0, failOnce: true })} scenarioDate={plan.scenario_as_of_date} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry recommendation' }));
    expect(await screen.findByText('Consider purchasing on 29 October')).toBeVisible();
  });

  it('does not invent data when no analysis adapter is connected', async () => {
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} scenarioDate={plan.scenario_as_of_date} />);
    expect(await screen.findByText(/service is not connected yet/)).toBeVisible();
    expect(screen.queryByText(/Synthetic demo data/)).not.toBeInTheDocument();
  });

  it('rejects an analysis response for different saved inputs', async () => {
    const response = await ready().read({ ...plan, quantity_mt: 200 });
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={{ read: async () => response }} scenarioDate={plan.scenario_as_of_date} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load analysis');
  });

  it('discards late responses across A to B to A scenario transitions', async () => {
    let date = plan.scenario_as_of_date;
    const planService = createMockPlanService({ initialPlan: plan, delayMs: 0, getScenarioDate: () => date });
    const pending: Array<(value: PlanAnalysis) => void> = [];
    const service = { read: vi.fn(() => new Promise<PlanAnalysis>(resolve => pending.push(resolve))) };
    const view = render(<RecommendationsPage planId={plan.plan_id} planService={planService} service={service} scenarioDate={date} />);
    await waitFor(() => expect(pending).toHaveLength(1));
    date = '2025-10-25';
    view.rerender(<RecommendationsPage planId={plan.plan_id} planService={planService} service={service} scenarioDate={date} />);
    await waitFor(() => expect(pending).toHaveLength(2));
    date = plan.scenario_as_of_date;
    view.rerender(<RecommendationsPage planId={plan.plan_id} planService={planService} service={service} scenarioDate={date} />);
    await waitFor(() => expect(pending).toHaveLength(3));
    const obsolete = await ready().read(plan);
    obsolete.recommendation = { status: 'ready', value: { recommendation_id: 'old', action: 'Obsolete guidance', explanation: 'Old request' } };
    await act(async () => pending[0](obsolete));
    expect(screen.queryByText('Obsolete guidance')).not.toBeInTheDocument();
    await act(async () => pending[2](await ready().read(plan)));
    expect(await screen.findByText('Consider purchasing on 29 October')).toBeVisible();
  });

  it('clears old analysis when a different account service has no plan', async () => {
    const service = ready();
    const view = render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={service} scenarioDate={plan.scenario_as_of_date} />);
    await screen.findByText('Consider purchasing on 29 October');
    view.rerender(<RecommendationsPage planId={plan.plan_id} planService={createMockPlanService({ delayMs: 0 })} service={service} scenarioDate={plan.scenario_as_of_date} />);
    expect(screen.queryByText('Consider purchasing on 29 October')).not.toBeInTheDocument();
    expect(await screen.findByText('No saved purchase plan')).toBeVisible();
  });
});

it('pins guidance and impact to the selected publication and clears both when it fails', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  let current = true;
  const forecasts = { read: vi.fn(async (h: 7 | 14 | 30) => current
    ? { ...buildMockForecast(h), run_id: 'published-run' } as ReadyForecast
    : { status: 'unavailable' as const, reason: 'missing_news', message: 'Previous day news unavailable' }) };
  const service = ready();
  const guidance = vi.spyOn(service, 'read'), impact = vi.spyOn(service, 'readImpact');
  render(<ForecastProvider service={forecasts} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={plan.plan_id} planService={plans()} service={service} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  await waitFor(() => expect(guidance).toHaveBeenCalledWith(expect.objectContaining({ plan_id: plan.plan_id }), 7, 'published-run'));
  expect(impact).toHaveBeenCalledWith(expect.objectContaining({ plan_id: plan.plan_id }), 7, 'published-run');
  fireEvent.click(screen.getByRole('button', { name: '14d' }));
  await waitFor(() => expect(guidance).toHaveBeenLastCalledWith(expect.objectContaining({ plan_id: plan.plan_id }), 14, 'published-run'));
  expect(impact).toHaveBeenLastCalledWith(expect.objectContaining({ plan_id: plan.plan_id }), 14, 'published-run');
  current = false;
  fireEvent.click(screen.getByRole('button', { name: '30d' }));
  expect(await screen.findByText('Previous day news unavailable')).toBeVisible();
  expect(screen.queryByText('Consider purchasing on 29 October')).not.toBeInTheDocument();
  expect(screen.queryByText('USD 67,000–70,000')).not.toBeInTheDocument();
});

it('labels experimental plan ranges without displaying confidence coverage claims', async () => {
  const data = { ...buildMockForecast(7), run_id: 'experimental-run',
    interval: { method: 'experimental_gdelt_scaled_quantiles', nominal_coverage: null,
      empirical_coverage: null, evaluation_rows: 0, baseline_coverage: null, baseline_mean_width: null,
      mean_width: null, evaluation_scope: '50 historical pairs; no measured coverage.',
      limitations: 'Experimental news-adjusted range, not calibrated confidence. Price data is stale.' } } as ReadyForecast;
  render(<ForecastProvider service={{ read: async () => data }} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={plan.plan_id} planService={plans()} service={ready()} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  expect(await screen.findByRole('heading', { name: 'Experimental news-adjusted price range' })).toBeVisible();
  expect(screen.getByText('Experimental estimate, not calibrated confidence. Coverage has not been measured.')).toBeVisible();
  expect(screen.queryByText(/Target coverage:/)).not.toBeInTheDocument();
  expect(screen.getByText(/Central estimate:.*last observed quote/)).toBeVisible();
});
