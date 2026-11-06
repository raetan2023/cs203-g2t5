import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { PurchasePlanPage } from './PurchasePlanPage';
import { createMockPlanService } from './mockService';
import { DEMO_PLAN, DEMO_SCENARIO_DATE } from './fixtures';
import type { PlanStatus, PurchasePlan } from './types';

const plan = (plan_id: string, status: PlanStatus, extra: Partial<PurchasePlan> = {}): PurchasePlan => ({ ...DEMO_PLAN, plan_id, status, ...extra });
const tab = (name: RegExp) => screen.getByRole('button', { name });
const showPage = (initialPlans: PurchasePlan[], failOnce = {}) => {
  const service = createMockPlanService({ delayMs: 0, initialPlans, failOnce });
  render(<PurchasePlanPage service={service} scenarioDate={DEMO_SCENARIO_DATE} />);
  return { service, user: userEvent.setup() };
};

beforeEach(() => { window.history.replaceState(null, '', '/purchase-plans'); });

it('groups plans by whose move it is, opens on To do and has no summary strip', async () => {
  const { user } = showPage([plan('d', 'draft'), plan('a', 'approved'), plan('s', 'submitted'), plan('r', 'rejected'), plan('w', 'withdrawn'), plan('p', 'purchased')]);
  const todo = await screen.findByRole('button', { name: 'To do (2)' });
  expect(todo).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('region', { name: 'Plan summary' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'Awaiting approval (1)' }));
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Finished (3)' }));
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
});

it('updates the tab counts after creating and deleting a plan', async () => {
  const { user } = showPage([plan('d', 'draft'), plan('r', 'rejected')]);
  await user.click(await screen.findByRole('button', { name: 'Create plan' }));
  await user.type(screen.getByLabelText('Quantity'), '250');
  fireEvent.change(screen.getByLabelText('Purchase deadline'), { target: { value: '2025-11-20' } });
  await user.click(screen.getByRole('button', { name: 'Save plan' }));
  expect(await screen.findByRole('button', { name: 'To do (2)' })).toBeVisible();
  const card = screen.getByText('250 MT').closest('section')!;
  await user.click(within(card).getByRole('button', { name: /More actions/ }));
  await user.click(within(card).getByRole('button', { name: 'Delete' }));
  await user.click(screen.getByRole('button', { name: 'Delete plan' }));
  expect(await screen.findByRole('button', { name: 'To do (1)' })).toBeVisible();
  expect(tab(/^Finished/)).toHaveTextContent('Finished (1)');
});

it('returns to To do after saving, so a new plan is never hidden behind another tab', async () => {
  const { user } = showPage([plan('r', 'rejected')]);
  await user.click(await screen.findByRole('button', { name: 'Finished (1)' }));
  await user.click(screen.getByRole('button', { name: 'Create plan' }));
  await user.type(screen.getByLabelText('Quantity'), '250');
  fireEvent.change(screen.getByLabelText('Purchase deadline'), { target: { value: '2025-11-20' } });
  await user.click(screen.getByRole('button', { name: 'Save plan' }));
  expect(await screen.findByText('250 MT')).toBeVisible();
  expect(tab(/^To do/)).toHaveAttribute('aria-pressed', 'true');
});

it('says so when a tab is empty', async () => {
  const { user } = showPage([plan('r', 'rejected')]);
  expect(await screen.findByText('Nothing to do right now.')).toBeVisible();
  await user.click(tab(/^Awaiting approval/));
  expect(screen.getByText('No plans awaiting approval.')).toBeVisible();
});

it('copies a rejected plan from its card into the edit form, then links to the copy', async () => {
  const { service, user } = showPage([plan('r', 'rejected')]);
  const revise = vi.spyOn(service, 'revise' as never);
  await user.click(await screen.findByRole('button', { name: 'Finished (1)' }));
  await user.click(screen.getByRole('button', { name: /^Copy to new draft/ }));
  expect(await screen.findByRole('heading', { name: 'Your purchase plan' })).toBeVisible();
  expect(screen.getByLabelText('Quantity')).toHaveValue(DEMO_PLAN.quantity_mt);
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(tab(/^To do/)).toHaveTextContent('To do (1)'));
  expect(tab(/^To do/)).toHaveAttribute('aria-pressed', 'true');
  await user.click(tab(/^Finished/));
  const copy = (await service.list()).plans.find(saved => saved.previous_plan_id === 'r')!;
  expect(screen.getByRole('link', { name: /View copied plan/ })).toHaveAttribute('href', `/purchase-plans/recommendation?plan_id=${copy.plan_id}`);
  expect(screen.queryByRole('button', { name: /^Copy to new draft/ })).not.toBeInTheDocument();
  expect(revise).toHaveBeenCalledOnce();
});

it('keeps a cancelled copy as a draft in To do', async () => {
  const { user } = showPage([plan('r', 'rejected')]);
  await user.click(await screen.findByRole('button', { name: 'Finished (1)' }));
  await user.click(screen.getByRole('button', { name: /^Copy to new draft/ }));
  await user.click(await screen.findByRole('button', { name: 'Cancel' }));
  expect(await screen.findByRole('button', { name: 'To do (1)' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Draft')).toBeVisible();
});

it('shows a failed copy and re-reads the plans in case it saved', async () => {
  const { service, user } = showPage([plan('r', 'rejected')], { revise: true });
  const list = vi.spyOn(service, 'list');
  await user.click(await screen.findByRole('button', { name: 'Finished (1)' }));
  await user.click(screen.getByRole('button', { name: /^Copy to new draft/ }));
  expect(await screen.findByRole('alert')).toBeVisible();
  await waitFor(() => expect(list).toHaveBeenCalled());
  expect(await screen.findByRole('button', { name: /^Copy to new draft/ })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: /^Copy to new draft/ }));
  expect(await screen.findByRole('heading', { name: 'Your purchase plan' })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
