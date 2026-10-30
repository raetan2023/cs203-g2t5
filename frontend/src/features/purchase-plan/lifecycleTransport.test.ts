import { afterEach, expect, it, vi } from 'vitest';
import { createApiPlanService } from './apiService';
import { DEMO_PLAN } from './fixtures';
import { parseBuyerNotifications, parseOutcomes } from './lifecycleTransport';

afterEach(() => vi.unstubAllGlobals());
it('uses authenticated lifecycle routes and validates new states and previous-plan links', async () => {
  const service = createApiPlanService({ baseUrl: 'http://api.test', getToken: () => 'session' });
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ plan: { ...DEMO_PLAN, status: 'withdrawn' } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ plan: { ...DEMO_PLAN, plan_id: 'copy', status: 'draft', previous_plan_id: DEMO_PLAN.plan_id } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ plan: { ...DEMO_PLAN, status: 'purchased' } })))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetcher);
  await service.withdraw!(DEMO_PLAN.plan_id, 'Schedule changed');
  expect(fetcher.mock.calls[0][0]).toContain(`/${DEMO_PLAN.plan_id}/withdraw`);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer session' }, body: JSON.stringify({ reason: 'Schedule changed' }) });
  expect((await service.revise!(DEMO_PLAN.plan_id)).plan.previous_plan_id).toBe(DEMO_PLAN.plan_id);
  await service.recordPurchase!(DEMO_PLAN.plan_id, { purchased_on: '2026-10-29', supplier: 'A', quantity_mt: 5, price_usd_per_mt: 900 });
  expect(fetcher.mock.calls[2][0]).toContain('/purchase');
  await service.markNotificationSeen!('notification/a');
  expect(fetcher.mock.calls[3][0]).toContain('/my-notifications/notification%2Fa/seen');
});

it('rejects a revision that loses its link and a purchase response with the wrong status', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ plan: { ...DEMO_PLAN, status: 'draft' } }))));
  const service = createApiPlanService();
  await expect(service.revise!(DEMO_PLAN.plan_id)).rejects.toMatchObject({ status: 502 });
  await expect(service.recordPurchase!(DEMO_PLAN.plan_id, { purchased_on: '2026-10-29', supplier: 'A', quantity_mt: 5, price_usd_per_mt: 900 })).rejects.toMatchObject({ status: 502 });
});

const notification = { notification_id: 'n1', plan_id: 'p1', decision: 'approved', created_at: '2026-10-29T01:00:00Z', seen_at: null,
  quantity_mt: 10, purchase_deadline: '2026-11-01', manager_label: 'Manager', comment: '' };
it('validates notifications, timestamps, counts and duplicate IDs', () => {
  expect(parseBuyerNotifications({ notifications: [notification], unread_count: 101 }).unread_count).toBe(101);
  for (const payload of [{ notifications: [notification], unread_count: -1 }, { notifications: [{ ...notification, seen_at: 'bad' }], unread_count: 1 },
    { notifications: [notification, notification], unread_count: 2 }]) expect(() => parseBuyerNotifications(payload)).toThrow();
});

it('validates purchase outcomes and preserves unavailable comparisons as null', () => {
  const purchase = { purchase_id: 'purchase', purchased_on: '2026-10-29', supplier: 'A', quantity_mt: 5.25, price_usd_per_mt: 900.12,
    total_usd: 4725.63, note: '', recorded_at: '2026-10-29T01:00:00Z' };
  expect(parseOutcomes({ purchase, comparison: null, withdrawal: null, revision_plan_ids: ['copy'] })).toMatchObject({ purchase, comparison: null });
  for (const payload of [{ purchase: { ...purchase, total_usd: Infinity } }, { purchase: { ...purchase, purchased_on: '2026-02-31' } },
    { revision_plan_ids: [null] }, { withdrawal: { reason: '', withdrawn_at: 'bad' } }, { comparison: { actual_total: 2 } }])
    expect(() => parseOutcomes(payload)).toThrow();
});
