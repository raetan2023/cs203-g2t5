import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { PurchasePlanPage } from './PurchasePlanPage';
import { createMockPlanService } from './mockService';
import { DEMO_PLAN, DEMO_SCENARIO_DATE } from './fixtures';
import type { PlanStatus } from './types';

it('counts only drafts and submitted plans as active and filters finished records for read-only viewers', async () => {
  window.history.replaceState(null, '', '/purchase-plans');
  const statuses: PlanStatus[] = ['draft', 'submitted', 'approved', 'rejected', 'withdrawn', 'purchased'];
  const service = createMockPlanService({ delayMs: 0, initialPlans: statuses.map((status, i) => ({ ...DEMO_PLAN, plan_id: `p${i}`, status })) });
  const user = userEvent.setup();
  render(<PurchasePlanPage service={service} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} />);
  const summary = await screen.findByRole('region', { name: 'Plan summary' });
  expect(within(summary).getByText('Active plans').parentElement).toHaveTextContent('Active plans2');
  await user.click(screen.getByRole('button', { name: 'Finished' }));
  expect(screen.getByText('Purchased')).toBeVisible();
  expect(screen.getByText('Withdrawn')).toBeVisible();
  expect(screen.queryByText('Approved', { exact: true })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Open' }));
  expect(screen.getByText('Approved', { exact: true })).toBeVisible();
  expect(screen.queryByText('Purchased')).not.toBeInTheDocument();
});

it('gives admins the read-only Plans section of decided plans, filterable by PM and officer', async () => {
  window.history.replaceState(null, '', '/purchase-plans?edit_plan_id=admin-0');
  const at = (i: number, status: PlanStatus, days: number, officer: string, pm: string | null) => ({ ...DEMO_PLAN, plan_id: `admin-${i}`, quantity_mt: 101 + i, status,
    submitted_at: status === 'draft' ? null : '2025-10-20T01:00:00Z', purchase_deadline: new Date(Date.UTC(2025, 9, 24 + days)).toISOString().slice(0, 10),
    buyer_user_id: `u-${officer}`, buyer_label: officer, pm_user_id: pm && `u-${pm}`, pm_label: pm });
  const service = createMockPlanService({ delayMs: 0, initialPlans: [
    at(0, 'draft', 5, 'Rae', 'Wunna'), at(1, 'submitted', 5, 'Rae', 'Wunna'), at(2, 'submitted', -2, 'Yash', 'Anjali'),
    at(3, 'approved', 5, 'Yash', 'Anjali'), at(4, 'approved', -3, 'Rae', 'Wunna'), at(5, 'rejected', 5, 'Ana', null), at(6, 'withdrawn', 5, 'Rae', 'Wunna'),
  ] });
  const user = userEvent.setup();
  render(<PurchasePlanPage service={service} scenarioDate={DEMO_SCENARIO_DATE} isAdmin canEdit={false} />);
  await screen.findByRole('heading', { name: 'Organisation purchase plans' });
  const section = await screen.findByRole('region', { name: 'Plans' });
  await waitFor(() => expect(within(section).queryByRole('button', { name: /^To buy \(/ })).not.toBeNull());
  const count = (label: string) => within(section).getByRole('button', { name: new RegExp(`^${label} \\(`) }).textContent?.match(/\((\d+)\)/)?.[1];
  const shown = () => [...section.querySelectorAll('.pp-summary-qty .pp-sr-only')].map(el => el.textContent);
  // Drafts, pending and withdrawn requests are hidden, and admins get no overdue reminder note.
  expect(within(section).queryByRole('button', { name: /^Withdrawn \(/ })).not.toBeInTheDocument();
  expect(section.querySelector('.pp-inbox-note')).toBeNull();
  expect([count('To buy'), count('Overdue'), count('Purchased'), count('Rejected')]).toEqual(['1', '1', '0', '1']);
  expect(within(section).queryByRole('button', { name: /^Pending \(/ })).not.toBeInTheDocument();
  expect(shown().sort()).toEqual(['104 MT', '105 MT', '106 MT']);
  expect(section.querySelector('.pp-tag--to-buy svg circle')).not.toBeNull();
  // The PM sits on the "Submitted by" line.
  const metas = [...section.querySelectorAll('.pp-inbox-meta')].map(line => line.textContent);
  expect(metas.some(text => text?.startsWith('Submitted by Ana · PM No PM assigned'))).toBe(true);
  expect(metas.some(text => text?.startsWith('Submitted by Yash · PM Anjali'))).toBe(true);

  // One People dropdown: officers grouped under their PM, with "No PM assigned" last.
  await user.click(within(section).getByRole('button', { name: /Everyone/ }));
  const groups = [...section.querySelectorAll('.pp-people-pm')].map(label => label.textContent);
  expect(groups).toEqual(['Anjali · PM1', 'Wunna · PM1', 'No PM assigned1']);
  await user.click(within(section).getByRole('checkbox', { name: /Select all/ }));
  await user.click(within(section).getByRole('checkbox', { name: /Anjali/ }));
  expect(shown()).toEqual(['104 MT']);
  expect(within(section).getByRole('button', { name: /Anjali’s team/ })).toBeVisible();
  // Adding one officer from another team.
  await user.click(within(section).getByRole('checkbox', { name: /^Rae/ }));
  expect(shown().sort()).toEqual(['104 MT', '105 MT']);
  expect(within(section).getByRole('button', { name: /2 people/ })).toBeVisible();
  expect(within(section).getByRole('checkbox', { name: /Wunna/ })).toBeChecked();

  await user.click(within(section).getByRole('button', { name: 'Show all plans' }));
  await user.click(within(section).getByRole('button', { name: /^Overdue \(/ }));
  expect(shown()).toEqual(['105 MT']);
  for (const name of ['Create plan', /^Edit/, 'Delete', 'Approve', 'Reject', 'Record purchase']) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  }
});
