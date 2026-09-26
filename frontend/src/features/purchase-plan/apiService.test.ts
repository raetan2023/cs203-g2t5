import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApiPlanService, fetchScenarioDate } from './apiService';
import { PlanError } from './types';

const options = { baseUrl: 'http://backend.test', apiKey: 'test-key', userId: 'user-uuid' };
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
  it('sends both headers and returns the saved plan', async () => {
    const plan = { plan_id: 'p1', quantity_mt: 500, purchase_deadline: '2025-11-15', scenario_as_of_date: '2025-10-24', days_remaining: 22 };
    const fetchMock = mockFetch(200, { plan });

    await expect(service.read()).resolves.toEqual({ plan });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://backend.test/api/v1/purchase-plan');
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ 'X-API-Key': 'test-key', 'X-User-Id': 'user-uuid' });
  });

  it('returns a null plan without treating it as an error', async () => {
    mockFetch(200, { plan: null });
    await expect(service.read()).resolves.toEqual({ plan: null });
  });

  it('sends the input as JSON when creating', async () => {
    const fetchMock = mockFetch(201, { plan: null });
    await service.create({ quantity_mt: 500, purchase_deadline: '2025-11-15' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ quantity_mt: 500, purchase_deadline: '2025-11-15' });
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
    [404, 'No saved purchase plan was found.'],
    [401, 'Please sign in again.'],
  ])('passes through the %i message from the backend', async (status, detail) => {
    mockFetch(status, { detail });
    const error = await service.read().catch(e => e);
    expect(error.status).toBe(status);
    expect(error.detail).toBe(detail);
  });

  it('accepts an empty 204 body when deleting', async () => {
    mockFetch(204);
    await expect(service.delete()).resolves.toBeUndefined();
  });

  it('reports a friendly message when the backend cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await service.read().catch(e => e);
    expect(error).toBeInstanceOf(PlanError);
    expect(error.status).toBe(0);
    expect(error.detail).toContain("couldn't load");
  });
});

describe('fetchScenarioDate', () => {
  it('reads the configured date, which is available before any plan exists', async () => {
    mockFetch(200, { scenario_as_of_date: '2025-10-24' });
    await expect(fetchScenarioDate(options)).resolves.toBe('2025-10-24');
  });
});
