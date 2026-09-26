import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PurchasePlanPage } from './PurchasePlanPage';
import { DEMO_PLAN, DEMO_SCENARIO_DATE } from './fixtures';
import { createMockPlanService } from './mockService';
import { PlanError, type PurchasePlanService, type SavedPlanResponse } from './types';

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
    expect(screen.getByRole('button', { name: 'Create plan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
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

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Delete plan' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('600 MT')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete plan' }));
    expect(await screen.findByText("You haven't created a purchase plan yet.")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create plan' })).toHaveFocus();
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
    const read = vi.spyOn(service, 'read').mockImplementationOnce(() => new Promise((_, reject) => { rejectRead = reject; }));
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
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
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
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete plan' }));
    await screen.findByText('Deletion failed');
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('500 MT')).toBeVisible();
  });
});
