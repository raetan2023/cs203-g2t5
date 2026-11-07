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
const findInAnswer = async (text: string | RegExp) => within(await screen.findByRole('region', { name: 'Recommendation' })).findByText(text);
const getInAnswer = (text: string | RegExp) => within(screen.getByRole('region', { name: 'Recommendation' })).getByText(text);

describe('recommendation page', () => {
  it('loads and retries recommendations independently without clearing a ready cost estimate', async () => {
    const service = createMockRecommendationService({ delayMs: 0, failOnce: true });
    const impactRead = vi.spyOn(service, 'readImpact');
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={service} scenarioDate={plan.scenario_as_of_date} />);
    expect(await screen.findByText('Range USD 67,000–70,000')).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry recommendation' }));
    expect(screen.getByText('Range USD 67,000–70,000')).toBeVisible();
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
    expect(await screen.findByText('Range USD 67,000–70,000')).toBeVisible();
    expect(recommendationRead).toHaveBeenCalledOnce();
  });

  it('does not display impact returned for stale inputs', async () => {
    const stale = await ready().readImpact!({ ...plan, quantity_mt: 200 });
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={{ ...ready(), readImpact: async () => stale }} scenarioDate={plan.scenario_as_of_date} />);
    expect(await screen.findByRole('button', { name: 'Retry cost impact' })).toBeVisible();
    expect(screen.queryByText('Range USD 67,000–70,000')).not.toBeInTheDocument();
  });

  it('shows supplied guidance with the key assumptions and their source underneath', async () => {
    render(<RecommendationsPage planId={plan.plan_id} planService={plans()} service={ready()} scenarioDate={plan.scenario_as_of_date} />);
    expect(await findInAnswer('Consider purchasing on 29 October')).toBeVisible();
    expect(screen.getAllByText(/Synthetic demo data/).length).toBeGreaterThan(0);
    const assumptions = await screen.findByRole('region', { name: 'Key assumptions and limitations' });
    expect(within(assumptions).getByText('Forecast savings are estimates, not guaranteed. Get a current supplier quote before buying.')).toBeVisible();
    expect(within(assumptions).getByText('Prices are dated observations (latest 24 Oct, today), not executable quotes. Costs exclude freight, fees and taxes.')).toBeVisible();
    expect(within(assumptions).getByText('Full method, data sources and model details are in the report.')).toBeVisible();
    expect(within(assumptions).getByText(/^Source: .*MGO quote 24 Oct 2025/)).toBeVisible();
    expect(screen.queryByText('Assumptions and data sources')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to purchase plans' })).toHaveAttribute('href', '/purchase-plans');
    expect(screen.getByText('Range USD 67,000–70,000')).toBeVisible();
    expect(screen.getByText('USD 3,000 less to no change than today')).toBeVisible();
    const report = screen.getByText('Full report (PDF)').closest<HTMLElement>('.rec-report')!;
    expect(within(report).getByText('All assumptions and limitations')).toBeVisible();
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
    const assumptions = await screen.findByRole('region', { name: 'Key assumptions and limitations' });
    expect(within(assumptions).getByText(/Prices are dated observations \(latest 24 Oct, today\)/)).toBeVisible();
    expect(within(assumptions).queryByText(/policy/)).not.toBeInTheDocument();
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
  expect(await screen.findByRole('group', { name: '14 days' })).toHaveAccessibleDescription(/After deadline/);
  current = false;
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(await screen.findByText('Previous day news unavailable')).toBeVisible();
  expect(screen.queryByText('Consider purchasing on 29 October')).not.toBeInTheDocument();
  expect(screen.queryByText('Range USD 67,000–70,000')).not.toBeInTheDocument();
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
  expect(await screen.findByRole('note', { name: 'Data freshness' })).toHaveTextContent('include API-supplied estimates');
  await waitFor(() => expect(guidance).toHaveBeenCalledWith(expect.objectContaining({ plan_id: plan.plan_id }), 14, 'estimated-run'));
  expect(screen.queryByText('Price estimate unavailable')).not.toBeInTheDocument();
});

it('labels experimental plan ranges without displaying confidence coverage claims', async () => {
  const data = { ...buildMockForecast(7), run_id: 'experimental-run',
    interval: { method: 'experimental_gdelt_scaled_quantiles', nominal_coverage: null,
      empirical_coverage: null, evaluation_rows: 0, baseline_coverage: null, baseline_mean_width: null,
      mean_width: null, evaluation_scope: '50 historical pairs; no measured coverage.',
      limitations: 'Experimental news-adjusted range, not calibrated confidence. Price data is stale.' } } as ReadyForecast;
  render(<ForecastProvider service={{ read: async h => ({ ...data, horizon_days: h, target_date: buildMockForecast(h).target_date }) }} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={livePlan.plan_id} planService={createMockPlanService({ initialPlan: livePlan, delayMs: 0 })} service={liveService()} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  const notice = await screen.findByRole('note', { name: 'Data freshness' });
  expect(notice).toHaveTextContent('Get a current supplier quote before you buy');
  expect(notice).toHaveTextContent('No current Ridge forecast is available');
  expect(notice).toHaveTextContent('its coverage hasn’t been measured');
  expect(await screen.findByText('Last-quote fallback · Ridge unavailable')).toBeVisible();
  expect(screen.queryByText(/Target coverage:/)).not.toBeInTheDocument();
  expect(screen.getByText(/^Source: last observed quote · MGO quote/)).toBeVisible();
  expect(screen.getByText('Price ranges are experimental, not calibrated confidence intervals.')).toBeVisible();
});

it('makes large experimental totals readable and describes both cost directions neutrally', async () => {
  const largePlan = { ...livePlan, quantity_mt: 2000 };
  const data = { ...buildMockForecast(7), run_id: 'large-range', low: 1112.5, high: 1616.5,
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
  expect(await screen.findByText('Range USD 2.23m–3.23m')).toBeVisible();
  expect(screen.getByText('USD 283k less to USD 725k more than today')).toBeVisible();
  expect(screen.queryByText(/Central estimated cost:/)).not.toBeInTheDocument();
  expect(screen.queryByText('Potential savings')).not.toBeInTheDocument();
});

it('identifies a published Ridge result separately from the last-quote fallback', async () => {
  const data = { ...buildMockForecast(7), interval: { ...buildMockForecast(7).interval,
    method: 'gdelt_error_quantiles' } } as ReadyForecast;
  render(<ForecastProvider service={{ read: async h => ({ ...data, horizon_days: h, target_date: buildMockForecast(h).target_date }) }} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={livePlan.plan_id} planService={createMockPlanService({ initialPlan: livePlan, delayMs: 0 })} service={liveService()} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  expect(await screen.findByText('Ridge regression')).toBeVisible();
  expect(screen.queryByText('Last-quote fallback · Ridge unavailable')).not.toBeInTheDocument();
  expect(screen.getByText(/^Source: published Ridge regression · MGO quote/)).toBeVisible();
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
  for (const h of [7,14,30]) expect(await screen.findByRole('group', { name: `${h} days` })).toHaveAccessibleDescription(/After deadline/);
  expect(getInAnswer('USD 84,444,000 for 84,444 MT')).toBeVisible();
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
  await screen.findByText('Range USD 123,000–132,000');
  fireEvent.click(screen.getByRole('button', { name: 'Select shared 30-day horizon' }));
  await waitFor(() => expect(forecasts.read).toHaveBeenCalledWith(30));
  await waitFor(() => expect(impact).toHaveBeenLastCalledWith(expect.objectContaining({ plan_id: plan.plan_id }), 7, buildMockForecast(7).run_id));
  expect(impact).not.toHaveBeenCalledWith(expect.anything(), 30, expect.anything());
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
  expect(await findInAnswer('and buy on Fri 07 Nov')).toBeVisible();
  expect(screen.getAllByRole('region', {name: 'Recommendation'})).toHaveLength(1);
  expect(getInAnswer('Expected saving')).toBeVisible();
  expect(getInAnswer('≈ USD 2,500')).toBeVisible();
  expect(screen.queryByLabelText('Urgency for this analysis')).not.toBeInTheDocument();
});

it('shows the actual date when older news is used', async () => {
  const forecasts = { read: async (h: 7 | 14 | 30) => ({ ...buildMockForecast(h),
    source_dates: { ...buildMockForecast(h).source_dates, gdelt: '2025-10-23', gdelt_fallback: '2025-10-23' } }) as ReadyForecast };
  render(<ForecastProvider service={forecasts} scenarioDate={plan.scenario_as_of_date}>
    <RecommendationsPage planId={plan.plan_id} planService={plans()} service={ready()} scenarioDate={plan.scenario_as_of_date} />
  </ForecastProvider>);
  expect(await screen.findByRole('note', { name: 'Data freshness' })).toHaveTextContent('23 Oct 2025');
});

// The 888 MT plan from Option A: the 26 Oct quote is 11 days old, so 7 days has passed and 14 and 30 land on their real dates.
const staleToday = '2026-11-06';
const stalePlan = { ...plan, status: 'draft' as const, quantity_mt: 888, scenario_as_of_date: staleToday, purchase_deadline: '2026-11-26', days_remaining: 20 };
const staleForecasts = { read: async (h: 7 | 14 | 30) => h === 7
  ? { status: 'unavailable' as const, reason: 'ridge_unavailable', message: 'The old target has passed.' }
  : { ...baseForecast(h), run_id: 'old-quote', anchor_quote_date: '2026-10-26', anchor_price: 1351.5,
    target_date: addCalendarDays('2026-10-26', h), model_version: `ridge-${h}d-sha256-${'a'.repeat(64)}`,
    interval: { ...baseForecast(h).interval, method: 'experimental_gdelt_scaled_quantiles' } } as ReadyForecast };
function staleAnalysis() {
  const read = async (context: PlanAnalysis['context'], horizon = 30) => {
    const body = await ready().read(plan);
    const target = addCalendarDays('2026-10-26', horizon);
    const basis = { commodity: 'MGO', currency: 'USD', unit: 'MT' };
    return { ...body, context, source: 'api' as const, provenance: 'model' as const, approval_fingerprint: 'a'.repeat(64),
      reference: { status: 'ready' as const, value: { price: 1351.5, observation_date: '2026-10-26', basis } },
      forecast: { status: 'ready' as const, value: { prices: { lower: 952.58, upper: 1683.54 }, central_estimate: 1351.5, target_date: target, basis,
        range_description: 'Experimental bounds', run_id: 'old-quote', model_version: 'ridge-test' } },
      cost_impact: { status: 'ready' as const, value: { currency: 'USD' as const, target_date: target, reference_total: 1200132, central_total: 1200132,
        forecast_total: { lower: 845891, upper: 1494984 }, difference_total: { lower: -354241, upper: 294852 } } },
      recommendation: { status: 'ready' as const, value: { recommendation_id: 'stale-rec', action: 'MONITOR',
        explanation: 'Monitor and obtain a current supplier quote. The reference price is too old for timing advice.',
        evidence: { policy_version: 'deadline-weighted-v1', urgency: 'NORMAL' as const, direction: 'FLAT', interval_width_fraction: .6,
          buy_now_cost_usd: 1200132, alternative_cost_usd: null, alternative_minus_now_usd: null, reference_age_days: 11, supported_target_date: null,
          horizon_description: 'Deadline comparison', reasons: ['20 calendar days remain.'], limitations: ['Experimental.'], allocations: [],
          signal_price: 1351.5, signal_low: 978, signal_high: 1826,
          signal_inputs: [{ target_date: '2026-11-25', weight: .9444, price: 1351.5 }, { target_date: '2026-11-09', weight: .0556, price: 1351.5 }] } } } };
  };
  return { read: vi.fn(read), readImpact: vi.fn(read) };
}
const renderStale = (service: ReturnType<typeof staleAnalysis>, extra = {}) => {
  const planService = { ...createMockPlanService({ initialPlan: stalePlan, getScenarioDate: () => staleToday, delayMs: 0 }), submit: vi.fn(), ...extra };
  render(<ForecastProvider service={staleForecasts} scenarioDate={staleToday}>
    <RecommendationsPage canSubmit planId={stalePlan.plan_id} planService={planService} service={service} scenarioDate={staleToday} />
  </ForecastProvider>);
  return planService;
};

it('uses each forecast on its real target date, defaults to the one nearest the deadline and can be submitted', async () => {
  const service = staleAnalysis();
  renderStale(service);
  expect(await findInAnswer('Monitor')).toBeVisible();
  expect(service.read).toHaveBeenCalledWith(expect.anything(), 30, 'old-quote');
  expect(service.read.mock.calls.every(call => call[1] === 30)).toBe(true);
  expect(getInAnswer('Latest quote · 26 Oct')).toBeVisible();
  expect(getInAnswer('USD 1,200,132 for 888 MT')).toBeVisible();
  expect(getInAnswer('If you buy Wed 25 Nov · 30-day forecast')).toBeVisible();
  expect(screen.getByRole('group', { name: '7 days' })).toHaveClass('rec-col--unavailable');
  expect(screen.getByRole('group', { name: '7 days' })).toHaveAccessibleDescription(/Passed/);
  expect(within(screen.getByRole('region', { name: 'Decision' })).getByText('30-day forecast · Wed 25 Nov')).toBeVisible();
  expect(screen.getByRole('note', { name: 'Data freshness' })).toHaveTextContent('Prices use the MGO quote from Mon 26 Oct (11 days old).');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Accept and submit for approval' })).toBeEnabled());
});

it('counts the news-aware model from today, even with an old quote', async () => {
  const forecasts = { read: async (h: 7 | 14 | 30) => h === 7
    ? { status: 'unavailable' as const, reason: 'ridge_unavailable', message: 'Ridge is busy.' }
    : { ...baseForecast(h), run_id: 'news-aware', anchor_quote_date: '2026-10-26', forecast_origin_date: staleToday, anchor_price: 1351.5,
      target_date: addCalendarDays(staleToday, h), model_version: `ridge-decision-gdelt-${h}d-sha256-${'a'.repeat(64)}`, source_dates: { mgo: '2026-10-26', gdelt_estimated: '2026-11-05' },
      interval: { ...baseForecast(h).interval, method: 'experimental_gdelt_scaled_quantiles' } } as ReadyForecast };
  const service = liveService();
  const read = vi.spyOn(service, 'read');
  render(<ForecastProvider service={forecasts} scenarioDate={staleToday}>
    <RecommendationsPage planId={stalePlan.plan_id} planService={createMockPlanService({ initialPlan: stalePlan, getScenarioDate: () => staleToday, delayMs: 0 })} service={service} scenarioDate={staleToday} />
  </ForecastProvider>);
  await waitFor(() => expect(read).toHaveBeenCalledWith(expect.anything(), 14, 'news-aware'));
  expect(await screen.findByText('News-aware Ridge · experimental bounds')).toBeVisible();
  const seven = screen.getByRole('group', { name: '7 days' });
  expect(seven).toHaveAccessibleDescription(/Unavailable/);
  expect(seven).not.toHaveAccessibleDescription(/Passed/);
  expect(screen.getByRole('group', { name: '14 days' })).toHaveTextContent('Fri 20 Nov');
  expect(screen.getByRole('group', { name: '30 days' })).toHaveAccessibleDescription(/After deadline/);
  expect(screen.getByText(/Forecast dates count from today\./)).toBeVisible();
  const notice = screen.getByRole('note', { name: 'Data freshness' });
  expect(notice).toHaveTextContent('(11 days old)');
  expect(notice).toHaveTextContent('which affect the model price and its range');
});

// Forecasts from today on a far deadline: 7, 14 and 30 days all fit, and the policy blends the last two.
const farToday = '2026-11-07';
const farPlan = { ...plan, status: 'draft' as const, quantity_mt: 6767, scenario_as_of_date: farToday, purchase_deadline: '2027-07-06', days_remaining: 241 };
const farForecasts = (central: number) => ({ read: async (h: 7 | 14 | 30) => ({ ...baseForecast(h), run_id: 'far', anchor_quote_date: '2026-10-26', forecast_origin_date: farToday, anchor_price: 1351.5,
  target_date: addCalendarDays(farToday, h), forecast: central, low: central - 100, high: central + 400, model_version: `ridge-decision-gdelt-${h}d-sha256-${'a'.repeat(64)}`,
  interval: { ...baseForecast(h).interval, method: 'experimental_gdelt_scaled_quantiles' } }) as ReadyForecast });
function farAnalysis(action: string, explanation: string, signal: number, target: string | null) {
  const read = async (context: PlanAnalysis['context'], horizon = 30) => {
    const body = await ready().read(plan);
    const date = addCalendarDays(farToday, horizon);
    if (body.forecast.status === 'ready') body.forecast.value.target_date = date;
    if (body.cost_impact.status === 'ready') body.cost_impact.value.target_date = date;
    return { ...body, context, recommendation: { status: 'ready' as const, value: { recommendation_id: 'far', action, explanation,
      evidence: { policy_version: 'deadline-weighted-v1', urgency: 'NORMAL' as const, direction: 'DOWN', interval_width_fraction: .2, buy_now_cost_usd: 1351.5 * 6767,
        alternative_cost_usd: target ? signal * 6767 : null, alternative_minus_now_usd: target ? (signal - 1351.5) * 6767 : null, reference_age_days: 12, supported_target_date: target,
        horizon_description: 'Deadline comparison', reasons: ['Blended.'], limitations: ['Experimental.'], allocations: [], signal_price: signal, signal_low: signal - 100, signal_high: signal + 400,
        signal_inputs: [{ target_date: addCalendarDays(farToday, 30), weight: .52, price: signal }, { target_date: addCalendarDays(farToday, 14), weight: .48, price: signal }] } } } };
  };
  return { read, readImpact: read };
}
const renderFar = (forecasts: ReturnType<typeof farForecasts>, service: ReturnType<typeof farAnalysis>) => render(<ForecastProvider service={forecasts} scenarioDate={farToday}>
  <RecommendationsPage canSubmit planId={farPlan.plan_id} planService={createMockPlanService({ initialPlan: farPlan, getScenarioDate: () => farToday, delayMs: 0 })} service={service} scenarioDate={farToday} />
</ForecastProvider>);

it('leads a Wait with its date, the 30-day forecast and the saving, not the blended signal', async () => {
  renderFar(farForecasts(1137.33), farAnalysis('WAIT', 'Buy in 30 days.', 1200, '2026-12-07'));
  expect(await findInAnswer('and buy on Mon 07 Dec')).toBeVisible();
  expect(getInAnswer('That still leaves 211 days before your 06 Jul 2027 deadline.')).toBeVisible();
  expect(getInAnswer('Your buy date · Mon 07 Dec')).toBeVisible();
  expect(getInAnswer('USD 7,696,312 forecast')).toBeVisible();
  expect(getInAnswer('Range USD 7.02m–10.40m')).toBeVisible();
  expect(getInAnswer('Expected saving')).toBeVisible();
  expect(getInAnswer('≈ USD 1.45m')).toBeVisible();
  expect(getInAnswer('$214.17/MT · 16% below the latest quote')).toBeVisible();
  expect(getInAnswer(/According to Bunker Buddy’s 30-day MGO forecast \(Ridge regression\), based on the 26 Oct quote\./)).toBeVisible();
  expect(within(screen.getByRole('region', { name: 'Decision' })).getByText('USD 7,696,312')).toBeVisible();
});

it('offers no other window: the cost detail is the recommended date and the other dates are not buttons', async () => {
  renderFar(farForecasts(1137.33), farAnalysis('WAIT', 'Buy in 30 days.', 1200, '2026-12-07'));
  await findInAnswer('and buy on Mon 07 Dec');
  expect(within(screen.getByRole('region', { name: 'Decision' })).getByText('30-day forecast · Mon 07 Dec')).toBeVisible();
  expect(screen.queryByRole('button', { name: /days$/ })).not.toBeInTheDocument();
  expect(screen.getByRole('group', { name: '30 days' })).toHaveAccessibleDescription(/Recommended/);
  expect(screen.getByRole('group', { name: '14 days' })).not.toHaveAccessibleDescription(/Eligible|Selected/);
  expect(screen.queryByText('Observed')).not.toBeInTheDocument();
});

it('leads a Buy now with today, what waiting would cost and the extra cost', async () => {
  renderFar(farForecasts(1400), farAnalysis('BUY_NOW', 'Buy today.', 1400, null));
  expect(await findInAnswer('Buy now')).toBeVisible();
  expect(getInAnswer('Waiting is forecast to cost more. Your deadline is 06 Jul 2027, 241 days away.')).toBeVisible();
  expect(getInAnswer('Your buy date · Today')).toBeVisible();
  expect(getInAnswer('USD 9,145,601 for 6,767 MT · quote 26 Oct')).toBeVisible();
  expect(getInAnswer('If you wait until Mon 07 Dec')).toBeVisible();
  expect(getInAnswer('Extra cost if you wait')).toBeVisible();
  expect(getInAnswer('≈ USD 328,200')).toBeVisible();
  expect(getInAnswer('$48.50/MT · 4% above the latest quote')).toBeVisible();
});

it('stays neutral when the buy date’s own forecast disagrees with the blended signal', async () => {
  renderFar(farForecasts(1400), farAnalysis('WAIT', 'Buy in 30 days.', 1300, '2026-12-07'));
  expect(await findInAnswer('Against the latest quote')).toBeVisible();
  expect(getInAnswer('≈ USD 328k more')).toBeVisible();
  expect(screen.queryByText('Expected saving')).not.toBeInTheDocument();
});

it('shows only today’s box for a Buy now with no forecast before the deadline', async () => {
  const shortPlan = { ...stalePlan, purchase_deadline: '2026-11-08', days_remaining: 2 };
  const service = staleAnalysis();
  const original = service.read.getMockImplementation()!;
  const buyNow = async (context: PlanAnalysis['context'], horizon?: number) => {
    const body = await original(context, horizon);
    if (body.recommendation.status === 'ready') body.recommendation.value = { ...body.recommendation.value, action: 'BUY_NOW', explanation: 'Buy today.' };
    return body;
  };
  render(<ForecastProvider service={staleForecasts} scenarioDate={staleToday}>
    <RecommendationsPage planId={shortPlan.plan_id} planService={createMockPlanService({ initialPlan: shortPlan, getScenarioDate: () => staleToday, delayMs: 0 })} service={{ read: buyNow, readImpact: buyNow }} scenarioDate={staleToday} />
  </ForecastProvider>);
  expect(await findInAnswer(/No forecast lands before your deadline, so buying today is the only priced option/)).toBeVisible();
  expect(getInAnswer('Your buy date · Today')).toBeVisible();
  expect(screen.queryByText(/If you wait until/)).not.toBeInTheDocument();
  expect(screen.queryByText('Extra cost if you wait')).not.toBeInTheDocument();
});

it('walks through the four calculation steps from the policy’s own signal', async () => {
  renderStale(staleAnalysis());
  const steps = await screen.findByRole('region', { name: 'How this was calculated' });
  expect(within(steps).getByText('14-day and 30-day')).toBeVisible();
  expect(within(steps).getByText('Both land before your Thu 26 Nov deadline.')).toBeVisible();
  expect(within(steps).getByText('USD 1,351.50/MT')).toBeVisible();
  expect(within(steps).getByText('Weighted 94% to 30-day, 6% to 14-day, by closeness to deadline.')).toBeVisible();
  expect(within(steps).getByText('No expected saving')).toBeVisible();
  expect(within(steps).getByText('The range overlaps today’s price and the quote is over 7 days old.')).toBeVisible();
});

it('shows a date after the deadline for comparison without making it the cost detail', async () => {
  const shortPlan = { ...stalePlan, purchase_deadline: '2026-11-20', days_remaining: 14 };
  const service = staleAnalysis();
  render(<ForecastProvider service={staleForecasts} scenarioDate={staleToday}>
    <RecommendationsPage canSubmit planId={shortPlan.plan_id} planService={createMockPlanService({ initialPlan: shortPlan, getScenarioDate: () => staleToday, delayMs: 0 })} service={service} scenarioDate={staleToday} />
  </ForecastProvider>);
  await findInAnswer('Monitor');
  expect(screen.getByRole('group', { name: '30 days' })).toHaveAccessibleDescription(/After deadline/);
  expect(service.read).not.toHaveBeenCalledWith(expect.anything(), 30, expect.anything());
  expect(within(screen.getByRole('region', { name: 'Decision' })).getByText('14-day forecast · Mon 09 Nov')).toBeVisible();
});

it('downloads a planning PDF from the page’s data', async () => {
  const createObjectURL = vi.fn((_: Blob) => 'blob:report');
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  renderStale(staleAnalysis());
  await findInAnswer('Monitor');
  expect(screen.getByText('Everything behind this recommendation, for your records:')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
  expect(click).toHaveBeenCalledOnce();
  const report = createObjectURL.mock.calls[0][0];
  expect(report.type).toBe('application/pdf');
  expect((click.mock.contexts[0] as HTMLAnchorElement).download).toMatch(/^recommendation-BB-[0-9A-Z]{8}\.pdf$/);
  const contents = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(report);
  });
  expect(contents).toContain('(Purchase Recommendation) Tj');
  expect(contents).toContain('(Monitor) Tj');
  expect(contents).toContain(`(${stalePlan.plan_id}) Tj`);
  click.mockRestore();
});

it('keeps read-only viewers out of the submit step but leaves the report available', async () => {
  const planService = createMockPlanService({ initialPlan: stalePlan, getScenarioDate: () => staleToday, delayMs: 0 });
  render(<ForecastProvider service={staleForecasts} scenarioDate={staleToday}>
    <RecommendationsPage planId={stalePlan.plan_id} planService={planService} service={staleAnalysis()} scenarioDate={staleToday} />
  </ForecastProvider>);
  await findInAnswer('Monitor');
  const summary = screen.getByRole('region', { name: 'Recommendation summary' });
  expect(within(summary).queryByRole('button', { name: 'Accept and submit for approval' })).not.toBeInTheDocument();
  expect(within(summary).getByRole('button', { name: 'Download report' })).toBeEnabled();
});

it('skips a default whose target has passed and chooses a forecast still to come', async () => {
  const currentPlan = { ...livePlan, purchase_deadline: '2025-11-15', days_remaining: 22 };
  const forecasts = { read: async (h: 7 | 14 | 30) => ({ ...buildMockForecast(h), run_id: 'mixed-targets',
    target_date: addCalendarDays(h === 7 ? '2025-10-10' : currentPlan.scenario_as_of_date, h) }) as ReadyForecast };
  const service = liveService();
  const read = vi.spyOn(service, 'read'), impact = vi.spyOn(service, 'readImpact');
  render(<ForecastProvider service={forecasts} scenarioDate={currentPlan.scenario_as_of_date}>
    <RecommendationsPage planId={currentPlan.plan_id} planService={createMockPlanService({ initialPlan: currentPlan, delayMs: 0 })} service={service} scenarioDate={currentPlan.scenario_as_of_date} />
  </ForecastProvider>);
  await waitFor(() => expect(read).toHaveBeenCalledWith(expect.anything(), 14, 'mixed-targets'));
  expect(read.mock.calls.every(call => call[1] !== 7)).toBe(true);
  expect(impact.mock.calls.every(call => call[1] !== 7)).toBe(true);
  expect(screen.getByRole('group', { name: '7 days' })).toHaveClass('rec-col--unavailable');
  expect(screen.queryByText('Price estimate unavailable')).not.toBeInTheDocument();
});

it('recovers after refresh when a newer quote moves the forecast dates', async () => {
  const today = '2026-11-06';
  const currentPlan = { ...plan, scenario_as_of_date: today, purchase_deadline: '2026-11-14', days_remaining: 8 };
  let current = false;
  const forecasts = { read: async (h: 7 | 14 | 30) => ({ ...baseForecast(h), run_id: current ? 'fresh-run' : 'dated-run',
    anchor_quote_date: current ? today : '2026-10-20', target_date: addCalendarDays(current ? today : '2026-10-20', h) }) as ReadyForecast };
  const service = liveService();
  const read = vi.spyOn(service, 'read');
  const planService = createMockPlanService({ initialPlan: currentPlan, getScenarioDate: () => today, delayMs: 0 });
  render(<ForecastProvider service={forecasts} scenarioDate={today}>
    <RecommendationsPage planId={currentPlan.plan_id} planService={planService} service={service} scenarioDate={today} />
  </ForecastProvider>);
  await screen.findByRole('group', { name: '7 days' });
  expect(screen.getByRole('group', { name: '7 days' })).toHaveClass('rec-col--unavailable');
  current = true;
  fireEvent.click(screen.getAllByRole('button', { name: 'Refresh prices' })[0]);
  await waitFor(() => expect(read).toHaveBeenCalledWith(expect.anything(), 7, 'fresh-run'));
  await waitFor(() => expect(screen.getByRole('group', { name: '7 days' })).not.toHaveClass('rec-col--unavailable'));
  expect(screen.queryByText('Price estimate unavailable')).not.toBeInTheDocument();
});

it('rereads costs and advice when the planning day advances without new forecasts', async () => {
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
  await waitFor(() => expect(read).toHaveBeenCalledWith(expect.objectContaining({ scenario_as_of_date: '2026-11-06' }), 14, 'yesterday-run'));
  read.mockClear();
  today = '2026-11-07';
  view.rerender(page());
  await waitFor(() => expect(read).toHaveBeenCalledWith(expect.objectContaining({ scenario_as_of_date: '2026-11-07' }), 14, 'yesterday-run'));
  expect(screen.getByRole('group', { name: '14 days' })).toHaveTextContent('Fri 20 Nov');
});
