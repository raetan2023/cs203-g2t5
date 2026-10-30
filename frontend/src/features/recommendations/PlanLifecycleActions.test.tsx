import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { createMockPlanService } from '../purchase-plan/mockService';
import { PlanError, type PurchasePlan, type PurchasePlanService } from '../purchase-plan/types';
import { SubmittedRecommendationView } from './RecommendationApproval';
import { scenarioPlan, SCENARIO_DATE, withPreviewApproval } from '../../preview/recommendationScenarios';
import { PurchasePlanPage } from '../purchase-plan/PurchasePlanPage';
import { BuyerDecisionsProvider, BuyerDecisions } from '../purchase-plan/components/BuyerDecisions';
import { AppShell } from '../../components/AppShell';

afterEach(() => { window.history.replaceState(null, '', '/'); });
async function fixture(start: 'submitted' | 'approved' | 'rejected' | 'purchased' = 'submitted') {
  const service = withPreviewApproval(createMockPlanService({ initialPlan: scenarioPlan('wait'), scenarioDate: SCENARIO_DATE, delayMs: 0 }), 'wait', start);
  return { service, plan: (await service.read(scenarioPlan('wait').plan_id)).plan! };
}
function Request({ service, initial, canAct = true }: { service: PurchasePlanService; initial: PurchasePlan; canAct?: boolean }) {
  const [plan, setPlan] = useState(initial), [attempt, setAttempt] = useState(0);
  return <SubmittedRecommendationView key={`${plan.status}:${attempt}`} plan={plan} planService={service} today={SCENARIO_DATE} canAct={canAct}
    onChanged={setPlan} onReload={() => { void service.read(plan.plan_id).then(({ plan }) => { if (plan) { setPlan(plan); setAttempt(n => n + 1); } }); }} />;
}

