import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PurchasePlanSummary } from './PurchasePlanSummary';
import { DEMO_PLAN } from '../fixtures';
import type { PurchasePlan } from '../types';

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
