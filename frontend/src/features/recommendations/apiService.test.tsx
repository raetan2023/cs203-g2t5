import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ANALYSIS_DEMO_PLAN, DEMO_ANALYSIS } from '../purchase-plan/fixtures';
import { createApiRecommendationService, parseAnalysis } from './apiService';
import { createApiPlanService } from '../purchase-plan/apiService';
import { RecommendationsPage } from './RecommendationsPage';

const context = DEMO_ANALYSIS.context;
function payload() {
  const value = { ...structuredClone(DEMO_ANALYSIS), provenance: 'fixture' };
  if (value.cost_impact.status === 'ready') value.cost_impact.value.target_date = '2025-11-15';
  return value;
}
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
afterEach(() => vi.unstubAllGlobals());

describe('real analysis adapter', () => {
  it('uses separate authenticated routes and a fresh token for each read, without an API key', async () => {
    const fetcher = vi.fn().mockImplementation(async () => response(payload()));
    vi.stubGlobal('fetch', fetcher);
    const getToken = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const service = createApiRecommendationService({ baseUrl: 'https://backend.test/', getToken });
    expect((await service.read(context)).source).toBe('api');
    expect((await service.readImpact!(context)).provenance).toBe('fixture');
    expect(fetcher.mock.calls[0][0]).toContain('/api/v1/purchase-plans/recommendation?');
    expect(fetcher.mock.calls[1][0]).toContain('/api/v1/purchase-plans/cost-impact?');
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('quantity_mt')).toBe(String(context.quantity_mt));
    expect(fetcher.mock.calls[0][1]).toEqual({ headers: { Authorization: 'Bearer first' }, cache: 'no-store' });
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer second');
  });

  it('does not request or substitute mocks when no session exists', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(createApiRecommendationService({ getToken: () => null }).read(context)).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([401, 404, 409, 503])('preserves HTTP %s errors for recovery', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ detail: 'Backend detail' }, status)));
    await expect(createApiRecommendationService({ getToken: () => 'token' }).read(context)).rejects.toMatchObject({ status, detail: 'Backend detail' });
  });

  it('reports network and malformed JSON failures', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response('not json'));
    vi.stubGlobal('fetch', fetcher);
    const service = createApiRecommendationService({ getToken: () => 'token' });
    await expect(service.read(context)).rejects.toMatchObject({ status: 0 });
    await expect(service.readImpact!(context)).rejects.toThrow('unreadable');
  });

  it('rejects changed saved context', () => {
    const body = payload(); body.context.quantity_mt++;
    expect(() => parseAnalysis(body, context)).toThrow('Reload');
  });

  it.each([
    (v: any) => { v.cost_impact.value.reference_total = Infinity; },
    (v: any) => { v.forecast.value.prices.lower = 99999; },
    (v: any) => { v.forecast.value.basis.unit = 'bbl'; },
    (v: any) => { v.reference.value.basis.commodity = 'Brent'; },
    (v: any) => { v.forecast.value.target_date = '2025-02-30'; },
    (v: any) => { v.cost_impact.value.target_date = '2025-10-29'; },
    (v: any) => { v.cost_impact.value.currency = 'EUR'; },
    (v: any) => { v.cost_impact.value.central_total = -1; },
    (v: any) => { v.provenance = 'unavailable'; },
    (v: any) => { v.forecast = { status: 'unavailable', reason: 'unknown', message: 'No data' }; },
  ])('rejects malformed or incompatible payload %#', mutate => {
    const body = payload(); mutate(body);
    expect(() => parseAnalysis(body, context)).toThrow('invalid');
  });

  it('renders independently through CRUD and analysis HTTP adapters and retries only the failed section', async () => {
    let impactCalls = 0;
    const body = payload();
    body.recommendation = { status: 'unavailable', reason: 'recommendation_unavailable', message: 'Policy not connected.' };
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith(`/purchase-plans/${ANALYSIS_DEMO_PLAN.plan_id}`)) return response({ plan: ANALYSIS_DEMO_PLAN });
      if (url.includes('/cost-impact?') && ++impactCalls === 1) return response({ detail: 'Provider temporarily unavailable' }, 503);
      return response(body);
    });
    vi.stubGlobal('fetch', fetcher);
    const options = { baseUrl: 'https://backend.test', getToken: () => 'session' };
    render(<RecommendationsPage planId={ANALYSIS_DEMO_PLAN.plan_id} planService={createApiPlanService(options)} service={createApiRecommendationService(options)} scenarioDate={context.scenario_as_of_date} />);
    expect(await screen.findByText('Policy not connected.')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Retry cost impact' }));
    expect((await screen.findAllByText('USD 70,000'))[0]).toBeInTheDocument();
    expect(screen.getByText('USD 2,000 less to USD 4,000 more')).toBeInTheDocument();
    expect(screen.getByText(/Synthetic demo data/)).toBeInTheDocument();
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/recommendation?'))).toHaveLength(1);
    expect(document.querySelector('details')).not.toHaveAttribute('open');
  });

  it.each([
    [71000, 74000, 1000, 4000],
    [68000, 69000, -2000, -1000],
    [70000, 70000, 0, 0],
  ])('accepts ordered positive, negative and equal-bound totals (%s, %s)', (low, high, differenceLow, differenceHigh) => {
    const body = payload();
    if (body.cost_impact.status !== 'ready') throw new Error('Fixture must be ready');
    body.cost_impact.value.forecast_total = { lower: low, upper: high };
    body.cost_impact.value.difference_total = { lower: differenceLow, upper: differenceHigh };
    const analysis = parseAnalysis(body, context);
    expect(analysis.cost_impact).toEqual(body.cost_impact);
  });

  it('reloads the saved plan after a conflict instead of repeatedly requesting stale inputs', async () => {
    let reads = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith(`/purchase-plans/${ANALYSIS_DEMO_PLAN.plan_id}`)) return ++reads === 1 ? response({ plan: ANALYSIS_DEMO_PLAN }) : response({ detail: 'Not found' }, 404);
      return response({ detail: 'Your saved plan changed.' }, 409);
    }));
    const options = { getToken: () => 'session' };
    render(<RecommendationsPage planId={ANALYSIS_DEMO_PLAN.plan_id} planService={createApiPlanService(options)} service={createApiRecommendationService(options)} scenarioDate={context.scenario_as_of_date} />);
    const guidance = await screen.findByRole('region', { name: 'Recommendation' });
    // Guidance and cost impact both report the conflict; either reloads the saved plan.
    await userEvent.click((await within(guidance).findAllByRole('button', { name: 'Reload saved plan' }))[0]);
    await waitFor(() => expect(screen.getByText('No saved purchase plan')).toBeInTheDocument());
  });
});


