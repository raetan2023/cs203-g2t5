import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ForecastProvider, useForecastContext } from '../forecast/ForecastContext';
import { buildMockForecast as baseForecast } from '../forecast/mockService';
import type { ReadyForecast } from '../forecast/apiService';
import { RecommendationsPage } from './RecommendationsPage';
import { createMockRecommendationService, RECOMMENDATION_DEMO_PLAN as plan } from './mockService';
import { createMockPlanService } from '../purchase-plan/mockService';
import type { PlanAnalysis } from '../purchase-plan/types';
import { addCalendarDays } from '../purchase-plan/dates';

// Match the plan's scenario; the shared dashboard fixture uses a different year.
const buildMockForecast = (h: 7 | 14 | 30) => ({ ...baseForecast(h),
  anchor_quote_date: '2025-10-22', forecast_origin_date: '2025-10-22',
  target_date: addCalendarDays(plan.scenario_as_of_date, h) });

const plans = () => createMockPlanService({ initialPlan: plan, delayMs: 0 });
const ready = () => createMockRecommendationService({ delayMs: 0 });
const livePlan = { ...plan, purchase_deadline: '2025-11-05', days_remaining: 12 };
// Connected fixtures must use the same date in publication, analysis and costs.
function liveService() {
  const read = async (context: PlanAnalysis['context'], horizon = 7) => {
    const body = await ready().read(plan);
    body.context = context;
    const target = addCalendarDays(context.scenario_as_of_date, horizon);
    if (body.forecast.status === 'ready') body.forecast.value.target_date = target;
    if (body.cost_impact.status === 'ready') body.cost_impact.value.target_date = target;
    return body;
  };
  return { read, readImpact: read };
}
// The decision rail repeats the action, so read the answer from the recommendation itself.
const findInAnswer = async (text: string) => within(await screen.findByRole('region', { name: 'Recommendation' })).findByText(text);
const getInAnswer = (text: string) => within(screen.getByRole('region', { name: 'Recommendation' })).getByText(text);

describe('recommendation page', () => {
  it('loads and retries recommendations independently without clearing a ready cost estimate', async () => {
    const service = createMockRecommendationService({ delayMs: 0, failOnce: true });
    const impactRead = vi.spyOn(service, 'readImpact');
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={service} scenarioDate={plan.scenario_as_of_date} />);
    expect(await screen.findByText('USD 67,000–70,000')).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry recommendation' }));
    expect(screen.getByText('USD 67,000–70,000')).toBeVisible();
    expect(await findInAnswer('Consider purchasing on 29 October')).toBeVisible();
    expect(impactRead).toHaveBeenCalledOnce();
  });

  it('retries cost impact without refetching a ready recommendation', async () => {
    const service = createMockRecommendationService({ delayMs: 0, impactFailOnce: true });
    const recommendationRead = vi.spyOn(service, 'read');
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={service} scenarioDate={plan.scenario_as_of_date} />);
    expect(await findInAnswer('Consider purchasing on 29 October')).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry cost impact' }));
    expect(getInAnswer('Consider purchasing on 29 October')).toBeVisible();
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
    expect(await findInAnswer('Consider purchasing on 29 October')).toBeVisible();
    expect(screen.getAllByText(/Synthetic demo data/).length).toBeGreaterThan(0);
    const disclosure = await screen.findByText('Assumptions and data sources');
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
    fireEvent.click(await screen.findByText('Assumptions and data sources'));
    expect(await screen.findByText(/Price range: USD 670–700\/MT/)).toBeVisible();
  });

  it('retries failed reads without replacing them with mock success', async () => {
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={createMockRecommendationService({ delayMs: 0, failOnce: true })} scenarioDate={plan.scenario_as_of_date} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry recommendation' }));
    expect(await findInAnswer('Consider purchasing on 29 October')).toBeVisible();
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
    expect(await findInAnswer('Consider purchasing on 29 October')).toBeVisible();
  });

  it('clears old analysis when a different account service has no plan', async () => {
    const service = ready();
    const view = render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={service} scenarioDate={plan.scenario_as_of_date} />);
    await findInAnswer('Consider purchasing on 29 October');
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
  const service = liveService();
  const guidance = vi.spyOn(service, 'read'), impact = vi.spyOn(service, 'readImpact');
  render(<ForecastProvider autoRefresh service={forecasts} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={livePlan.plan_id} planService={createMockPlanService({ initialPlan: livePlan, delayMs: 0 })} service={service} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  await waitFor(() => expect(guidance).toHaveBeenCalledWith(expect.objectContaining({ plan_id: plan.plan_id }), 7, 'published-run'));
  expect(impact).toHaveBeenCalledWith(expect.objectContaining({ plan_id: plan.plan_id }), 7, 'published-run');
  expect(await screen.findByRole('button', { name: '14 days' })).toHaveAccessibleDescription(/After deadline/);
  current = false;
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(await screen.findByText('Previous day news unavailable')).toBeVisible();
  expect(screen.queryByText('Consider purchasing on 29 October')).not.toBeInTheDocument();
  expect(screen.queryByText('USD 67,000–70,000')).not.toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Recommendation' })).getByText('Recommendation unavailable')).toBeVisible();
  expect(screen.queryByText('Loading recommendation…')).not.toBeInTheDocument();
});

