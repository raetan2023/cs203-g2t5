import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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