it('pins cost impact to the selected shared horizon and run and rejects a different run', async () => {
  const body = payload();
  if (body.forecast.status !== 'ready') throw new Error('Ready fixture required');
  body.forecast.value.run_id = 'active-run';
  const fetcher = vi.fn().mockImplementation(async () => response(body));
  vi.stubGlobal('fetch', fetcher);
  const service = createApiRecommendationService({ baseUrl: 'https://backend.test', getToken: () => 'session' });
  await service.readImpact!(context, 14, 'active-run');
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.get('horizon_days')).toBe('14');
  expect(url.searchParams.get('run_id')).toBe('active-run');
  body.forecast.value.run_id = 'replaced-run';
  await expect(service.readImpact!(context, 14, 'active-run')).rejects.toMatchObject({ status: 409 });
});

it('accepts point estimates outside ordered quantile bounds without changing either', () => {
  const body = payload();
  if (body.forecast.status !== 'ready' || body.cost_impact.status !== 'ready') throw new Error('Ready fixture required');
  body.forecast.value.central_estimate = body.forecast.value.prices.upper + 10;
  body.cost_impact.value.central_total = body.cost_impact.value.forecast_total.upper + 1000;
  const out = parseAnalysis(body, context);
  expect(out.forecast).toEqual(body.forecast);
  expect(out.cost_impact).toEqual(body.cost_impact);
});

it('passes urgency to the authenticated endpoint and rejects responses for a different urgency', async () => {
  const body = payload();
  const fetcher = vi.fn().mockResolvedValue(response({ ...body, context: { ...body.context, urgency: 'HIGH' } }));
  vi.stubGlobal('fetch', fetcher);
  const expected = { ...context, urgency: 'HIGH' as const };
  const service = createApiRecommendationService({ baseUrl: 'https://backend.test', getToken: () => 'token' });
  expect((await service.read(expected)).context.urgency).toBe('HIGH');
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('urgency')).toBe('HIGH');
  expect(() => parseAnalysis(body, expected)).toThrow('Reload');
});

it('preserves structured SPLIT evidence and rejects invalid allocations and outcomes', () => {
  const body = payload();
  body.recommendation = { status: 'ready', value: { recommendation_id: 'policy-test', action: 'SPLIT', explanation: 'Illustrative timing split.',
    evidence: { policy_version: 'buyer-heuristic-v1', urgency: 'NORMAL', direction: 'DOWN', interval_width_fraction: 0.2,
      buy_now_cost_usd: 70000, alternative_cost_usd: 68000, alternative_minus_now_usd: -2000,
      reference_age_days: 0, supported_target_date: context.purchase_deadline, horizon_description: 'Selected model target',
      reasons: ['Wide interval'], limitations: ['Illustrative only'], allocations: [
        { date: context.scenario_as_of_date, quantity_mt: context.quantity_mt / 2 },
        { date: context.purchase_deadline, quantity_mt: context.quantity_mt / 2 },
      ] },
  } };
  const parsed = parseAnalysis(body, context);
  expect(parsed.recommendation.status === 'ready' && parsed.recommendation.value.evidence?.alternative_minus_now_usd).toBe(-2000);
  body.recommendation.value.evidence!.allocations[1].quantity_mt++;
  expect(() => parseAnalysis(body, context)).toThrow('invalid');
  body.recommendation.value.action = 'GUARANTEED_PROFIT';
  expect(() => parseAnalysis(body, context)).toThrow('invalid');
});