it('uses an available horizon when the default has expired and labels estimated news', async () => {
  const forecasts = { read: vi.fn(async (h: 7 | 14 | 30) => h === 7
    ? { status: 'unavailable' as const, reason: 'ridge_unavailable', message: 'The 7-day target has expired.' }
    : { ...buildMockForecast(h), run_id: 'estimated-run', source_dates: { ...buildMockForecast(h).source_dates, gdelt_estimated: '2025-10-25' } } as ReadyForecast) };
  const availablePlan = { ...livePlan, purchase_deadline: '2025-11-15', days_remaining: 22 };
  const service = liveService();
  const guidance = vi.spyOn(service, 'read');
  render(<ForecastProvider service={forecasts} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={livePlan.plan_id} planService={createMockPlanService({ initialPlan: availablePlan, delayMs: 0 })} service={service} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  expect(await screen.findByRole('note', { name: 'News data limitations' })).toHaveTextContent('Using estimated news data');
  await waitFor(() => expect(guidance).toHaveBeenCalledWith(expect.objectContaining({ plan_id: plan.plan_id }), 14, 'estimated-run'));
  expect(screen.queryByText('Price estimate unavailable')).not.toBeInTheDocument();
});

it('labels experimental plan ranges without displaying confidence coverage claims', async () => {
  const data = { ...buildMockForecast(7), run_id: 'experimental-run',
    interval: { method: 'experimental_gdelt_scaled_quantiles', nominal_coverage: null,
      empirical_coverage: null, evaluation_rows: 0, baseline_coverage: null, baseline_mean_width: null,
      mean_width: null, evaluation_scope: '50 historical pairs; no measured coverage.',
      limitations: 'Experimental news-adjusted range, not calibrated confidence. Price data is stale.' } } as ReadyForecast;
  render(<ForecastProvider service={{ read: async () => data }} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={livePlan.plan_id} planService={createMockPlanService({ initialPlan: livePlan, delayMs: 0 })} service={liveService()} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  expect(await screen.findByRole('complementary', { name: 'Estimate limitations' })).toBeVisible();
  expect(screen.getByText('Last-quote fallback · Ridge unavailable')).toBeVisible();
  expect(await screen.findByText(/Coverage has not been measured/)).toBeVisible();
  expect(screen.queryByText(/Target coverage:/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Assumptions and data sources'));
  expect(screen.getByText('Last observed quote (persistence)')).toBeVisible();
});

it('makes large experimental totals readable and describes both cost directions neutrally', async () => {
  const largePlan = { ...livePlan, quantity_mt: 2000 };
  const data = { ...buildMockForecast(7), run_id: 'large-range',
    interval: { ...buildMockForecast(7).interval, method: 'experimental_gdelt_scaled_quantiles',
      nominal_coverage: null, empirical_coverage: null, evaluation_rows: 0 } } as ReadyForecast;
  const body = await liveService().read(largePlan);
  body.context = largePlan;
  body.cost_impact = { status: 'ready', value: { currency: 'USD', target_date: '2025-10-31',
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
    <RecommendationsPage planId={livePlan.plan_id} planService={createMockPlanService({ initialPlan: livePlan, delayMs: 0 })} service={liveService()} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  expect(await screen.findByText('Ridge regression')).toBeVisible();
  expect(screen.queryByText('Last-quote fallback · Ridge unavailable')).not.toBeInTheDocument();
  fireEvent.click(await screen.findByText('Assumptions and data sources'));
  expect(screen.getByText('Ridge regression (published)')).toBeVisible();
});

it('shows a current executed Ridge estimate when its target fits the deadline', async () => {
  const currentPlan = { ...plan, purchase_deadline: '2025-10-31', days_remaining: 7 };
  const body = await ready().read(plan);
  body.context = currentPlan;
  if (body.forecast.status === 'ready') body.forecast.value.target_date = '2025-10-31';
  const data = { ...buildMockForecast(7), target_date: '2025-10-31', model_version: `ridge-7d-sha256-${'a'.repeat(64)}`,
    interval: { ...buildMockForecast(7).interval, method: 'experimental_gdelt_scaled_quantiles',
      nominal_coverage: null, empirical_coverage: null, evaluation_rows: 0 } } as ReadyForecast;
  render(<ForecastProvider service={{ read: async () => data }} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={currentPlan.plan_id} planService={createMockPlanService({ initialPlan: currentPlan, delayMs: 0 })}
      service={{ read: async () => body }} scenarioDate={currentPlan.scenario_as_of_date} />
  </ForecastProvider>);
  expect(await screen.findByText('Executed Ridge · experimental bounds')).toBeVisible();
  expect(await findInAnswer('Consider purchasing on 29 October')).toBeVisible();
});

it('blocks every horizon for a five-day deadline and shows only the observed reference cost', async () => {
  const shortPlan = { ...plan, quantity_mt: 84444, purchase_deadline: '2026-10-31', scenario_as_of_date: '2026-10-26', days_remaining: 5 };
  const data = { ...baseForecast(7), anchor_quote_date: '2026-10-26', forecast_origin_date: '2026-10-26',
    target_date: '2026-11-02', anchor_price: 1000 } as ReadyForecast;
  const service = ready();
  const impact = vi.spyOn(service, 'readImpact'), guidance = vi.spyOn(service, 'read');
  render(<ForecastProvider service={{ read: async h => ({ ...data, horizon_days: h,
    target_date: new Date(Date.parse(shortPlan.scenario_as_of_date) + h * 86_400_000).toISOString().slice(0, 10) }) }} scenarioDate={shortPlan.scenario_as_of_date}>
    <RecommendationsPage planId={shortPlan.plan_id} planService={createMockPlanService({ initialPlan: shortPlan, delayMs: 0, getScenarioDate: () => shortPlan.scenario_as_of_date })} service={service} scenarioDate={shortPlan.scenario_as_of_date} />
  </ForecastProvider>);
  expect(await screen.findByText('Your deadline is before the available forecasts')).toBeVisible();
  for (const h of [7,14,30]) expect(await screen.findByRole('button', { name: `${h} days` })).toHaveAccessibleDescription(/After deadline/);
  expect(getInAnswer('USD 84,444,000')).toBeVisible();
  expect(impact).not.toHaveBeenCalled();
  expect(guidance).toHaveBeenCalled();
});

it('returns to a fitting horizon when a shared longer horizon exceeds the plan deadline', async () => {
  function SelectLongHorizon() {
    const { setHorizon } = useForecastContext();
    return <button onClick={() => setHorizon(30)}>Select shared 30-day horizon</button>;
  }
  const forecasts = { read: vi.fn(async (h: 7 | 14 | 30) => buildMockForecast(h) as ReadyForecast) };
  const service = liveService();
  const impact = vi.spyOn(service, 'readImpact');
  render(<ForecastProvider service={forecasts} scenarioDate={plan.scenario_as_of_date}>
    <SelectLongHorizon />
    <RecommendationsPage planId={livePlan.plan_id} planService={createMockPlanService({ initialPlan: livePlan, delayMs: 0 })} service={service} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  await screen.findByText('USD 67,000–70,000');
  fireEvent.click(screen.getByRole('button', { name: 'Select shared 30-day horizon' }));
  await waitFor(() => expect(forecasts.read).toHaveBeenCalledWith(30));
  await waitFor(() => expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true'));
  expect(impact).not.toHaveBeenCalledWith(expect.anything(), 30, expect.anything());
  expect(impact).toHaveBeenLastCalledWith(expect.objectContaining({ plan_id: plan.plan_id }), 7, buildMockForecast(7).run_id);
});

it('renders one final recommendation with positive savings and no urgency override', async () => {
  const body = await ready().read(plan);
  body.recommendation = { status: 'ready', value: {
    recommendation_id: 'deadline', action: 'WAIT', explanation: 'Buy in 14 days.',
    evidence: { policy_version: 'deadline-minimum-v1', urgency: 'NORMAL', direction: 'DOWN', interval_width_fraction: 0.2,
      buy_now_cost_usd: 72000, alternative_cost_usd: 69500, alternative_minus_now_usd: -2500,
      reference_age_days: 0, supported_target_date: '2025-11-07', horizon_description: 'Deadline comparison',
      reasons: ['Cheapest eligible price.'], limitations: ['Experimental; no guaranteed savings.'], allocations: [] },
  } };
  render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={{read: async () => body}} scenarioDate={plan.scenario_as_of_date} />);
  expect(await screen.findByText('Buy in 14 days.')).toBeVisible();
  expect(screen.getAllByRole('region', {name: 'Recommendation'})).toHaveLength(1);
  expect(screen.getAllByText(/About USD 2,500 less than buying today/)[0]).toBeVisible();
  expect(screen.queryByLabelText('Urgency for this analysis')).not.toBeInTheDocument();
});

it('shows the actual date when older news is used', async () => {
  const forecasts = { read: async (h: 7 | 14 | 30) => ({ ...buildMockForecast(h),
    source_dates: { ...buildMockForecast(h).source_dates, gdelt: '2025-10-23', gdelt_fallback: '2025-10-23' } }) as ReadyForecast };
  render(<ForecastProvider service={forecasts} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={plan.plan_id} planService={plans()} service={ready()} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  expect(await screen.findByRole('note', { name: 'News data limitations' })).toHaveTextContent('23 Oct 2025');
});

it('excludes the old November targets from guidance, costs, approval and warnings for the 888 MT plan', async () => {
  const currentPlan = { ...plan, quantity_mt: 888, scenario_as_of_date: '2026-11-06', purchase_deadline: '2026-11-26', days_remaining: 20 };
  const forecasts = { read: async (h: 7 | 14 | 30) => h === 7
    ? { status: 'unavailable' as const, reason: 'ridge_unavailable', message: 'The old target has passed.' }
    : { ...baseForecast(h), run_id: 'old-quote', anchor_quote_date: '2026-10-26', anchor_price: 1351.5,
      target_date: addCalendarDays('2026-10-26', h), model_version: `ridge-${h}d-sha256-${'a'.repeat(64)}`,
      interval: { ...baseForecast(h).interval, method: 'experimental_gdelt_scaled_quantiles' } } as ReadyForecast };
  const service = { read: vi.fn(), readImpact: vi.fn() };
  const planService = { ...createMockPlanService({ initialPlan: currentPlan, getScenarioDate: () => currentPlan.scenario_as_of_date, delayMs: 0 }), submit: vi.fn() };
  render(<ForecastProvider service={forecasts} scenarioDate={currentPlan.scenario_as_of_date}>
    <RecommendationsPage canSubmit planId={currentPlan.plan_id} planService={planService} service={service} scenarioDate={currentPlan.scenario_as_of_date} />
  </ForecastProvider>);
  expect(await screen.findByText(/Older estimates are excluded from costs, recommendations and approval requests/)).toBeVisible();
  expect(await findInAnswer('Recommendation unavailable')).toBeVisible();
  expect(getInAnswer('USD 1,200,132')).toBeVisible();
  expect(screen.queryByText(/If you buy Mon 09 Nov/)).not.toBeInTheDocument();
  expect(screen.queryByText('Dated Ridge estimate')).not.toBeInTheDocument();
  expect(screen.queryByText(/Cost detail included:/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Submit for approval' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '14 days' })).toBeDisabled();
  expect(service.read).not.toHaveBeenCalled();
  expect(service.readImpact).not.toHaveBeenCalled();
});

it('skips a ready but incorrectly dated default and chooses a matching 14-day forecast', async () => {
  const currentPlan = { ...livePlan, purchase_deadline: '2025-11-15', days_remaining: 22 };
  const forecasts = { read: async (h: 7 | 14 | 30) => ({ ...buildMockForecast(h), run_id: 'mixed-targets',
    target_date: addCalendarDays(h === 7 ? '2025-10-22' : currentPlan.scenario_as_of_date, h) }) as ReadyForecast };
  const service = liveService();
  const read = vi.spyOn(service, 'read'), impact = vi.spyOn(service, 'readImpact');
  render(<ForecastProvider service={forecasts} scenarioDate={currentPlan.scenario_as_of_date}>
    <RecommendationsPage planId={currentPlan.plan_id} planService={createMockPlanService({ initialPlan: currentPlan, delayMs: 0 })} service={service} scenarioDate={currentPlan.scenario_as_of_date} />
  </ForecastProvider>);
  await waitFor(() => expect(read).toHaveBeenCalledWith(expect.anything(), 14, 'mixed-targets'));
  expect(read.mock.calls.every(call => call[1] !== 7)).toBe(true);
  expect(impact.mock.calls.every(call => call[1] !== 7)).toBe(true);
  expect(screen.getByRole('button', { name: '7 days' })).toBeDisabled();
  await waitFor(() => expect(screen.getByRole('button', { name: '14 days' })).toHaveAttribute('aria-pressed', 'true'));
  expect(screen.queryByText('Price estimate unavailable')).not.toBeInTheDocument();
});

it('recovers after refresh when current target dates become available', async () => {
  const today = '2026-11-06';
  const currentPlan = { ...plan, scenario_as_of_date: today, purchase_deadline: '2026-11-26', days_remaining: 20 };
  let current = false;
  const forecasts = { read: async (h: 7 | 14 | 30) => ({ ...baseForecast(h), run_id: current ? 'fresh-run' : 'dated-run',
    anchor_quote_date: current ? today : '2026-10-26', target_date: addCalendarDays(current ? today : '2026-10-26', h) }) as ReadyForecast };
  const service = liveService();
  const read = vi.spyOn(service, 'read');
  const planService = createMockPlanService({ initialPlan: currentPlan, getScenarioDate: () => today, delayMs: 0 });
  render(<ForecastProvider service={forecasts} scenarioDate={today}>
    <RecommendationsPage planId={currentPlan.plan_id} planService={planService} service={service} scenarioDate={today} />
  </ForecastProvider>);
  await findInAnswer('Recommendation unavailable');
  expect(read).not.toHaveBeenCalled();
  current = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
  await waitFor(() => expect(read).toHaveBeenCalledWith(expect.anything(), 7, 'fresh-run'));
  await waitFor(() => expect(screen.getByRole('button', { name: '7 days' })).toBeEnabled());
  expect(await screen.findByText('If you buy Fri 13 Nov')).toBeVisible();
  expect(screen.queryByText('Price estimate unavailable')).not.toBeInTheDocument();
});

it('clears yesterday’s costs and advice when the planning day advances without new forecasts', async () => {
  let today = '2026-11-06';
  const currentPlan = { ...plan, scenario_as_of_date: today, purchase_deadline: '2026-11-26', days_remaining: 20 };
  const forecasts = { read: async (h: 7 | 14 | 30) => ({ ...baseForecast(h), run_id: 'yesterday-run',
    anchor_quote_date: '2026-11-06', target_date: addCalendarDays('2026-11-06', h) }) as ReadyForecast };
  const service = liveService();
  const read = vi.spyOn(service, 'read');
  const planService = createMockPlanService({ initialPlan: currentPlan, getScenarioDate: () => today, delayMs: 0 });
  const page = () => <ForecastProvider service={forecasts} scenarioDate={today}>
    <RecommendationsPage planId={currentPlan.plan_id} planService={planService} service={service} scenarioDate={today} />
  </ForecastProvider>;
  const view = render(page());
  expect(await screen.findByText('If you buy Fri 13 Nov')).toBeVisible();
  read.mockClear();
  today = '2026-11-07';
  view.rerender(page());
  expect(await screen.findByText(/An updated forecast for 14 Nov 2026/)).toBeVisible();
  expect(await findInAnswer('Recommendation unavailable')).toBeVisible();
  expect(screen.queryByText('If you buy Fri 13 Nov')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '14 days' })).toHaveTextContent('Sat 21 Nov');
  expect(read).not.toHaveBeenCalled();
});
