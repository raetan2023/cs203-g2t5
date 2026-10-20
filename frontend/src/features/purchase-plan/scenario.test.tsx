import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PurchasePlanPage } from './PurchasePlanPage';
import { DEMO_PLAN, DEMO_SCENARIO_DATE } from './fixtures';
import { createMockPlanService } from './mockService';
import type { PlanResponse, SavedPlanResponse } from './types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const nextDate = '2025-11-01';
const refreshed = { ...DEMO_PLAN, scenario_as_of_date: nextDate, days_remaining: 14 };

describe('active historical scenario', () => {
  it('refreshes a saved plan and validates edits against the active date', async () => {
    const user = userEvent.setup();
    let date = DEMO_SCENARIO_DATE;
    const service = createMockPlanService({ initialPlan: DEMO_PLAN, delayMs: 0, getScenarioDate: () => date });
    const view = render(<PurchasePlanPage service={service} scenarioDate={date} />);
    expect(await screen.findByText('22 days')).toBeVisible();
    date = nextDate;
    view.rerender(<PurchasePlanPage service={service} scenarioDate={date} />);
    expect(await screen.findByText('14 days')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Purchase deadline')).toHaveAttribute('min', nextDate);
    fireEvent.change(screen.getByLabelText('Purchase deadline'), { target: { value: '2025-10-31' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText('Purchase deadline cannot be before 2025-11-01.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Purchase deadline'), { target: { value: nextDate } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('0 days')).toBeVisible();
  });

  it('does not display a backend response for an obsolete scenario as current and can retry', async () => {
    const user = userEvent.setup();
    const service = createMockPlanService({ initialPlan: DEMO_PLAN, delayMs: 0 });
    vi.spyOn(service, 'read').mockResolvedValueOnce({ plan: DEMO_PLAN }).mockResolvedValueOnce({ plan: refreshed });
    render(<PurchasePlanPage service={service} scenarioDate={nextDate} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('active historical scenario');
    expect(screen.queryByText('22 days')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('14 days')).toBeVisible();
  });

  it('ignores late reads, including an A to B to A scenario transition', async () => {
    const first = deferred<PlanResponse>();
    const second = deferred<PlanResponse>();
    const service = createMockPlanService({ delayMs: 0 });
    vi.spyOn(service, 'read').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      .mockResolvedValueOnce({ plan: { ...DEMO_PLAN, quantity_mt: 700 } });
    const view = render(<PurchasePlanPage service={service} scenarioDate={DEMO_SCENARIO_DATE} />);
    view.rerender(<PurchasePlanPage service={service} scenarioDate={nextDate} />);
    view.rerender(<PurchasePlanPage service={service} scenarioDate={DEMO_SCENARIO_DATE} />);
    expect(await screen.findByText('700 MT')).toBeVisible();
    await act(async () => { first.resolve({ plan: DEMO_PLAN }); second.resolve({ plan: refreshed }); });
    expect(screen.getByText('700 MT')).toBeVisible();
    expect(screen.queryByText('500 MT')).not.toBeInTheDocument();
  });

  it('reconciles a save finishing after a scenario change without showing its obsolete response', async () => {
    const user = userEvent.setup();
    const pending = deferred<SavedPlanResponse>();
    const service = createMockPlanService({ initialPlan: DEMO_PLAN, delayMs: 0 });
    const read = vi.spyOn(service, 'read').mockResolvedValueOnce({ plan: DEMO_PLAN })
      .mockResolvedValueOnce({ plan: refreshed })
      .mockResolvedValue({ plan: { ...refreshed, quantity_mt: 600 } });
    vi.spyOn(service, 'update').mockReturnValue(pending.promise);
    const view = render(<PurchasePlanPage service={service} scenarioDate={DEMO_SCENARIO_DATE} />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '600' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    view.rerender(<PurchasePlanPage service={service} scenarioDate={nextDate} />);
    expect(await screen.findByText('14 days')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await act(async () => pending.resolve({ plan: { ...DEMO_PLAN, quantity_mt: 600 } }));
    expect(await screen.findByText('600 MT')).toBeVisible();
    expect(screen.getByText('14 days')).toBeVisible();
    expect(screen.queryByText('22 days')).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
  });

  it('ignores a previous account save after replacing the service', async () => {
    const user = userEvent.setup();
    const pending = deferred<SavedPlanResponse>();
    const oldService = createMockPlanService({ initialPlan: DEMO_PLAN, delayMs: 0 });
    vi.spyOn(oldService, 'update').mockReturnValue(pending.promise);
    const newService = createMockPlanService({ delayMs: 0 });
    const view = render(<PurchasePlanPage service={oldService} scenarioDate={DEMO_SCENARIO_DATE} />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    view.rerender(<PurchasePlanPage service={newService} scenarioDate={DEMO_SCENARIO_DATE} />);
    await screen.findByText("You haven't created a purchase plan yet.");
    await act(async () => pending.resolve({ plan: DEMO_PLAN }));
    expect(screen.queryByText('500 MT')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create plan' })).toBeEnabled();
  });

  it('re-reads after an old-scenario delete settles and does not retain a deleted plan', async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    const service = createMockPlanService({ initialPlan: DEMO_PLAN, delayMs: 0 });
    vi.spyOn(service, 'read').mockResolvedValueOnce({ plan: DEMO_PLAN })
      .mockResolvedValueOnce({ plan: refreshed }).mockResolvedValue({ plan: null });
    vi.spyOn(service, 'delete').mockReturnValue(pending.promise);
    const view = render(<PurchasePlanPage service={service} scenarioDate={DEMO_SCENARIO_DATE} />);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete plan' }));
    view.rerender(<PurchasePlanPage service={service} scenarioDate={nextDate} />);
    expect(await screen.findByText('14 days')).toBeVisible();
    await act(async () => pending.resolve());
    expect(await screen.findByText("You haven't created a purchase plan yet.")).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('invalidates a successful save with a mismatched response but hides obsolete days', async () => {
    const user = userEvent.setup();
    const invalidate = vi.fn();
    const service = createMockPlanService({ delayMs: 0 });
    vi.spyOn(service, 'create').mockResolvedValue({ plan: DEMO_PLAN });
    render(<PurchasePlanPage service={service} scenarioDate={nextDate} onInvalidateAnalysis={invalidate} />);
    await user.click(await screen.findByRole('button', { name: 'Create plan' }));
    invalidate.mockClear();
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Purchase deadline'), { target: { value: '2025-11-15' } });
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('active historical scenario');
    expect(screen.queryByText('22 days')).not.toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('invalidates consumers on context changes and successful writes, but retains a failed edit draft', async () => {
    const user = userEvent.setup();
    const invalidate = vi.fn();
    const service = createMockPlanService({ initialPlan: DEMO_PLAN, delayMs: 0, failOnce: { update: true } });
    render(<PurchasePlanPage service={service} scenarioDate={DEMO_SCENARIO_DATE} onInvalidateAnalysis={invalidate} />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    invalidate.mockClear();
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '600' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Quantity')).toHaveValue(600);
    expect(invalidate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('500 MT')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('500 MT');
    expect(invalidate).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete plan' }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
  });
});
