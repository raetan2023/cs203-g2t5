import { describe, expect, it } from 'vitest';
import { calendarDays, formatDate } from './dates';
import { DEMO_PLAN } from './fixtures';
import { createMockPlanService } from './mockService';
import { validateDraft } from './validation';

describe('mock API contract and dates', () => {
  it('uses the active scenario on reads and writes without losing a saved overdue plan', async () => {
    let date = '2025-11-01';
    const service = createMockPlanService({ initialPlan: DEMO_PLAN, delayMs: 0, getScenarioDate: () => date });
    expect((await service.read(DEMO_PLAN.plan_id)).plan).toMatchObject({ plan_id: DEMO_PLAN.plan_id, days_remaining: 14, scenario_as_of_date: date });
    date = '2025-11-16';
    expect((await service.read(DEMO_PLAN.plan_id)).plan).toMatchObject({ plan_id: DEMO_PLAN.plan_id, days_remaining: -1 });
    await expect(service.update(DEMO_PLAN.plan_id, { quantity_mt: 600, purchase_deadline: '2025-11-15' })).rejects.toMatchObject({ status: 422 });
    expect((await service.read(DEMO_PLAN.plan_id)).plan?.quantity_mt).toBe(500);
    expect((await service.update(DEMO_PLAN.plan_id, { quantity_mt: 600.25, purchase_deadline: date })).plan).toMatchObject({ days_remaining: 0, quantity_mt: 600.25 });
  });

  it('keeps independent plans, recalculates dates, and deletes only the selected plan', async () => {
    const service = createMockPlanService({ delayMs: 0 });
    expect(await service.list()).toEqual({ plans: [] });
    const first = (await service.create({ quantity_mt: 500.25, purchase_deadline: '2025-11-15' })).plan;
    const second = (await service.create({ quantity_mt: 250, purchase_deadline: '2025-11-15' })).plan;
    expect(first.plan_id).not.toBe(second.plan_id);
    expect((await service.list()).plans).toHaveLength(2);
    expect((await service.update(first.plan_id, { quantity_mt: 600, purchase_deadline: '2025-10-24' })).plan)
      .toMatchObject({ plan_id: first.plan_id, days_remaining: 0 });
    expect((await service.read(second.plan_id)).plan).toEqual(second);
    await service.delete(first.plan_id);
    expect(await service.list()).toEqual({ plans: [second] });
    await expect(service.update(first.plan_id, { quantity_mt: 1, purchase_deadline: '2025-11-15' })).rejects.toMatchObject({ status: 404 });
    await expect(service.delete(first.plan_id)).rejects.toMatchObject({ status: 404 });
  });

  it('keeps stored data unchanged on failure and does not expose mutable references', async () => {
    const service = createMockPlanService({ delayMs: 0, initialPlan: DEMO_PLAN, failOnce: { update: true, delete: true } });
    await expect(service.update(DEMO_PLAN.plan_id, { quantity_mt: 600, purchase_deadline: '2025-11-20' })).rejects.toThrow();
    await expect(service.delete(DEMO_PLAN.plan_id)).rejects.toThrow();
    expect(await service.read(DEMO_PLAN.plan_id)).toEqual({ plan: DEMO_PLAN });
    const response = await service.read(DEMO_PLAN.plan_id);
    response.plan!.quantity_mt = 999;
    expect((await service.read(DEMO_PLAN.plan_id)).plan!.quantity_mt).toBe(500);
    await service.delete(DEMO_PLAN.plan_id);
    expect(await service.read(DEMO_PLAN.plan_id)).toEqual({ plan: null });
  });

  it('validates malformed quantities and dates while allowing decimals and the scenario day', () => {
    for (const quantity of ['0', '-1', 'abc', 'Infinity', '1e999']) {
      expect(validateDraft({ quantity, deadline: '2025-11-15' }, '2025-10-24').quantity_mt).toBeTruthy();
    }
    expect(validateDraft({ quantity: '0.25', deadline: '2025-10-24' }, '2025-10-24')).toEqual({});
    expect(validateDraft({ quantity: '1', deadline: '2025-02-30' }, '2025-01-01').purchase_deadline).toBeTruthy();
    expect(calendarDays('2025-10-24', '2025-11-15')).toBe(22);
    expect(formatDate('2025-10-24')).toBe('24 Oct 2025');
  });
});
