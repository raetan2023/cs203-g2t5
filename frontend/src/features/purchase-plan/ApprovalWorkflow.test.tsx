import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PurchasePlanPage } from './PurchasePlanPage';
import { ApprovalInbox } from './components/ApprovalInbox';
import { DEMO_PLAN, DEMO_SCENARIO_DATE } from './fixtures';
import { createMockPlanService } from './mockService';
import { PlanError } from './types';

const draft = { ...DEMO_PLAN, status: 'draft' as const, submitted_at: null };
const submitted = { ...draft, status: 'submitted' as const, submitted_at: '2026-10-27T08:00:00Z' };
function service() {
  return { ...createMockPlanService({ initialPlans: [draft], delayMs: 0 }),
    submit: vi.fn().mockResolvedValue({ plan: submitted }), notifications: vi.fn().mockResolvedValue({ notifications: [] }) };
}

it('routes buyers to recommendation review without allowing direct plan-only submission', async () => {
  const api = service();
  render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} />);
  expect(await screen.findByRole('link', { name: /View recommendation/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Submit for approval' })).not.toBeInTheDocument();
  expect(api.submit).not.toHaveBeenCalled();
});

describe('manager approval inbox', () => {
  const notification = { notification_id: 'n1', plan_id: 'p1', created_at: '2026-10-27T08:00:00Z', quantity_mt: 987, purchase_deadline: '2026-11-01', status: 'submitted' };
  it('shows submissions and lets a manager refresh the inbox', async () => {
    const api = service(); const user = userEvent.setup();
    api.notifications.mockResolvedValue({ notifications: [notification] });
    render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
    expect(await screen.findByText('987 MT')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View submitted recommendation' })).toHaveAttribute('href', '/purchase-plans/recommendation?plan_id=p1');
    await user.click(screen.getByRole('button', { name: 'Refresh inbox' }));
    await waitFor(() => expect(api.notifications).toHaveBeenCalledTimes(2));
  });
  it('does not display stale notifications after switching organisation services', async () => {
    const old = service(); const next = service();
    let finish!: (result: unknown) => void;
    old.notifications.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<ApprovalInbox service={old} />);
    view.rerender(<ApprovalInbox service={next} />);
    await screen.findByText('No plans have been submitted yet.');
    await act(async () => { finish({ notifications: [notification] }); });
    expect(screen.queryByText('987 MT')).not.toBeInTheDocument();
  });
  it('shows an access failure without leaking previously loaded notifications', async () => {
    const api = service(); const user = userEvent.setup();
    api.notifications.mockResolvedValueOnce({ notifications: [notification] }).mockRejectedValue(new PlanError('Manager access has changed.', {}, 403));
    render(<ApprovalInbox service={api} />);
    await screen.findByText('987 MT');
    await user.click(screen.getByRole('button', { name: 'Refresh inbox' }));
    expect(await screen.findByText('Manager access has changed.')).toBeVisible();
    expect(screen.queryByText('987 MT')).not.toBeInTheDocument();
  });
});
