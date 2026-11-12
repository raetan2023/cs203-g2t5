import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ManagerDecisionForm } from './ManagerDecisionForm';
import { SubmittedRecommendationView } from './RecommendationApproval';
import { createMockPlanService } from '../purchase-plan/mockService';
import { DEMO_PLAN, DEMO_ANALYSIS } from '../purchase-plan/fixtures';
import { PlanError, type SavedPlanResponse } from '../purchase-plan/types';

const fingerprint = 'a'.repeat(64);
const plan = { ...DEMO_PLAN, status: 'submitted' as const, submitted_at: '2026-10-27T08:00:00Z' };
const record = { decision_id: 'decision-1', decision: 'rejected' as const, comment: 'Outside the approved budget',
  manager_label: 'Procurement Manager', manager_clerk_user_id: 'user_manager', decided_at: '2026-10-27T09:00:00Z' };
const snapshot = { horizon_days: 14 as const, analysis: { ...DEMO_ANALYSIS, approval_fingerprint: fingerprint } };
function service() { return { ...createMockPlanService({ delayMs: 0 }),
  decide: vi.fn().mockResolvedValue({ plan: { ...plan, status: 'approved' } }),
  readSubmission: vi.fn().mockResolvedValue({ submission: snapshot, decision: null }) }; }
function form(api = service()) {
  const onDecided = vi.fn(), onRefresh = vi.fn();
  const view = render(<ManagerDecisionForm planId={plan.plan_id} fingerprint={fingerprint} service={api} onDecided={onDecided} onRefresh={onRefresh} />);
  return { api, onDecided, onRefresh, ...view };
}

