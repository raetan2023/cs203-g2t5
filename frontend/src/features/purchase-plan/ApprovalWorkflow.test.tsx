import { act, render, screen, waitFor, within } from '@testing-library/react';
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
  it('shows team exposure only to managers', async () => {
    const api = { ...service(), managerOverview: vi.fn().mockResolvedValue({
      total_quantity_mt: 10, purchased_quantity_mt: 0, open_quantity_mt: 10,
      reference_price_usd_per_mt: 600, reference_date: '2026-11-02', exposure_usd: 6000 }) };
    const view = render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
    expect(await screen.findByText('$6,000.00')).toBeVisible();
    view.unmount();
    api.managerOverview.mockClear();
    render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} />);
    await screen.findByRole('link', { name: /View recommendation/ });
    expect(screen.queryByRole('region', { name: 'Team oversight' })).not.toBeInTheDocument();
    expect(api.managerOverview).not.toHaveBeenCalled();
  });
  const notification = { notification_id: 'n1', plan_id: 'p1', created_at: '2026-10-27T08:00:00Z', quantity_mt: 987, purchase_deadline: '2099-11-01', status: 'submitted', buyer_label: 'Rae Tan', buyer_user_id: 'u-rae' };
  it('shows submissions and lets a manager refresh the inbox', async () => {
    const api = service(); const user = userEvent.setup();
    api.notifications.mockResolvedValue({ notifications: [notification] });
    render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
    expect(await screen.findByText('987 MT')).toBeVisible();
    expect(screen.getByText('Rae Tan')).toBeVisible();
    expect(screen.getByText(/Submitted by/)).toBeVisible();
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
    await screen.findByText('No requests are waiting for you.');
    await act(async () => { finish({ notifications: [notification] }); });
    expect(screen.queryByText('987 MT')).not.toBeInTheDocument();
  });
  it('keeps same-team rows visible during refresh without returning to the loading placeholder', async () => {
    const api = service();
    api.notifications.mockResolvedValue({ notifications: [notification] });
    render(<ApprovalInbox service={api} />);
    await screen.findByText('987 MT');
    let finish!: (result: unknown) => void;
    api.notifications.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await userEvent.click(screen.getByRole('button', { name: 'Refresh inbox' }));
    expect(screen.getByText('987 MT')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Approval inbox' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Updating approval inbox…')).toBeInTheDocument();
    expect(screen.queryByText('Loading approval notifications…')).not.toBeInTheDocument();
    await act(async () => finish({ notifications: [] }));
    expect(await screen.findByText('No requests are waiting for you.')).toBeVisible();
    expect(screen.queryByText('987 MT')).not.toBeInTheDocument();
  });
  it('clears a loaded team immediately when switching to another team', async () => {
    const old = service(), next = service();
    old.notifications.mockResolvedValue({ notifications: [notification] });
    next.notifications.mockReturnValue(new Promise(() => {}));
    const view = render(<ApprovalInbox service={old} />);
    await screen.findByText('987 MT');
    view.rerender(<ApprovalInbox service={next} />);
    expect(screen.queryByText('987 MT')).not.toBeInTheDocument();
    expect(screen.getByText('Loading approval notifications…')).toBeInTheDocument();
  });
  it('does not overlap polling requests while the previous read is unfinished', async () => {
    vi.useFakeTimers();
    try {
      const api = service(); api.notifications.mockReturnValue(new Promise(() => {}));
      const view = render(<ApprovalInbox service={api} />);
      await act(async () => vi.advanceTimersByTime(90_000));
      expect(api.notifications).toHaveBeenCalledOnce();
      view.unmount();
    } finally { vi.useRealTimers(); }
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

it('shows the inbox refresh as an icon with the updated time', async () => {
  const api = { ...service(), notifications: vi.fn().mockResolvedValue({ notifications: [] }) };
  render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
  const inbox = await screen.findByRole('region', { name: 'Approval inbox' });
  await waitFor(() => expect(within(inbox).getByText(/Updated as of/)).toBeVisible());
  const refresh = within(inbox).getByRole('button', { name: 'Refresh inbox' });
  expect(refresh).toHaveClass('pp-icon-button');
  expect(refresh).not.toHaveTextContent('Refresh inbox');
});

it('lists each request on separate lines and marks withdrawn ones', async () => {
  const api = { ...service(), notifications: vi.fn().mockResolvedValue({ notifications: [
    { notification_id: 'n1', plan_id: 'p1', created_at: '2026-11-05T15:54:04Z', quantity_mt: 90, purchase_deadline: '2099-11-23', status: 'withdrawn', buyer_label: 'Yashwanth Annem', buyer_user_id: 'u-yashwanth' },
    { notification_id: 'n2', plan_id: 'p2', created_at: '2026-11-06T15:54:04Z', quantity_mt: 250, purchase_deadline: '2099-12-06', status: 'submitted', buyer_label: 'Rae Tan', buyer_user_id: 'u-rae' },
  ] }) };
  render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
  const inbox = await screen.findByRole('region', { name: 'Approval inbox' });
  // Newest first: the pending request (6 Nov) comes before the withdrawn one (5 Nov).
  const [pending, withdrawn] = await within(inbox).findAllByRole('listitem');
  expect(within(withdrawn).getByText('Yashwanth Annem').closest('p')).toHaveTextContent(/^Submitted by Yashwanth Annem05 Nov 2026, 23:54:04$/);
  expect(within(withdrawn).getByText('05 Nov 2026, 23:54:04')).toBeVisible();
  // The withdrawn tag sits on the card's top line, with its own symbol; pending cards have no tag.
  const tag = within(withdrawn).getByText('withdrawn');
  expect(tag).toHaveClass('pp-tag', 'pp-tag--withdrawn');
  expect(tag.closest('.pp-card-top')).not.toBeNull();
  expect(tag.querySelector('svg')).not.toBeNull();
  expect(pending.querySelector('.pp-tag')).toBeNull();
  expect(within(pending).queryByText('submitted')).not.toBeInTheDocument();
});

it('shows six requests per page and pages through the rest', async () => {
  const many = Array.from({ length: 28 }, (_, i) => ({ notification_id: `n${i + 1}`, plan_id: `p${i + 1}`,
    created_at: '2026-11-05T15:54:04Z', quantity_mt: i + 1, purchase_deadline: '2099-11-23', status: 'submitted', buyer_label: 'Rae Tan', buyer_user_id: 'u-rae' }));
  const api = { ...service(), notifications: vi.fn().mockResolvedValue({ notifications: many }) };
  render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
  const inbox = await screen.findByRole('region', { name: 'Approval inbox' });
  await waitFor(() => expect(within(inbox).getAllByRole('listitem')).toHaveLength(6));
  expect(within(inbox).getByText('1 MT')).toBeVisible();
  const pager = within(inbox).getByRole('navigation', { name: 'Approval inbox pages' });
  expect(within(pager).getAllByRole('button', { name: /^Page \d+$/ })).toHaveLength(5);
  expect(within(inbox).getByText('Showing 1–6 of 28')).toBeVisible();
  await userEvent.click(within(pager).getByRole('button', { name: 'Page 5' }));
  expect(within(inbox).getAllByRole('listitem')).toHaveLength(4);
  // Two hidden slots hold the place of the missing requests, so the section keeps its size.
  expect(inbox.querySelectorAll('.pp-approval-spacer')).toHaveLength(2);
  expect(within(inbox).getByText('25 MT')).toBeVisible();
  expect(within(inbox).getByText('Showing 25–28 of 28')).toBeVisible();
  expect(within(inbox).queryByText('1 MT')).not.toBeInTheDocument();
});

it('counts pending and withdrawn requests and filters by officer and type', async () => {
  const row = (n: number, who: string, status: 'submitted' | 'withdrawn') => ({ notification_id: `n${n}`, plan_id: `p${n}`,
    created_at: '2026-11-05T15:54:04Z', quantity_mt: n, purchase_deadline: '2099-11-23', status, buyer_label: who, buyer_user_id: `u-${who}` });
  const api = { ...service(), notifications: vi.fn().mockResolvedValue({ notifications: [
    row(1, 'Rae', 'submitted'), row(2, 'Rae', 'withdrawn'), row(3, 'Yash', 'submitted'), row(4, 'Yash', 'submitted'), row(5, 'Ana', 'withdrawn'),
  ] }) };
  const user = userEvent.setup();
  render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
  const inbox = await screen.findByRole('region', { name: 'Approval inbox' });
  // Counts sit inside the type buttons, e.g. "Pending (3)".
  const count = (label: string) => within(inbox).getByRole('button', { name: new RegExp(`^${label} \\(`) }).textContent?.match(/\((\d+)\)/)?.[1];
  await waitFor(() => expect(within(inbox).queryByRole('button', { name: /^Pending \(/ })).not.toBeNull());
  expect(inbox.querySelector('.pp-inbox-counts')).toBeNull();
  expect(count('All')).toBe('5');
  expect(count('Pending')).toBe('3');
  expect(count('Withdrawn')).toBe('2');
  expect(within(inbox).queryByRole('button', { name: 'Show all requests' })).not.toBeInTheDocument();
  const notes = [...inbox.querySelectorAll('.pp-inbox-note')].map(note => note.textContent);
  expect(notes).toEqual(['* Overdue submissions are rejected automatically 5 days after their deadline.', '* Withdrawn submissions disappear after 5 days.']);
  expect(inbox.querySelector('.pp-inbox-note-overdue')).toHaveTextContent('Overdue');
  expect(inbox.querySelector('.pp-inbox-note-withdrawn')).toHaveTextContent('Withdrawn');

  // Choose two officers: the counts and cards follow.
  await user.click(within(inbox).getByRole('button', { name: /All officers/ }));
  await user.click(within(inbox).getByRole('checkbox', { name: /Select all/ }));
  await user.click(within(inbox).getByRole('checkbox', { name: /Rae/ }));
  await user.click(within(inbox).getByRole('checkbox', { name: /Ana/ }));
  expect(count('Pending')).toBe('1');
  expect(count('Withdrawn')).toBe('2');
  expect(within(inbox).getAllByRole('listitem').filter(item => item.closest('.pp-approval-list'))).toHaveLength(3);

  // Then only withdrawn ones.
  await user.click(within(inbox).getByRole('button', { name: /^Withdrawn/ }));
  expect(within(inbox).getAllByRole('listitem').filter(item => item.closest('.pp-approval-list'))).toHaveLength(2);

  await user.click(within(inbox).getByRole('button', { name: 'Show all requests' }));
  expect(count('Pending')).toBe('3');
  expect(within(inbox).getAllByRole('listitem').filter(item => item.closest('.pp-approval-list'))).toHaveLength(5);
  expect(within(inbox).getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
});

it('sorts the inbox by deadline or MT and resets to newest first', async () => {
  const row = (n: number, mt: number, due: string, day: string) => ({ notification_id: `n${n}`, plan_id: `p${n}`,
    created_at: `2026-11-${day}T01:00:00Z`, quantity_mt: mt, purchase_deadline: due, status: 'submitted', buyer_label: 'Rae Tan', buyer_user_id: 'u-rae' });
  const api = { ...service(), notifications: vi.fn().mockResolvedValue({ notifications: [
    row(1, 50, '2099-12-20', '10'), row(2, 900, '2099-11-15', '08'), row(3, 5, '2099-12-01', '09'),
  ] }) };
  const user = userEvent.setup();
  render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
  const inbox = await screen.findByRole('region', { name: 'Approval inbox' });
  const order = () => [...inbox.querySelectorAll('.pp-inbox-card .pp-summary-qty .pp-sr-only')].map(el => el.textContent);
  await waitFor(() => expect(order()).toEqual(['50 MT', '5 MT', '900 MT']));
  const choose = async (label: string) => {
    await user.click(within(inbox).getByRole('button', { name: /^Sort:/ }));
    await user.click(within(inbox).getByRole('radio', { name: label }));
  };
  expect(within(inbox).getByRole('button', { name: /^Sort:/ })).toHaveTextContent('Date submitted: Newest');
  await choose('Quantity: High to low');
  expect(order()).toEqual(['900 MT', '50 MT', '5 MT']);
  expect(within(inbox).queryByRole('radiogroup')).not.toBeInTheDocument();
  await choose('Deadline: Earliest');
  expect(order()).toEqual(['900 MT', '5 MT', '50 MT']);
  await user.click(within(inbox).getByRole('button', { name: 'Show all requests' }));
  expect(order()).toEqual(['50 MT', '5 MT', '900 MT']);
  expect(within(inbox).getAllByRole('link', { name: 'View submitted recommendation' })[0]).toHaveClass('pp-button');
});

it('shows six plans per page in their own section and pages through the rest', async () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ ...DEMO_PLAN, plan_id: `00000000-0000-4000-8000-00000000000${i}`, quantity_mt: 10 * (i + 1),
    purchase_deadline: `2025-11-${String(10 + i).padStart(2, '0')}`, days_remaining: 10 + i, status: 'approved' as const, submitted_at: '2025-10-24T01:00:00Z' }));
  const api = { ...createMockPlanService({ initialPlans: many, delayMs: 0 }), notifications: vi.fn().mockResolvedValue({ notifications: [] }) };
  const user = userEvent.setup();
  render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
  const section = await screen.findByRole('region', { name: 'Plans' });
  await waitFor(() => expect(section.querySelectorAll('.pp-plan-grid > .pp-summary')).toHaveLength(6));
  expect(within(section).getByText('Showing 1–6 of 8')).toBeVisible();
  await user.click(within(section).getByRole('button', { name: 'Page 2' }));
  expect(section.querySelectorAll('.pp-plan-grid > .pp-summary')).toHaveLength(2);
  expect(section.querySelectorAll('.pp-plan-spacer')).toHaveLength(4);
  // Changing the filter returns to the first page.
  await user.click(within(section).getByRole('button', { name: /^To buy \(/ }));
  expect(within(section).getByText('Showing 1–6 of 8')).toBeVisible();
});

it('lists only approved, purchased and rejected plans for a manager', async () => {
  const at = (status: 'draft' | 'submitted' | 'approved' | 'purchased' | 'rejected' | 'withdrawn', i: number) => ({ ...DEMO_PLAN,
    plan_id: `00000000-0000-4000-8000-0000000001${i}0`, quantity_mt: 100 + i, status, ...(status === 'draft' ? {} : { submitted_at: '2025-10-24T01:00:00Z' }) });
  const plans = [at('draft', 1), at('submitted', 2), at('approved', 3), at('purchased', 4), at('rejected', 5), at('withdrawn', 6)];
  const api = { ...createMockPlanService({ initialPlans: plans, delayMs: 0 }), notifications: vi.fn().mockResolvedValue({ notifications: [] }) };
  render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
  const section = await screen.findByRole('region', { name: 'Plans' });
  await waitFor(() => expect(section.querySelectorAll('.pp-plan-grid > .pp-summary')).toHaveLength(3));
  const shown = [...section.querySelectorAll('.pp-summary-qty .pp-sr-only')].map(el => el.textContent);
  expect(shown.sort()).toEqual(['103 MT', '104 MT', '105 MT']);
  const count = (label: string) => within(section).getByRole('button', { name: new RegExp(`^${label} \\(`) }).textContent?.match(/\((\d+)\)/)?.[1];
  expect([count('To buy'), count('Overdue'), count('Purchased'), count('Rejected')]).toEqual(['1', '0', '1', '1']);
});

it('sorts out overdue plans, filters plans by officer and type, and resets', async () => {
  const at = (n: number, status: 'approved' | 'purchased' | 'rejected', days: number, who: string) => ({ ...DEMO_PLAN,
    plan_id: `00000000-0000-4000-8000-00000000020${n}`, quantity_mt: n, status, days_remaining: days, submitted_at: '2025-10-24T01:00:00Z',
    // Days from the demo date (24 Oct 2025); negative days are past the deadline.
    purchase_deadline: new Date(Date.UTC(2025, 9, 24 + days)).toISOString().slice(0, 10), buyer_user_id: `u-${who}`, buyer_label: who });
  const plans = [at(1, 'approved', 5, 'Rae'), at(2, 'approved', -3, 'Rae'), at(3, 'approved', -1, 'Yash'), at(4, 'purchased', -2, 'Yash'), at(5, 'rejected', 4, 'Rae')];
  const api = { ...createMockPlanService({ initialPlans: plans, delayMs: 0 }), notifications: vi.fn().mockResolvedValue({ notifications: [] }) };
  const user = userEvent.setup();
  render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
  const section = await screen.findByRole('region', { name: 'Plans' });
  await waitFor(() => expect(within(section).queryByRole('button', { name: /^To buy \(/ })).not.toBeNull());
  const count = (label: string) => within(section).getByRole('button', { name: new RegExp(`^${label} \\(`) }).textContent?.match(/\((\d+)\)/)?.[1];
  const shown = () => [...section.querySelectorAll('.pp-summary-qty .pp-sr-only')].map(el => el.textContent);
  expect([count('To buy'), count('Overdue'), count('Purchased'), count('Rejected')]).toEqual(['1', '2', '1', '1']);
  expect(within(section).getByText(/Updated as of/)).toBeVisible();
  expect(within(section).getByText('Deadline passed 3 days ago, not bought yet.')).toBeVisible();
  // A purchased plan is never overdue, even after its deadline.
  expect(section.querySelectorAll('.pp-tag--overdue')).toHaveLength(2);

  await user.click(within(section).getByRole('button', { name: /^Overdue \(/ }));
  expect(shown()).toEqual(['2 MT', '3 MT']);
  await user.click(within(section).getByRole('button', { name: /All officers/ }));
  await user.click(within(section).getByRole('checkbox', { name: /Select all/ }));
  await user.click(within(section).getByRole('checkbox', { name: /Yash/ }));
  expect(shown()).toEqual(['3 MT']);
  expect([count('To buy'), count('Overdue'), count('Purchased'), count('Rejected')]).toEqual(['0', '1', '1', '0']);

  await user.click(within(section).getByRole('button', { name: 'Show all plans' }));
  expect(shown()).toHaveLength(5);
  expect(within(section).getByRole('button', { name: /^All \(/ })).toHaveAttribute('aria-pressed', 'true');
});

it('marks requests past their deadline as overdue, counts them and filters them', async () => {
  const row = (n: number, due: string, status: 'submitted' | 'withdrawn' = 'submitted') => ({ notification_id: `n${n}`, plan_id: `p${n}`,
    created_at: '2026-11-05T15:54:04Z', quantity_mt: n, purchase_deadline: due, status, buyer_label: 'Rae Tan', buyer_user_id: 'u-rae' });
  const api = { ...service(), notifications: vi.fn().mockResolvedValue({ notifications: [row(1, '2099-01-01'), row(2, '2020-01-01'), row(3, '2020-01-01', 'withdrawn')] }) };
  const user = userEvent.setup();
  render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
  const inbox = await screen.findByRole('region', { name: 'Approval inbox' });
  await waitFor(() => expect(within(inbox).queryByRole('button', { name: /^Pending \(/ })).not.toBeNull());
  const count = (label: string) => within(inbox).getByRole('button', { name: new RegExp(`^${label} \\(`) }).textContent?.match(/\((\d+)\)/)?.[1];
  expect([count('Pending'), count('Overdue'), count('Withdrawn')]).toEqual(['1', '1', '1']);
  expect(inbox.querySelectorAll('.pp-tag--overdue')).toHaveLength(1);
  await user.click(within(inbox).getByRole('button', { name: /^Overdue/ }));
  expect([...inbox.querySelectorAll('.pp-inbox-card .pp-summary-qty .pp-sr-only')].map(el => el.textContent)).toEqual(['2 MT']);
});

it('shows closed plans with their own tag, figure and filter only when there are some', async () => {
  const at = (n: number, status: 'approved' | 'closed') => ({ ...DEMO_PLAN, plan_id: `00000000-0000-4000-8000-00000000030${n}`, quantity_mt: n,
    status, submitted_at: '2025-10-24T01:00:00Z', buyer_user_id: 'u-rae', buyer_label: 'Rae' });
  const api = { ...createMockPlanService({ initialPlans: [at(1, 'approved'), at(2, 'closed')], delayMs: 0 }), notifications: vi.fn().mockResolvedValue({ notifications: [] }) };
  const user = userEvent.setup();
  render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
  const section = await screen.findByRole('region', { name: 'Plans' });
  await waitFor(() => expect(section.querySelector('.pp-tag--closed')).not.toBeNull());
  expect(within(section).getByText('Closed: the officer changed role.')).toBeVisible();
  const count = (label: string) => within(section).getByRole('button', { name: new RegExp(`^${label} \\(`) }).textContent?.match(/\((\d+)\)/)?.[1];
  expect(count('Closed')).toBe('1');
  // Closed comes right after Rejected.
  const labels = [...within(section).getByRole('group', { name: 'Plan type' }).querySelectorAll('button')].map(button => button.textContent);
  expect(labels.slice(-2)).toEqual(['Rejected (0)', 'Closed (1)']);
  await user.click(within(section).getByRole('button', { name: /^Closed \(/ }));
  expect([...section.querySelectorAll('.pp-summary-qty .pp-sr-only')].map(el => el.textContent)).toEqual(['2 MT']);
});

it('shows no Closed figure or filter when nothing is closed', async () => {
  const api = { ...createMockPlanService({ initialPlans: [{ ...DEMO_PLAN, status: 'approved' as const, submitted_at: '2025-10-24T01:00:00Z' }], delayMs: 0 }),
    notifications: vi.fn().mockResolvedValue({ notifications: [] }) };
  render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
  const section = await screen.findByRole('region', { name: 'Plans' });
  await waitFor(() => expect(within(section).queryByRole('button', { name: /^To buy \(/ })).not.toBeNull());
  expect(within(section).queryByRole('button', { name: /^Closed \(/ })).not.toBeInTheDocument();
  expect(section.querySelector('.pp-plan-counts')).toBeNull();
});

it('offers every officer on the team in the filters, even with no requests or plans', async () => {
  const api = { ...service(), notifications: vi.fn().mockResolvedValue({ notifications: [] }),
    team: vi.fn().mockResolvedValue({ officers: [{ user_id: 'u-rae', label: 'Rae Tan' }, { user_id: 'u-yash', label: 'Yashwanth Annem' }] }) };
  const user = userEvent.setup();
  render(<PurchasePlanPage service={api} scenarioDate={DEMO_SCENARIO_DATE} canEdit={false} isManager />);
  const inbox = await screen.findByRole('region', { name: 'Approval inbox' });
  await waitFor(() => expect(api.team).toHaveBeenCalled());
  await user.click(await within(inbox).findByRole('button', { name: /All officers/ }));
  expect(within(inbox).getByRole('checkbox', { name: /Rae Tan/ })).toBeVisible();
  expect(within(inbox).getByRole('checkbox', { name: /Yashwanth Annem/ }).closest('label')).toHaveTextContent('Yashwanth Annem0');
});
