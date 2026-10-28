import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PurchasePlanPage } from './PurchasePlanPage';
import { DEMO_PLAN, DEMO_SCENARIO_DATE } from './fixtures';
import { createMockPlanService } from './mockService';
import { PlanError, type PurchasePlanService, type SavedPlanResponse } from './types';

/** Delete lives in each plan card's "More actions" menu. */
async function chooseDelete(user: ReturnType<typeof userEvent.setup>, scope: Pick<typeof screen, 'findByRole' | 'getByRole'> = screen) {
  await user.click(await scope.findByRole('button', { name: /More actions/ }));
  await user.click(scope.getByRole('button', { name: 'Delete' }));
}


function setup(service = createMockPlanService({ delayMs: 0 })) {
  const user = userEvent.setup();
  render(<StrictMode><PurchasePlanPage service={service} scenarioDate={DEMO_SCENARIO_DATE} /></StrictMode>);
  return user;
}

async function createDraft(user: ReturnType<typeof userEvent.setup>, quantity = '500', deadline = '2025-11-15') {
  await user.click(await screen.findByRole('button', { name: 'Create plan' }));
  await user.type(screen.getByLabelText('Quantity'), quantity);
  fireEvent.change(screen.getByLabelText('Purchase deadline'), { target: { value: deadline } });
}

