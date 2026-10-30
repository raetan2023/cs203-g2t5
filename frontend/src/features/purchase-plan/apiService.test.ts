import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApiPlanService, fetchScenarioDate } from './apiService';
import { PlanError } from './types';
import { DEMO_PLAN } from './fixtures';

const options = { baseUrl: 'http://backend.test', apiKey: 'test-key', getToken: () => 'session-token' };
const service = createApiPlanService(options);

function mockFetch(status: number, body?: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('createApiPlanService', () => {
  it('sends the session token and returns the saved plan', async () => {
    const plan = { plan_id: 'p1', quantity_mt: 500, purchase_deadline: '2025-11-15', scenario_as_of_date: '2025-10-24', days_remaining: 22 };
    const fetchMock = mockFetch(200, { plan });

    await expect(service.read('p1')).resolves.toEqual({ plan });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://backend.test/api/v1/purchase-plans/p1');
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer session-token' });
    expect(init.headers).not.toHaveProperty('X-API-Key');
  });

  it('omits the header when nobody is signed in, so the backend answers 401', async () => {
    const fetchMock = mockFetch(401, { detail: 'Please sign in again.' });
    const anonymous = createApiPlanService({ baseUrl: 'http://backend.test', getToken: () => null });

    const error = await anonymous.read('p1').catch(e => e);
    expect(error.status).toBe(401);
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('asks for the token on every request, so a refreshed one is used', async () => {
    const tokens = ['first-token', 'second-token'];
    const getToken = vi.fn(() => tokens.shift() ?? null);
    const service = createApiPlanService({ baseUrl: 'http://backend.test', getToken });
    const fetchMock = mockFetch(404, { detail: 'No saved purchase plan was found.' });

    await service.read('p1');
    await service.read('p1');

    expect(getToken).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer second-token');
  });

  it('returns a null plan without treating it as an error', async () => {
    mockFetch(404, { detail: 'No saved purchase plan was found.' });
    await expect(service.read('p1')).resolves.toEqual({ plan: null });
  });

  it('sends the input as JSON when creating', async () => {
    const fetchMock = mockFetch(201, { plan: DEMO_PLAN });
    await service.create({ quantity_mt: 500, purchase_deadline: '2025-11-15' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ quantity_mt: 500, purchase_deadline: '2025-11-15' });
  });

  it('sends the input as JSON when updating', async () => {
    const fetchMock = mockFetch(200, { plan: { ...DEMO_PLAN, quantity_mt: 750, purchase_deadline: '2025-12-01' } });
    await service.update('p1', { quantity_mt: 750, purchase_deadline: '2025-12-01' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('PUT');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ quantity_mt: 750, purchase_deadline: '2025-12-01' });
  });

  it('turns field errors into a PlanError the form can display', async () => {
    mockFetch(422, { detail: 'Please check your inputs.', field_errors: { quantity_mt: 'Quantity must be greater than zero.' } });

    const error = await service.create({ quantity_mt: -5, purchase_deadline: '2025-11-15' }).catch(e => e);
    expect(error).toBeInstanceOf(PlanError);
    expect(error.status).toBe(422);
    expect(error.field_errors.quantity_mt).toBe('Quantity must be greater than zero.');
  });

  it.each([
    [409, 'You already have a saved plan. Edit or delete it first.'],
    [401, 'Please sign in again.'],
  ])('passes through the %i message from the backend', async (status, detail) => {
    mockFetch(status, { detail });
    const error = await service.read('p1').catch(e => e);
    expect(error.status).toBe(status);
    expect(error.detail).toBe(detail);
  });

  it('falls back to a friendly message when an error response has no body', async () => {
    mockFetch(500);
    const error = await service.read('p1').catch(e => e);
    expect(error).toBeInstanceOf(PlanError);
    expect(error.status).toBe(500);
    expect(error.detail).toContain("couldn't load");
  });

  it('accepts an empty 204 body when deleting', async () => {
    mockFetch(204);
    await expect(service.delete('p1')).resolves.toBeUndefined();
  });

  it('reports a friendly message when the backend cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await service.read('p1').catch(e => e);
    expect(error).toBeInstanceOf(PlanError);
    expect(error.status).toBe(0);
    expect(error.detail).toContain("couldn't load");
  });

  it.each([{ plan: { ...DEMO_PLAN, days_remaining: '22' } }, { plan: { ...DEMO_PLAN, quantity_mt: Infinity } }, {}, null])('rejects invalid saved context %#', async body => {
    mockFetch(200, body);
    await expect(service.read('p1')).rejects.toMatchObject({ status: 502 });
  });
});

describe('fetchScenarioDate', () => {
  it('rejects malformed historical dates without substituting device time', async () => {
    mockFetch(200, { scenario_as_of_date: '2025-02-30' });
    await expect(fetchScenarioDate(options)).rejects.toMatchObject({ status: 502 });
  });
  it('reads the configured date, which is available before any plan exists', async () => {
    mockFetch(200, { scenario_as_of_date: '2025-10-24' });
    await expect(fetchScenarioDate(options)).resolves.toBe('2025-10-24');
  });

  it('throws a PlanError when the scenario date cannot be loaded', async () => {
    mockFetch(500);
    const error = await fetchScenarioDate(options).catch(e => e);
    expect(error).toBeInstanceOf(PlanError);
    expect(error.status).toBe(500);
  });
});

describe('multiple-plan transport', () => {
  it('lists all plans and accepts an empty collection', async () => {
    const second = { ...DEMO_PLAN, plan_id: 'second', quantity_mt: 250 };
    const fetcher = mockFetch(200, { plans: [DEMO_PLAN, second] });
    expect(await service.list()).toEqual({ plans: [DEMO_PLAN, second] });
    expect(fetcher.mock.calls[0][0]).toBe('http://backend.test/api/v1/purchase-plans');
    mockFetch(200, { plans: [] });
    expect(await service.list()).toEqual({ plans: [] });
  });
  it.each([{}, { plans: null }, { plans: [DEMO_PLAN, DEMO_PLAN] }, { plans: [{ ...DEMO_PLAN, quantity_mt: -1 }] }])('rejects malformed collections %#', async payload => {
    mockFetch(200, payload);
    await expect(service.list()).rejects.toMatchObject({ status: 502 });
  });
  it('targets the selected plan for mutations and refuses an empty ID', async () => {
    const fetcher = mockFetch(200, { plan: { ...DEMO_PLAN, plan_id: 'second' } });
    await service.update('second', { quantity_mt: 250, purchase_deadline: '2025-11-15' });
    expect(fetcher.mock.calls[0][0]).toBe('http://backend.test/api/v1/purchase-plans/second');
    const deletion = mockFetch(204);
    await service.delete('second');
    expect(deletion.mock.calls[0][0]).toBe('http://backend.test/api/v1/purchase-plans/second');
    deletion.mockClear();
    await expect(service.delete('')).rejects.toMatchObject({ status: 400 });
    expect(deletion).not.toHaveBeenCalled();
  });
});

describe('approval API contracts', () => {
  const selection = { horizon_days: 14 as const, run_id: 'run', recommendation_id: 'rec', approval_fingerprint: 'a'.repeat(64),
    urgency: 'NORMAL' as const, quantity_mt: 500, purchase_deadline: '2026-11-15', scenario_as_of_date: '2026-10-27' };
  it('submits with bearer authentication, no supplied owner or organisation and validates status', async () => {
    const plan = { plan_id: 'p1', quantity_mt: 500, purchase_deadline: '2026-11-15', scenario_as_of_date: '2026-10-27', days_remaining: 19, status: 'submitted', submitted_at: '2026-10-27T08:00:00Z' };
    const fetchMock = mockFetch(200, { plan });
    await expect(service.submit!('p1', selection)).resolves.toEqual({ plan });
    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/v1/purchase-plans/p1/submit');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer session-token' } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(selection);
    mockFetch(200, { plan: { ...plan, status: 'draft' } });
    await expect(service.submit!('p1', selection)).rejects.toMatchObject({ status: 502 });
  });
  it('reads and validates the manager inbox, propagating forbidden responses', async () => {
    const fetchMock = mockFetch(200, { notifications: [] });
    await expect(service.notifications!()).resolves.toEqual({ notifications: [] });
    expect(fetchMock.mock.calls[0][0]).toBe('http://backend.test/api/v1/purchase-plans/approval-notifications');
    mockFetch(200, { notifications: [{ notification_id: 'n1', quantity_mt: 'invalid' }] });
    await expect(service.notifications!()).rejects.toMatchObject({ status: 502 });
    mockFetch(403, { detail: 'Manager membership is required.' });
    await expect(service.notifications!()).rejects.toMatchObject({ status: 403, detail: 'Manager membership is required.' });
  });
});

describe('saved recommendation transport', () => {
  const raw = {
    provenance: 'model', approval_fingerprint: 'a'.repeat(64),
    context: { plan_id: 'p1', quantity_mt: 500, purchase_deadline: '2026-11-15', scenario_as_of_date: '2026-10-27', urgency: 'HIGH' },
    reference: { status: 'ready', value: { price: 700, observation_date: '2026-10-27', basis: { commodity: 'MGO', currency: 'USD', unit: 'MT' } } },
    forecast: { status: 'ready', value: { run_id: 'saved-run', model_version: 'ridge-saved', prices: { lower: 680, upper: 740 },
      central_estimate: 710, target_date: '2026-11-10', basis: { commodity: 'MGO', currency: 'USD', unit: 'MT' }, range_description: 'Experimental range' } },
    cost_impact: { status: 'ready', value: { currency: 'USD', target_date: '2026-11-10', reference_total: 350000,
      forecast_total: { lower: 340000, upper: 370000 }, difference_total: { lower: -10000, upper: 20000 }, central_total: 355000 } },
    recommendation: { status: 'ready', value: { recommendation_id: 'saved-rec', action: 'WAIT', explanation: 'Saved at submission.' } },
  };
  it('reads the stored choice, including historical context and the original forecast version', async () => {
    const request = mockFetch(200, { submission: { horizon_days: 14, analysis: raw } });
    const result = await service.readSubmission!('p1');
    expect(request.mock.calls[0][0]).toBe('http://backend.test/api/v1/purchase-plans/p1/submission');
    expect(result.submission).toMatchObject({ horizon_days: 14, analysis: { source: 'api', approval_fingerprint: 'a'.repeat(64),
      context: { urgency: 'HIGH' }, forecast: { value: { run_id: 'saved-run', model_version: 'ridge-saved' } } } });
  });
  it('rejects snapshots for another plan or an unsupported horizon', async () => {
    mockFetch(200, { submission: { horizon_days: 14, analysis: { ...raw, context: { ...raw.context, plan_id: 'other' } } } });
    await expect(service.readSubmission!('p1')).rejects.toMatchObject({ status: 502 });
    mockFetch(200, { submission: { horizon_days: 5, analysis: raw } });
    await expect(service.readSubmission!('p1')).rejects.toMatchObject({ status: 502 });
  });
  it('preserves the absence of a snapshot on a legacy submission', async () => {
    mockFetch(200, { submission: null });
    await expect(service.readSubmission!('p1')).resolves.toMatchObject({ submission: null, decision: null, purchase: null, withdrawal: null, revision_plan_ids: [] });
  });
});

describe('manager decision transport', () => {
  it('posts only the final choice, comment and reviewed fingerprint using the session token', async () => {
    const input = { decision: 'approved' as const, comment: '', approval_fingerprint: 'a'.repeat(64) };
    const request = mockFetch(200, { plan: { ...DEMO_PLAN, status: 'approved' } });
    await expect(service.decide!('p1', input)).resolves.toMatchObject({ plan: { status: 'approved' } });
    expect(request.mock.calls[0][0]).toBe('http://backend.test/api/v1/purchase-plans/p1/decision');
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual(input);
    expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer session-token');
    mockFetch(409, { detail: 'Already decided.' });
    await expect(service.decide!('p1', input)).rejects.toMatchObject({ status: 409, detail: 'Already decided.' });
  });
  it('rejects a response with the wrong final status or a malformed audit record', async () => {
    mockFetch(200, { plan: { ...DEMO_PLAN, status: 'submitted' } });
    await expect(service.decide!('p1', { decision: 'rejected', comment: 'Budget', approval_fingerprint: 'a'.repeat(64) })).rejects.toMatchObject({ status: 502 });
    mockFetch(200, { submission: null, decision: { decision: 'rejected', comment: '' } });
    await expect(service.readSubmission!('p1')).rejects.toMatchObject({ status: 502 });
  });
});