describe('manager decisions', () => {
  it('renders the saved recommendation, buyer and reference in a keyboard-accessible panel', async () => {
    const user = userEvent.setup();
    render(<ManagerDecisionForm planId={plan.plan_id} fingerprint={fingerprint} service={service()}
      onDecided={vi.fn()} onRefresh={vi.fn()} plan={plan} analysis={snapshot.analysis} buyerLabel="buyer@example.test" today={plan.scenario_as_of_date} />);
    const opener = screen.getByRole('button', { name: 'Approve recommendation' });
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'Approve plan' })).toBeVisible();
    expect(screen.getByText('buyer@example.test')).toBeVisible();
    expect(screen.getByText('USD 700.00/MT')).toBeVisible();
    await user.keyboard('{Escape}');
    // Native dialog cancellation is verified in the Chromium layout script.
    const dialog = screen.queryByRole('dialog');
    if (dialog) { await user.click(screen.getByRole('button', { name: 'Close review' })); }
    expect(opener).toHaveFocus();
  });
  it('confirms approval with the reviewed snapshot and optional comment', async () => {
    const user = userEvent.setup(); const { api, onDecided } = form();
    await user.click(screen.getByRole('button', { name: 'Approve recommendation' }));
    expect(api.decide).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Approval comment (optional)'), '  Within budget  ');
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
    expect(api.decide).toHaveBeenCalledWith(plan.plan_id, { decision: 'approved', comment: 'Within budget', approval_fingerprint: fingerprint });
    expect(await screen.findByRole('heading', { name: 'Plan approved', level: 3 })).toBeVisible();
    expect(onDecided).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Back to plan' }));
    expect(onDecided).toHaveBeenCalledOnce();
  });
  it('requires a nonblank rejection reason and supports cancelling before confirmation', async () => {
    const user = userEvent.setup(); const { api } = form();
    await user.click(screen.getByRole('button', { name: 'Reject recommendation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add a reason');
    await user.type(screen.getByLabelText('Rejection reason (required)'), '   ');
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    expect(api.decide).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Close review' }));
    expect(api.decide).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Reject recommendation' }));
    await user.type(screen.getByLabelText('Rejection reason (required)'), 'Outside budget');
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    expect(api.decide).toHaveBeenCalledWith(plan.plan_id, expect.objectContaining({ decision: 'rejected', comment: 'Outside budget' }));
  });
  it('blocks duplicate confirmations while saving and ignores a response after unmount', async () => {
    const user = userEvent.setup(); const api = service();
    let finish!: (result: SavedPlanResponse) => void;
    api.decide.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { onDecided, unmount } = form(api);
    await user.click(screen.getByRole('button', { name: 'Approve recommendation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
    expect(screen.getByRole('button', { name: 'Confirm approval' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Saving decision');
    expect(screen.getByRole('button', { name: 'Close review' })).toBeDisabled();
    unmount(); await act(async () => finish({ plan: { ...plan, status: 'approved' } }));
    expect(onDecided).not.toHaveBeenCalled(); expect(api.decide).toHaveBeenCalledOnce();
  });
  it('preserves the comment on failure and requires refresh after another manager decides', async () => {
    const user = userEvent.setup(); const api = service();
    api.decide.mockRejectedValue(new PlanError('Another manager has already decided this request.', {}, 409));
    const { onRefresh } = form(api);
    await user.click(screen.getByRole('button', { name: 'Reject recommendation' }));
    await user.type(screen.getByLabelText('Rejection reason (required)'), 'Budget constraint');
    await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Another manager has already decided');
    expect(screen.getByLabelText('Rejection reason (required)')).toHaveValue('Budget constraint');
    expect(screen.queryByRole('button', { name: 'Confirm rejection' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reload request' }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});

it('shows the manager controls only to a manager and refreshes the final audit after a decision', async () => {
  const user = userEvent.setup(), api = service();
  api.decide.mockImplementation(async () => {
    api.readSubmission.mockResolvedValue({ submission: snapshot, decision: record });
    return { plan: { ...plan, status: 'rejected' } };
  });
  const view = render(<SubmittedRecommendationView plan={plan} planService={api} />);
  await screen.findByRole('heading', { name: /Plan recommendation/ });
  expect(screen.queryByRole('button', { name: 'Reject recommendation' })).not.toBeInTheDocument();
  view.rerender(<SubmittedRecommendationView canDecide plan={plan} planService={api} />);
  await user.click(screen.getByRole('button', { name: 'Reject recommendation' }));
  await user.type(screen.getByLabelText('Rejection reason (required)'), 'Outside the approved budget');
  await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
  expect(await screen.findByRole('heading', { name: 'Plan rejected', level: 3 })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Back to plan' }));
  expect(await screen.findByRole('heading', { name: 'Recommendation rejected' })).toBeVisible();
  expect(screen.getByText('Outside the approved budget')).toBeVisible();
  expect(screen.getByText(/Decided by Procurement Manager/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Approve recommendation' })).not.toBeInTheDocument();
  await waitFor(() => expect(api.readSubmission).toHaveBeenCalledTimes(2));
});

it('shows the final decision and reason to the buyer without giving them decision actions', async () => {
  const api = service(); api.readSubmission.mockResolvedValue({ submission: snapshot, decision: record });
  render(<SubmittedRecommendationView plan={{ ...plan, status: 'rejected' }} planService={api} />);
  expect(await screen.findByRole('heading', { name: 'Recommendation rejected' })).toBeVisible();
  expect(screen.getByText('Outside the approved budget')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Approve recommendation' })).not.toBeInTheDocument();
  expect(api.decide).not.toHaveBeenCalled();
});

it('only offers rejection once the deadline has passed', async () => {
  const user = userEvent.setup();
  const api = service();
  const late = { ...plan, purchase_deadline: '2026-10-20' };
  render(<ManagerDecisionForm planId={plan.plan_id} fingerprint={fingerprint} service={api}
    onDecided={vi.fn()} onRefresh={vi.fn()} plan={late} analysis={snapshot.analysis} today="2026-10-23" />);
  expect(screen.getByText('The purchase deadline has passed, so this request can only be rejected.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Approve recommendation' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Reject recommendation' }));
  expect(screen.getByText('It was 3 days ago, so this request can only be rejected.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Confirm approval' })).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Rejection reason (required)'), 'Too late to buy');
  await user.click(screen.getByRole('button', { name: 'Confirm rejection' }));
  await waitFor(() => expect(api.decide).toHaveBeenCalledWith(plan.plan_id, expect.objectContaining({ decision: 'rejected' })));
});

it('still offers approval on the deadline day', () => {
  const due = { ...plan, purchase_deadline: '2026-10-23' };
  render(<ManagerDecisionForm planId={plan.plan_id} fingerprint={fingerprint} service={service()}
    onDecided={vi.fn()} onRefresh={vi.fn()} plan={due} analysis={snapshot.analysis} today="2026-10-23" />);
  expect(screen.getByRole('button', { name: 'Approve recommendation' })).toBeVisible();
});
