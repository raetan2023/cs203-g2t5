import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRecommendationDecisionsService } from './recommendationDecisionsApi';
import { PlanError } from '../purchase-plan/types';

const options = { baseUrl: 'http://api.test', getToken: async () => 'token-123' };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('recommendation decisions api', () => {
  it('posts a decision against the recommendation version and parses the saved row', async () => {
    const saved = { id: 'd1', plan_id: 'p1', recommendation_id: 'rec-1', run_id: null, action: 'WAIT', decision: 'accept', reason: '', decided_at: '2026-11-01T14:00:00Z' };
    fetchMock.mockResolvedValue(jsonResponse({ decision: saved }));
    const service = createRecommendationDecisionsService(options);
    const result = await service.record('p1', { recommendationId: 'rec-1', decision: 'accept', action: 'WAIT' });
    expect(result).toMatchObject({ id: 'd1', recommendation_id: 'rec-1', decision: 'accept' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://api.test/api/v1/purchase-plans/p1/recommendation-decision');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ recommendation_id: 'rec-1', decision: 'accept', action: 'WAIT', reason: '' });
    expect(init.headers.Authorization).toBe('Bearer token-123');
  });

  it('lists the buyer history as returned', async () => {
    const rows = [
      { id: 'd2', plan_id: 'p1', recommendation_id: 'rec-2', run_id: null, action: null, decision: 'reject', reason: 'Too costly', decided_at: '2026-11-01T15:00:00Z' },
      { id: 'd1', plan_id: 'p1', recommendation_id: 'rec-1', run_id: null, action: null, decision: 'accept', reason: '', decided_at: '2026-11-01T14:00:00Z' },
    ];
    fetchMock.mockResolvedValue(jsonResponse({ decisions: rows }));
    const service = createRecommendationDecisionsService(options);
    const result = await service.history('p1');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'd2', decision: 'reject', reason: 'Too costly' });
  });

  it('surfaces the backend error detail', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'A reason is required when rejecting a recommendation.' }, false, 422));
    const service = createRecommendationDecisionsService(options);
    await expect(service.record('p1', { recommendationId: 'rec-1', decision: 'reject' }))
      .rejects.toThrow('A reason is required when rejecting a recommendation.');
  });

  it('throws when not signed in', async () => {
    const service = createRecommendationDecisionsService({ baseUrl: 'http://api.test', getToken: async () => null });
    await expect(service.history()).rejects.toBeInstanceOf(PlanError);
  });
});
