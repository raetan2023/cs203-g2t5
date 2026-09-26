import { describe, expect, it } from 'vitest';
import { calendarDays, formatDate } from './dates';
import { DEMO_PLAN } from './fixtures';
import { createMockPlanService } from './mockService';
import { validateDraft } from './validation';

describe('mock API contract and dates', () => {
  it('returns API wrappers, enforces one plan, recalculates dates, and deletes without a body', async () => {
    const service = createMockPlanService({ delayMs: 0 });
    expect(await service.read()).toEqual({ plan: null });
    const saved = await service.create({ quantity_mt: 500.25, purchase_deadline: '2025-11-15' });
    expect(saved.plan).toMatchObject({ quantity_mt: 500.25, scenario_as_of_date: '2025-10-24', days_remaining: 22 });
    await expect(service.create({ quantity_mt: 1, purchase_deadline: '2025-11-15' })).rejects.toMatchObject({ status: 409 });
    expect((await service.update({ quantity_mt: 600, purchase_deadline: '2025-10-24' })).plan).toMatchObject({ plan_id: saved.plan.plan_id, days_remaining: 0 });
    expect(await service.delete()).toBeUndefined();
    expect(await service.read()).toEqual({ plan: null });
    await expect(service.update({ quantity_mt: 1, purchase_deadline: '2025-11-15' })).rejects.toMatchObject({ status: 404 });
    await expect(service.delete()).rejects.toMatchObject({ status: 404 });
  });

  it('keeps stored data unchanged on failure and does not expose mutable references', async () => {
    const service = createMockPlanService({ delayMs: 0, initialPlan: DEMO_PLAN, failOnce: { update: true, delete: true } });
    await expect(service.update({ quantity_mt: 600, purchase_deadline: '2025-11-20' })).rejects.toThrow();
    await expect(service.delete()).rejects.toThrow();
    expect(await service.read()).toEqual({ plan: DEMO_PLAN });
    const response = await service.read();
    response.plan!.quantity_mt = 999;
    expect((await service.read()).plan!.quantity_mt).toBe(500);
    await service.delete();
    expect(await service.read()).toEqual({ plan: null });
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
