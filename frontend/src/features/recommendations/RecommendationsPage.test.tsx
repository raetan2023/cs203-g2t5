import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ForecastProvider, useForecastContext } from '../forecast/ForecastContext';
import { buildMockForecast as baseForecast } from '../forecast/mockService';
import type { ReadyForecast } from '../forecast/apiService';
import { RecommendationsPage } from './RecommendationsPage';
import { createMockRecommendationService, RECOMMENDATION_DEMO_PLAN as plan } from './mockService';
import { createMockPlanService } from '../purchase-plan/mockService';
import type { PlanAnalysis } from '../purchase-plan/types';

// Match the plan's scenario; the shared dashboard fixture uses a different year.
const buildMockForecast = (h: 7 | 14 | 30) => ({ ...baseForecast(h),
  anchor_quote_date: '2025-10-22', forecast_origin_date: '2025-10-22',
  target_date: new Date(Date.parse('2025-10-22') + h * 86_400_000).toISOString().slice(0, 10) });

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
    const disclosure = await screen.findByText('Data sources and calculation');
    expect(disclosure.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(disclosure);
    expect(disclosure.closest('details')).toHaveAttribute('open');
    expect(await screen.findByText(/Price range: USD 670–700\/MT/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to purchase plans' })).toHaveAttribute('href', '/purchase-plans');
    expect(screen.getByText('USD 67,000–70,000')).toBeVisible();
    expect(screen.getByText('USD 3,000 less to no change')).toBeVisible();
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
    fireEvent.click(await screen.findByText('Data sources and calculation'));
    expect(await screen.findByText(/Price range: USD 670–700\/MT/)).toBeVisible();
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
  expect(screen.getByRole('button', { name: '14 days' })).toBeDisabled();
  current = false;
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
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
  expect(await screen.findByRole('complementary', { name: 'Estimate limitations' })).toBeVisible();
  expect(screen.getByText('Last-quote fallback · Ridge unavailable')).toBeVisible();
  expect(await screen.findByText(/Coverage has not been measured/)).toBeVisible();
  expect(screen.queryByText(/Target coverage:/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Data sources and calculation'));
  expect(screen.getByText('Last observed quote (persistence)')).toBeVisible();
});

it('makes large experimental totals readable and describes both cost directions neutrally', async () => {
  const largePlan = { ...plan, quantity_mt: 2000 };
  const data = { ...buildMockForecast(7), run_id: 'large-range',
    interval: { ...buildMockForecast(7).interval, method: 'experimental_gdelt_scaled_quantiles',
      nominal_coverage: null, empirical_coverage: null, evaluation_rows: 0 } } as ReadyForecast;
  const body = await ready().read(plan);
  body.context = largePlan;
  body.cost_impact = { status: 'ready', value: { currency: 'USD', target_date: '2025-10-29',
    reference_total: 2508000, forecast_total: { lower: 2225018.24, upper: 3233053.47 },
    difference_total: { lower: -282981.76, upper: 725053.47 }, central_total: 2508000 } };
  render(<ForecastProvider service={{ read: async () => data }} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={largePlan.plan_id} scenarioDate={largePlan.scenario_as_of_date}
      planService={createMockPlanService({ initialPlan: largePlan, delayMs: 0 })}
      service={{ read: async () => body, readImpact: async () => body }} />
  </ForecastProvider>);
  expect(await screen.findByText('USD 2.23m–3.23m')).toBeVisible();
  expect(screen.getByText('USD 283k less to USD 725k more')).toBeVisible();
  expect(screen.queryByText(/Central estimated cost:/)).not.toBeInTheDocument();
  expect(screen.queryByText('Potential savings')).not.toBeInTheDocument();
});

it('identifies a published Ridge result separately from the last-quote fallback', async () => {
  const data = { ...buildMockForecast(7), interval: { ...buildMockForecast(7).interval,
    method: 'gdelt_error_quantiles' } } as ReadyForecast;
  render(<ForecastProvider service={{ read: async () => data }} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={plan.plan_id} planService={plans()} service={ready()} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  expect(await screen.findByText('Ridge regression')).toBeVisible();
  expect(screen.queryByText('Last-quote fallback · Ridge unavailable')).not.toBeInTheDocument();
  fireEvent.click(await screen.findByText('Data sources and calculation'));
  expect(screen.getByText('Ridge regression (published)')).toBeVisible();
});

it('shows a current executed Ridge estimate when its target fits the deadline', async () => {
  const data = { ...buildMockForecast(7), model_version: `ridge-7d-sha256-${'a'.repeat(64)}`,
    interval: { ...buildMockForecast(7).interval, method: 'experimental_gdelt_scaled_quantiles',
      nominal_coverage: null, empirical_coverage: null, evaluation_rows: 0 } } as ReadyForecast;
  render(<ForecastProvider service={{ read: async () => data }} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={plan.plan_id} planService={plans()} service={ready()} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  expect(await screen.findByText('Executed Ridge · experimental bounds')).toBeVisible();
  expect(await screen.findByText('Consider purchasing on 29 October')).toBeVisible();
});

it('blocks every horizon for a five-day deadline and shows only the observed reference cost', async () => {
  const shortPlan = { ...plan, quantity_mt: 84444, purchase_deadline: '2026-10-31', scenario_as_of_date: '2026-10-26', days_remaining: 5 };
  const data = { ...baseForecast(7), anchor_quote_date: '2026-10-26', forecast_origin_date: '2026-10-26',
    target_date: '2026-11-02', anchor_price: 1000 } as ReadyForecast;
  const service = ready();
  const impact = vi.spyOn(service, 'readImpact'), guidance = vi.spyOn(service, 'read');
  render(<ForecastProvider service={{ read: async () => data }} scenarioDate={shortPlan.scenario_as_of_date}>
    <RecommendationsPage planId={shortPlan.plan_id} planService={createMockPlanService({ initialPlan: shortPlan, delayMs: 0, getScenarioDate: () => shortPlan.scenario_as_of_date })} service={service} scenarioDate={shortPlan.scenario_as_of_date} />
  </ForecastProvider>);
  expect(await screen.findByText('Your deadline is before the available forecasts')).toBeVisible();
  for (const h of [7,14,30]) expect(screen.getByRole('button', { name: `${h} days` })).toBeDisabled();
  expect(screen.getByText('USD 84,444,000')).toBeVisible();
  expect(impact).not.toHaveBeenCalled();
  expect(guidance).toHaveBeenCalled();
});

it('returns to a fitting horizon when a shared longer horizon exceeds the plan deadline', async () => {
  function SelectLongHorizon() {
    const { setHorizon } = useForecastContext();
    return <button onClick={() => setHorizon(30)}>Select shared 30-day horizon</button>;
  }
  const forecasts = { read: vi.fn(async (h: 7 | 14 | 30) => buildMockForecast(h) as ReadyForecast) };
  const service = ready();
  const impact = vi.spyOn(service, 'readImpact');
  render(<ForecastProvider service={forecasts} scenarioDate={plan.scenario_as_of_date}>
    <SelectLongHorizon />
    <RecommendationsPage planId={plan.plan_id} planService={plans()} service={service} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  await screen.findByText('USD 67,000–70,000');
  fireEvent.click(screen.getByRole('button', { name: 'Select shared 30-day horizon' }));
  await waitFor(() => expect(forecasts.read).toHaveBeenCalledWith(30));
  await waitFor(() => expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true'));
  expect(impact).not.toHaveBeenCalledWith(expect.anything(), 30, expect.anything());
  expect(impact).toHaveBeenLastCalledWith(expect.objectContaining({ plan_id: plan.plan_id }), 7, buildMockForecast(7).run_id);
});

it('refreshes urgency, renders policy evidence, and ignores a late previous urgency response', async () => {
  const body = await ready().read(plan);
  let resolveOld!: (value: PlanAnalysis) => void;
  const service = { read: vi.fn((context: PlanAnalysis['context']) => {
    if (context.urgency === 'NORMAL') return new Promise<PlanAnalysis>(resolve => { resolveOld = resolve; });
    return Promise.resolve({ ...body, context, recommendation: { status: 'ready' as const, value: {
      recommendation_id: 'high-urgency', action: 'BUY_NOW', explanation: 'Secure supply because urgency is high.',
      evidence: { policy_version: 'buyer-heuristic-v1', urgency: 'HIGH' as const, direction: 'DOWN', interval_width_fraction: 0.2,
        buy_now_cost_usd: 70000, alternative_cost_usd: 68500, alternative_minus_now_usd: -1500,
        reference_age_days: 0, supported_target_date: '2025-10-29', horizon_description: '7 calendar days',
        reasons: ['High urgency takes precedence over falling prices.'], limitations: ['Experimental; no guaranteed savings.'], allocations: [] },
    } } });
  }) };
  render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={service} scenarioDate={plan.scenario_as_of_date} />);
  await waitFor(() => expect(service.read).toHaveBeenCalledOnce());
  fireEvent.change(screen.getByLabelText('Urgency for this analysis'), { target: { value: 'HIGH' } });
  expect(await screen.findByText('BUY_NOW')).toBeVisible();
  expect(screen.getByText('$70,000.00')).toBeVisible();
  expect(screen.getByText('-$1,500.00')).toBeVisible();
  expect(screen.getByText('High urgency takes precedence over falling prices.')).toBeVisible();
  expect(screen.getByText('Current date: 24 Oct 2025')).toBeVisible();
  const assumptions = screen.getByText('Assumptions and limitations');
  expect(assumptions.closest('details')).not.toHaveAttribute('open');
  expect(screen.getByText(/^Reference: USD/)).not.toBeVisible();
  fireEvent.click(assumptions);
  expect(screen.getByText(/^Reference: USD/)).toBeVisible();
  expect(screen.getByText('Experimental; no guaranteed savings.')).toBeVisible();
  await act(async () => resolveOld(body));
  expect(screen.getByText('BUY_NOW')).toBeVisible();
  expect(screen.queryByText('Consider purchasing on 29 October')).not.toBeInTheDocument();
});
