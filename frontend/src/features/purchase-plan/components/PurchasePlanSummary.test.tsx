import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByText('3 days overdue')).toBeTruthy();
    expect(screen.queryByText('-3 days')).toBeNull();
  });

  it('shows the number with plural "days" for a normal plan', () => {
    renderSummary({ days_remaining: 22 });
    expect(screen.getByText('22 days left')).toBeTruthy();
  });

  it('says "Due today" on the deadline and singular "day" one day late', () => {
    renderSummary({ days_remaining: 0 });
    expect(screen.getByText('Due today')).toBeVisible();
    expect(screen.queryByText(/0 days/)).toBeNull();
  });

  it('shows singular "day" for one day overdue', () => {
    renderSummary({ days_remaining: -1 });
    expect(screen.getByText('1 day overdue')).toBeVisible();
  });

  it('shows singular "day" when exactly one day remains', () => {
    renderSummary({ days_remaining: 1 });
    expect(screen.getByText('1 day left')).toBeTruthy();
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
  it.each(['rejected', 'withdrawn', 'purchased'] as const)('hides deadline badges for a %s plan', status => {
    renderSummary({ status, days_remaining: -3 });
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    expect(screen.queryByText('3 days overdue')).not.toBeInTheDocument();
    expect(screen.getByText(status.charAt(0).toUpperCase() + status.slice(1))).toBeVisible();
  });
  it.each(['submitted', 'approved', 'rejected'] as const)('keeps a %s plan locked and links to its saved recommendation', status => {
    const onEdit = vi.fn(), onDelete = vi.fn();
    render(<PurchasePlanSummary plan={{ ...DEMO_PLAN, status }} onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.getByText(status === 'submitted' ? 'Awaiting approval' : status.charAt(0).toUpperCase() + status.slice(1))).toBeVisible();
    expect(screen.queryByRole('button', { name: /More actions|Edit|Delete/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: status === 'submitted' ? /View submitted recommendation/ : status === 'approved' ? /Record purchase/ : /View decision/ })).toHaveAttribute('href', `/purchase-plans/recommendation?plan_id=${DEMO_PLAN.plan_id}`);
    expect(onEdit).not.toHaveBeenCalled(); expect(onDelete).not.toHaveBeenCalled();
  });

  it('marks drafts with a Draft pill', () => {
    render(<PurchasePlanSummary plan={{ ...DEMO_PLAN, status: 'draft' }} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Draft')).toBeVisible();
  });

  it('gives an overdue draft Edit only, named for its plan', () => {
    render(<PurchasePlanSummary plan={{ ...DEMO_PLAN, status: 'draft', days_remaining: -3 }} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Edit 500 MT plan' })).toBeVisible();
    expect(screen.getByRole('button', { name: /More actions/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: /View recommendation/ })).not.toBeInTheDocument();
  });

  it('keeps the recommendation link on an overdue draft for read-only viewers', () => {
    render(<PurchasePlanSummary plan={{ ...DEMO_PLAN, status: 'draft', days_remaining: -3 }} canEdit={false} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('link', { name: /View recommendation/ })).toBeVisible();
  });

  it.each([['submitted', 'Awaiting approval', /View submitted recommendation/], ['approved', 'Approved', /Record purchase/]] as const)('shows both pills on an overdue %s plan and keeps its link', (status, pill, link) => {
    render(<PurchasePlanSummary plan={{ ...DEMO_PLAN, status, days_remaining: -3 }} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Overdue')).toBeVisible();
    expect(screen.getByText(pill)).toBeVisible();
    expect(screen.getByText('3 days overdue')).toBeVisible();
    expect(screen.getByRole('link', { name: link })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it('hides the approved deadline from read-only viewers', () => {
    render(<PurchasePlanSummary plan={{ ...DEMO_PLAN, status: 'approved', days_remaining: -3 }} canEdit={false} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View decision/ })).toBeVisible();
  });

  it('offers a copy on a rejected card, and links to the copy once it exists', () => {
    const onCopy = vi.fn();
    const plan = { ...DEMO_PLAN, status: 'rejected' as const };
    const view = render(<PurchasePlanSummary plan={plan} onCopy={onCopy} onEdit={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Copy to new draft/ }));
    expect(onCopy).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'View decision' })).toHaveAttribute('href', `/purchase-plans/recommendation?plan_id=${plan.plan_id}`);
    view.rerender(<PurchasePlanSummary plan={plan} onCopy={onCopy} copiedPlanId="copy-1" onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Copy to new draft/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View copied plan/ })).toHaveAttribute('href', '/purchase-plans/recommendation?plan_id=copy-1');
  });

  it('never offers a copy to read-only viewers', () => {
    render(<PurchasePlanSummary plan={{ ...DEMO_PLAN, status: 'rejected' }} canEdit={false} onCopy={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Copy to new draft/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View decision/ })).toBeVisible();
  });

  it('tells the buyer why the plan was rejected in one line', async () => {
    const readSubmission = vi.fn().mockResolvedValue({ submission: null, decision: {
      decision_id: 'd1', decision: 'rejected', comment: 'Outside the approved budget', manager_clerk_user_id: 'user_m',
      manager_label: 'Procurement Manager', decided_at: '2026-10-28T01:30:00Z' } });
    const service = { readSubmission } as unknown as PurchasePlanService;
    render(<PurchasePlanSummary plan={{ ...DEMO_PLAN, status: 'rejected' }} service={service} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the manager’s note…');
    expect(await screen.findByText('Reason: Outside the approved budget')).toBeVisible();
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
    expect(screen.getByText('Locked while managers review it.')).toBeVisible();
    expect(service.readSubmission).not.toHaveBeenCalled();
  });
});
