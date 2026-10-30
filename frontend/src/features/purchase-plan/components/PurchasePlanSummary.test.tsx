import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PurchasePlanSummary } from './PurchasePlanSummary';
import { DEMO_PLAN } from '../fixtures';
import type { PurchasePlan, PurchasePlanService } from '../types';

function renderSummary(overrides: Partial<PurchasePlan> = {}) {
  const plan: PurchasePlan = { ...DEMO_PLAN, ...overrides };
  render(
    <PurchasePlanSummary
      plan={plan}
      onEdit={() => {}}
      onDelete={() => {}}
      editRef={createRef<HTMLButtonElement>()}
      deleteRef={createRef<HTMLButtonElement>()}
    />,
  );
}

describe('PurchasePlanSummary time remaining', () => {
   it('shows how many days overdue when the deadline has passed', () => {
    renderSummary({ days_remaining: -3 });
    expect(screen.getByText('Overdue by 3 days')).toBeTruthy();
    expect(screen.queryByText('-3 days')).toBeNull();
  });

  it('shows the number with plural "days" for a normal plan', () => {
    renderSummary({ days_remaining: 22 });
    expect(screen.getByText('22 days')).toBeTruthy();
  });

  it('shows singular "day" when exactly one day remains', () => {
    renderSummary({ days_remaining: 1 });
    expect(screen.getByText('1 day')).toBeTruthy();
  });
});
describe('PurchasePlanSummary status and actions', () => {
  it.each([
    [5, 'Due soon'], [7, 'Due soon'], [8, 'On track'], [-2, 'Overdue'],
  ])('labels a plan with %i days remaining as "%s"', (days, label) => {
    renderSummary({ days_remaining: days });
    expect(screen.getByText(label)).toBeVisible();
  });

  it('keeps Delete in a menu that Escape closes, returning focus to its trigger', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<PurchasePlanSummary plan={DEMO_PLAN} onEdit={() => {}} onDelete={onDelete} />);
    const trigger = screen.getByRole('button', { name: 'More actions for 500 MT plan' });
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  it('shows no menu or Edit for read-only organisation plans', () => {
    render(<PurchasePlanSummary plan={DEMO_PLAN} canEdit={false} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.queryByRole('button', { name: /More actions|Edit/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View recommendation/ })).toBeInTheDocument();
  });
});


describe('approval workflow in the redesigned cards', () => {
  it.each(['approved', 'rejected', 'withdrawn', 'purchased'] as const)('hides deadline badges for a %s plan', status => {
    renderSummary({ status, days_remaining: -3 });
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    expect(screen.queryByText('Overdue by 3 days')).not.toBeInTheDocument();
    expect(screen.getByText(status.charAt(0).toUpperCase() + status.slice(1))).toBeVisible();
  });
  it.each(['submitted', 'approved', 'rejected'] as const)('keeps a %s plan locked and links to its saved recommendation', status => {
    const onEdit = vi.fn(), onDelete = vi.fn();
    render(<PurchasePlanSummary plan={{ ...DEMO_PLAN, status }} onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.getByText(status === 'submitted' ? 'Submitted for approval' : status.charAt(0).toUpperCase() + status.slice(1))).toBeVisible();
    expect(screen.queryByRole('button', { name: /More actions|Edit|Delete/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: status === 'submitted' ? /View submitted recommendation/ : /View decision/ })).toHaveAttribute('href', `/purchase-plans/recommendation?plan_id=${DEMO_PLAN.plan_id}`);
    expect(onEdit).not.toHaveBeenCalled(); expect(onDelete).not.toHaveBeenCalled();
  });

  it('hides the pill for drafts', () => {
    render(<PurchasePlanSummary plan={{ ...DEMO_PLAN, status: 'draft' }} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByText('Draft')).not.toBeInTheDocument();
  });

  it('tells the buyer who rejected the plan, when, and why', async () => {
    const readSubmission = vi.fn().mockResolvedValue({ submission: null, decision: {
      decision_id: 'd1', decision: 'rejected', comment: 'Outside the approved budget', manager_clerk_user_id: 'user_m',
      manager_label: 'Procurement Manager', decided_at: '2026-10-28T01:30:00Z' } });
    const service = { readSubmission } as unknown as PurchasePlanService;
    render(<PurchasePlanSummary plan={{ ...DEMO_PLAN, status: 'rejected' }} service={service} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the manager’s note…');
    expect(await screen.findByText('Procurement Manager')).toBeVisible();
    expect(screen.getByText(/rejected this plan/)).toBeVisible();
    expect(screen.getByText('Reason: “Outside the approved budget”')).toBeVisible();
    expect(screen.getByText(/copy it to a new draft/)).toBeVisible();
    expect(readSubmission).toHaveBeenCalledWith(DEMO_PLAN.plan_id);
  });

  it('keeps the outcome visible when the manager note cannot be loaded', async () => {
    const service = { readSubmission: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as PurchasePlanService;
    render(<PurchasePlanSummary plan={{ ...DEMO_PLAN, status: 'approved' }} service={service} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(await screen.findByText(/Couldn’t load the manager’s note/)).toBeVisible();
    expect(screen.getByText('Approved')).toBeVisible();
  });

  it('does not ask for a decision while the plan is still awaiting review', () => {
    const service = { readSubmission: vi.fn() } as unknown as PurchasePlanService;
    render(<PurchasePlanSummary plan={{ ...DEMO_PLAN, status: 'submitted' }} service={service} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Awaiting manager approval.')).toBeVisible();
    expect(service.readSubmission).not.toHaveBeenCalled();
  });
});