it('confirms withdrawal, keeps its reason, and offers a linked draft afterwards', async () => {
  const { service, plan } = await fixture(), user = userEvent.setup();
  const withdraw = vi.spyOn(service, 'withdraw');
  render(<Request service={service} initial={plan} />);
  await user.click(await screen.findByRole('button', { name: 'Withdraw request' }));
  expect(withdraw).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Withdraw request' }));
  await user.type(screen.getByLabelText('Withdrawal reason (optional)'), 'Schedule changed');
  await user.click(screen.getByRole('button', { name: 'Confirm withdrawal' }));
  expect(await screen.findByRole('heading', { name: 'Request withdrawn' })).toBeVisible();
  expect(screen.getByText(/Schedule changed/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Copy to new draft' })).toBeVisible();
  expect((await service.readSubmission!(plan.plan_id)).withdrawal?.reason).toBe('Schedule changed');
});

it('copies a rejected plan into an editable linked draft with the earlier rejection note', async () => {
  const { service, plan } = await fixture('rejected'), user = userEvent.setup();
  const view = render(<Request service={service} initial={plan} />);
  await user.click(await screen.findByRole('button', { name: 'Copy to new draft' }));
  await user.click(screen.getByRole('button', { name: 'Create linked draft' }));
  await waitFor(() => expect(window.location.search).toContain('edit_plan_id='));
  view.unmount(); render(<PurchasePlanPage service={service} scenarioDate={SCENARIO_DATE} />);
  expect(await screen.findByRole('heading', { name: 'Your purchase plan' })).toBeVisible();
  expect(await screen.findByText(/Earlier reason: Over this month’s budget/)).toBeVisible();
  const plans = await service.list();
  expect(plans.plans).toHaveLength(2);
  expect(plans.plans.find(p => p.status === 'draft')?.previous_plan_id).toBe(plan.plan_id);
  expect(plans.plans.find(p => p.plan_id === plan.plan_id)?.status).toBe('rejected');
});

it('validates fields and records one purchase, showing quantity-adjusted comparisons', async () => {
  const { service, plan } = await fixture('approved'), user = userEvent.setup();
  const record = vi.spyOn(service as Required<PurchasePlanService>, 'recordPurchase');
  render(<Request service={service} initial={plan} />);
  await user.click(await screen.findByRole('button', { name: 'Record purchase' }));
  await user.click(screen.getByRole('button', { name: 'Confirm purchase record' }));
  expect(record).not.toHaveBeenCalled(); expect(screen.getByLabelText('Supplier')).toHaveAttribute('aria-invalid', 'true');
  await user.type(screen.getByLabelText('Supplier'), 'Supplier A');
  await user.clear(screen.getByLabelText('Actual quantity (MT)')); await user.type(screen.getByLabelText('Actual quantity (MT)'), '20.5');
  await user.type(screen.getByLabelText('Price paid (USD/MT)'), '1200.12');
  await user.click(screen.getByRole('button', { name: 'Confirm purchase record' }));
  const outcome = await screen.findByRole('region', { name: 'Recorded purchase' });
  expect(await screen.findByRole('heading', { name: 'Purchase recorded' })).toBeVisible();
  expect(within(outcome).getByText('USD 24,602.46')).toBeVisible();
  expect(within(outcome).getByText(/Differences compare the same actual quantity/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Record purchase' })).not.toBeInTheDocument();
  expect(record).toHaveBeenCalledTimes(1);
});

it('keeps purchase drafts on validation errors and requires reload after a conflict', async () => {
  const { service, plan } = await fixture('approved'), user = userEvent.setup();
  const record = vi.spyOn(service as Required<PurchasePlanService>, 'recordPurchase')!.mockRejectedValueOnce(new PlanError('Supplier is invalid', { supplier: 'Use the invoice supplier.' }, 422))
    .mockRejectedValueOnce(new PlanError('The plan changed. Reload.', {}, 409));
  const reload = vi.fn();
  render(<SubmittedRecommendationView plan={plan} planService={service} canAct today={SCENARIO_DATE} onReload={reload} />);
  await user.click(await screen.findByRole('button', { name: 'Record purchase' }));
  await user.type(screen.getByLabelText('Supplier'), 'Keep this supplier'); await user.type(screen.getByLabelText('Price paid (USD/MT)'), '1200');
  await user.click(screen.getByRole('button', { name: 'Confirm purchase record' }));
  expect(await screen.findByText('Use the invoice supplier.')).toBeVisible();
  expect(screen.getByLabelText('Supplier')).toHaveValue('Keep this supplier');
  await user.click(screen.getByRole('button', { name: 'Confirm purchase record' }));
  expect(await screen.findByText('The plan changed. Reload.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Confirm purchase record' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Reload request' })); expect(reload).toHaveBeenCalledOnce();
  expect(record).toHaveBeenCalledTimes(2);
});

it('shows purchase records to read-only viewers without mutation controls', async () => {
  const { service, plan } = await fixture('purchased');
  render(<Request service={service} initial={plan} canAct={false} />);
  expect(await screen.findByRole('region', { name: 'Recorded purchase' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /Record purchase|Withdraw request|Copy to new draft/ })).not.toBeInTheDocument();
});

it('marks buyer decisions seen and updates the shared navigation badge only after success', async () => {
  const { service } = await fixture('approved'), user = userEvent.setup();
  render(<BuyerDecisionsProvider service={service} enabled><AppShell path="/purchase-plans" scenarioDate={SCENARIO_DATE} onSignOut={vi.fn()}>
    <BuyerDecisions service={service} />
  </AppShell></BuyerDecisionsProvider>);
  expect(await screen.findByRole('link', { name: '1 unread decision' })).toBeVisible();
  const seen = vi.spyOn(service as Required<PurchasePlanService>, 'markNotificationSeen')!.mockRejectedValueOnce(new PlanError('Could not mark seen.', {}, 503));
  await user.click(screen.getByRole('button', { name: 'Mark as seen' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not mark seen.');
  expect(screen.getByRole('link', { name: '1 unread decision' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Mark as seen' }));
  await waitFor(() => expect(screen.queryByRole('link', { name: '1 unread decision' })).not.toBeInTheDocument());
  expect(seen).toHaveBeenCalledTimes(2);
});

it('ignores a late outcome response after changing plans', async () => {
  const { service, plan } = await fixture('approved');
  let finish!: (value: Awaited<ReturnType<NonNullable<PurchasePlanService['readSubmission']>>>) => void;
  vi.spyOn(service as Required<PurchasePlanService>, 'readSubmission').mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = render(<SubmittedRecommendationView plan={plan} planService={service} canAct />);
  view.unmount(); await act(async () => finish({ submission: null }));
  expect(screen.queryByText('Record purchase')).not.toBeInTheDocument();
});