describe('purchase plan journeys', () => {
  it('creates, discards edits, saves edits, cancels deletion, deletes and recreates', async () => {
    const user = setup();
    await createDraft(user);
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(await screen.findByText('500 MT')).toBeVisible();
    expect(screen.getByText('22 days')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create plan' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
    expect(screen.getByText('Plan saved')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByText('Plan saved')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '600');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('500 MT')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Quantity')).toHaveValue(500);
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '600');
    fireEvent.change(screen.getByLabelText('Purchase deadline'), { target: { value: '2025-11-20' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('600 MT')).toBeVisible();
    expect(screen.getByText('27 days')).toBeVisible();

    await chooseDelete(user);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Delete plan' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('600 MT')).toBeVisible();
    expect(screen.getByRole('button', { name: /More actions/ })).toHaveFocus();
    await chooseDelete(user);
    await user.click(screen.getByRole('button', { name: 'Delete plan' }));
    expect(await screen.findByText("You haven't created a purchase plan yet.")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create plan' })).toHaveFocus();
    expect(screen.getByText('Plan deleted')).toBeVisible();
    await createDraft(user, '250', '2025-10-24');
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(await screen.findByText('250 MT')).toBeVisible();
    expect(screen.getByText('0 days')).toBeVisible();
  });

  it('cancels create and validates required, positive quantity and historical dates', async () => {
    const user = setup();
    await user.click(await screen.findByRole('button', { name: 'Create plan' }));
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(screen.getByText('Enter a quantity.')).toBeVisible();
    expect(screen.getByText('Choose a purchase deadline.')).toBeVisible();
    expect(screen.getByLabelText('Quantity')).toHaveFocus();
    await user.type(screen.getByLabelText('Quantity'), '-1');
    fireEvent.change(screen.getByLabelText('Purchase deadline'), { target: { value: '2025-10-23' } });
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(screen.getByLabelText('Quantity')).toHaveAccessibleDescription('MT Quantity must be greater than zero.');
    expect(screen.getByText('Purchase deadline cannot be before 2025-10-24.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Create plan' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Create plan' }));
    expect(screen.getByLabelText('Quantity')).toHaveValue(null);
    expect(screen.getByLabelText('Purchase deadline')).toHaveValue('');
  });

  it('never flashes empty during loading and allows retry after an initial error in StrictMode', async () => {
    let rejectRead!: (reason: unknown) => void;
    const service = createMockPlanService({ delayMs: 0 });
    const read = vi.spyOn(service, 'list').mockImplementationOnce(() => new Promise((_, reject) => { rejectRead = reject; }));
    const user = setup(service);
    expect(screen.getByText('Loading your purchase plans...')).toBeVisible();
    expect(screen.queryByText("You haven't created a purchase plan yet.")).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => rejectRead(new PlanError('Connection failed.')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection failed.');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText("You haven't created a purchase plan yet.")).toBeVisible();
  });

  it('retains draft and maps backend field errors before retrying', async () => {
    const service = createMockPlanService({ delayMs: 0 });
    vi.spyOn(service, 'create').mockRejectedValueOnce(new PlanError('Please check your inputs.', { quantity_mt: 'Quantity was rejected by the server.' }, 422));
    const user = setup(service);
    await createDraft(user);
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please check your inputs.');
    expect(screen.getByLabelText('Quantity')).toHaveValue(500);
    expect(screen.getByLabelText('Quantity')).toHaveAccessibleDescription('MT Quantity was rejected by the server.');
    expect(screen.getByLabelText('Purchase deadline')).toHaveValue('2025-11-15');
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(await screen.findByText('500 MT')).toBeVisible();
  });

  it('prevents repeat saving and conflicting actions until the request resolves', async () => {
    let resolveSave!: (response: SavedPlanResponse) => void;
    const service = createMockPlanService({ delayMs: 0 });
    const create = vi.spyOn(service, 'create').mockImplementation(() => new Promise(resolve => { resolveSave = resolve; }));
    const user = setup(service);
    await createDraft(user);
    await user.dblClick(screen.getByRole('button', { name: 'Save plan' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Quantity')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create plan' })).toBeDisabled();
    await act(async () => resolveSave({ plan: DEMO_PLAN }));
    expect(await screen.findByText('500 MT')).toBeVisible();
  });

  it('retains the plan on delete failure, retries and blocks dismissal while deleting', async () => {
    const service = createMockPlanService({ delayMs: 0, initialPlan: DEMO_PLAN, failOnce: { delete: true } });
    const user = setup(service);
    await chooseDelete(user);
    await user.click(screen.getByRole('button', { name: 'Delete plan' }));
    expect(await screen.findByText('Deletion failed')).toBeVisible();
    expect(screen.getByText('500 MT')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    let resolveDelete!: () => void;
    const remove = vi.spyOn(service, 'delete').mockImplementation(() => new Promise(resolve => { resolveDelete = resolve; }));
    await user.dblClick(screen.getByRole('button', { name: 'Retry' }));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Deleting plan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.getByRole('dialog')).toBeVisible();
    await act(async () => resolveDelete());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText("You haven't created a purchase plan yet.")).toBeVisible();
  });

  it('dismisses a confirmation or failed deletion through the native Escape/cancel event', async () => {
    const user = setup(createMockPlanService({ delayMs: 0, initialPlan: DEMO_PLAN, failOnce: { delete: true } }));
    await chooseDelete(user);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /More actions/ })).toHaveFocus();
    await chooseDelete(user);
    await user.click(screen.getByRole('button', { name: 'Delete plan' }));
    await screen.findByText('Deletion failed');
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('500 MT')).toBeVisible();
  });
});

describe('multiple purchase plans', () => {
  it('creates another plan and edits or deletes only the selected card', async () => {
    const service = createMockPlanService({ initialPlan: DEMO_PLAN, delayMs: 0 });
    const update = vi.spyOn(service, 'update');
    const remove = vi.spyOn(service, 'delete');
    const user = setup(service);
    await screen.findByText('500 MT');
    await createDraft(user, '250');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('500 MT')).toBeVisible();
    await createDraft(user, '250');
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await screen.findByText('250 MT');
    expect(screen.getByText('500 MT')).toBeVisible();
    const second = (await service.list()).plans.find(plan => plan.quantity_mt === 250)!;
    const card = screen.getByText('250 MT').closest('section')!;
    expect(within(card).getByRole('link', { name: /View recommendation/ }))
      .toHaveAttribute('href', `/purchase-plans/recommendation?plan_id=${second.plan_id}`);
    await user.click(within(card).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '300' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('300 MT');
    expect(update).toHaveBeenCalledWith(second.plan_id, { quantity_mt: 300, purchase_deadline: '2025-11-15' });
    expect(screen.getByText('500 MT')).toBeVisible();
    await chooseDelete(user, within(screen.getByText('300 MT').closest('section')!));
    await user.click(screen.getByRole('button', { name: 'Delete plan' }));
    await waitFor(() => expect(screen.queryByText('300 MT')).not.toBeInTheDocument());
    expect(remove).toHaveBeenCalledWith(second.plan_id);
    expect(screen.getByText('500 MT')).toBeVisible();
    expect((await service.list()).plans).toEqual([DEMO_PLAN]);
  });
});

describe('plan overview and sorting', () => {
  const plans = [
    { ...DEMO_PLAN, plan_id: 'a', quantity_mt: 100, purchase_deadline: '2025-11-15', days_remaining: 22 },
    { ...DEMO_PLAN, plan_id: 'b', quantity_mt: 900, purchase_deadline: '2025-12-31', days_remaining: 68 },
    { ...DEMO_PLAN, plan_id: 'c', quantity_mt: 300, purchase_deadline: '2025-10-28', days_remaining: 4 },
  ];
  const titles = () => screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent);

  it('summarises active plans and the next deadline, and sorts by deadline or volume without changing plans', async () => {
    const service = createMockPlanService({ delayMs: 0, initialPlans: plans });
    const writes = [vi.spyOn(service, 'create'), vi.spyOn(service, 'update'), vi.spyOn(service, 'delete')];
    const user = setup(service);
    const overview = await screen.findByRole('region', { name: 'Plan summary' });
    expect(within(overview).getByText('Active plans').nextSibling).toHaveTextContent('3');
    expect(within(overview).getByText('Overdue plans').nextSibling).toHaveTextContent('0');
    expect(within(overview).getByText('Next deadline').nextSibling).toHaveTextContent(/4\s*days/);
    expect(titles()[0]).toMatch(/^300 MT/);
    const sort = screen.getByRole('group', { name: 'Sort by' });
    expect(within(sort).getByRole('button', { name: 'Deadline' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(sort).getByRole('button', { name: 'Volume' }));
    expect(within(sort).getByRole('button', { name: 'Volume' })).toHaveAttribute('aria-pressed', 'true');
    expect(titles().map(title => title?.split(' MT')[0])).toEqual(['900', '300', '100']);
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });
});

