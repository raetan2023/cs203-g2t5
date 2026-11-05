import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { createMockAuthService, DEMO_USER } from '../preview/mockAuthService';
import { createMockPlanService } from '../features/purchase-plan/mockService';

beforeEach(() => window.history.replaceState(null, '', '/admin'));
function setup(role: string, signedIn = true) {
  const manage = vi.fn();
  render(<App auth={createMockAuthService({ user: signedIn ? DEMO_USER : null, delayMs: 0 })}
    scenarioDate="2026-11-04" createPlanService={() => createMockPlanService({ delayMs: 0 })}
    planAccess={{ organisation_id: 'org_a', role, can_read_plans: true, can_write_plans: role === 'org:officer', plan_scope: role === 'org:officer' ? 'own' : 'organisation' }}
    onManageOrganisation={manage} />);
  return { manage };
}
it.each(['org:officer', 'org:manager'])('blocks direct admin URLs and navigation for %s', async role => {
  setup(role);
  expect(await screen.findByRole('heading', { name: 'Admin access required' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Organisation administration' })).not.toBeInTheDocument();
});
it('provides the admin console and delegates role controls to Clerk', async () => {
  const { manage } = setup('org:admin');
  expect(await screen.findByRole('heading', { name: 'Your organisation' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Manage organisation' }));
  expect(manage).toHaveBeenCalledOnce();
  expect(screen.getByRole('link', { name: 'Organisation administration' })).toHaveAttribute('href', '/admin');
});
it('redirects a signed-out admin URL to sign-in without making admin requests', async () => {
  setup('org:admin', false);
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible();
});

it.each(['org:admin', 'org:manager'])('hides buyer history and explains direct history links for %s', async role => {
  window.history.replaceState(null, '', '/purchase-plans/decisions');
  setup(role);
  expect(await screen.findByRole('heading', { name: 'Procurement officer decision history' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'View purchase plans' })).toHaveAttribute('href', '/purchase-plans');
  expect(screen.queryByRole('link', { name: 'Decision history' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Purchase plans' })).toBeVisible();
});
it('keeps decision history navigation available to buyers', async () => {
  setup('org:officer');
  await screen.findByRole('heading', { name: 'Admin access required' });
  expect(screen.getByRole('link', { name: 'Decision history' })).toHaveAttribute('href', '/purchase-plans/decisions');
});
