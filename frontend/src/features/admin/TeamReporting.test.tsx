import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamReporting } from './TeamReporting';
import type { ReportingOverview, TeamReportingService } from './teamReportingApi';

const managers = [
  { user_id: 'pm1', label: 'pm1@example.com', officer_count: 1 },
  { user_id: 'pm2', label: 'pm2@example.com', officer_count: 0 },
];
const start: ReportingOverview = { managers, officers: [
  { user_id: 'po1', label: 'po1@example.com', pm_user_id: 'pm1' },
  { user_id: 'po2', label: 'po2@example.com', pm_user_id: null },
] };
const service = (overrides: Partial<TeamReportingService> = {}): TeamReportingService => ({
  load: vi.fn(async () => start), assign: vi.fn(async () => start),
  syncMembers: vi.fn(async () => ({ saved: 3, removed: 1 })), ...overrides,
});

it('warns about officers without a PM and only offers a blank choice to them', async () => {
  render(<TeamReporting service={service()} />);
  const unassigned = await screen.findByLabelText('po2@example.com');
  expect(screen.getAllByText('No PM assigned')).toHaveLength(1);
  expect(within(unassigned).getByRole('option', { name: 'Choose a manager' })).toBeInTheDocument();
  const assigned = screen.getByLabelText('po1@example.com');
  expect(assigned).toHaveValue('pm1');
  expect(within(assigned).queryByRole('option', { name: 'Choose a manager' })).not.toBeInTheDocument();
  expect(within(assigned).getAllByRole('option')).toHaveLength(2);
});

it('says when PM assignments are required and clears once everyone has one', async () => {
  const updated: ReportingOverview = { managers, officers: [start.officers[0], { ...start.officers[1], pm_user_id: 'pm2' }] };
  render(<TeamReporting service={service({ assign: vi.fn(async () => updated) })} />);
  expect(await screen.findByText('PM assignments required: 1 officer has no manager.')).toBeVisible();
  await userEvent.selectOptions(screen.getByLabelText('po2@example.com'), 'pm2');
  expect(screen.getByText('PM assignments required: 1 officer has no manager.')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('All officers have a manager.')).toBeVisible();
  expect(screen.queryByText(/PM assignments required/)).not.toBeInTheDocument();
});

it('labels how many POs each manager has', async () => {
  const counted: ReportingOverview = {
    managers: [...managers, { user_id: 'pm3', label: 'pm3@example.com', officer_count: 1 }],
    officers: [start.officers[0], { ...start.officers[1], pm_user_id: 'pm1' }, { user_id: 'po3', label: 'po3@example.com', pm_user_id: 'pm3' }],
  };
  render(<TeamReporting service={service({ load: vi.fn(async () => counted) })} />);
  const select = await screen.findByLabelText('po1@example.com');
  expect(within(select).getByRole('option', { name: 'pm1@example.com (2 POs)' })).toBeInTheDocument();
  expect(within(select).getByRole('option', { name: 'pm2@example.com (0 PO)' })).toBeInTheDocument();
  expect(within(select).getByRole('option', { name: 'pm3@example.com (1 PO)' })).toBeInTheDocument();
});

it('previews PO counts for unsaved picks and restores them on cancel', async () => {
  render(<TeamReporting service={service()} />);
  const unassigned = await screen.findByLabelText('po2@example.com');
  const option = (name: string) => within(unassigned).getByRole('option', { name });
  expect(option('pm1@example.com (1 PO)')).toBeInTheDocument();
  expect(option('pm2@example.com (0 PO)')).toBeInTheDocument();
  await userEvent.selectOptions(unassigned, 'pm1');
  expect(option('pm1@example.com (2 POs)')).toBeInTheDocument();
  await userEvent.selectOptions(unassigned, 'pm2');
  expect(option('pm1@example.com (1 PO)')).toBeInTheDocument();
  expect(option('pm2@example.com (1 PO)')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(option('pm1@example.com (1 PO)')).toBeInTheDocument();
  expect(option('pm2@example.com (0 PO)')).toBeInTheDocument();
});

it('saves a chosen manager and shows the new assignment', async () => {
  const updated: ReportingOverview = { managers, officers: [start.officers[0], { ...start.officers[1], pm_user_id: 'pm2' }] };
  const api = service({ assign: vi.fn(async () => updated) });
  render(<TeamReporting service={api} />);
  await userEvent.selectOptions(await screen.findByLabelText('po2@example.com'), 'pm2');
  expect(api.assign).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(api.assign).toHaveBeenCalledWith('po2', 'pm2');
  expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
  expect(screen.queryByText('No PM assigned')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
});

describe('message timing', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('clears a success message by itself', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TeamReporting service={service()} />);
    await user.selectOptions(await screen.findByLabelText('po2@example.com'), 'pm2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Saved.');
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
  });

  it('keeps an error on screen', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TeamReporting service={service({ assign: vi.fn(async () => { throw new Error('Could not save.'); }) })} />);
    await user.selectOptions(await screen.findByLabelText('po2@example.com'), 'pm2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('alert');
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save.');
  });
});

it('cancel puts every dropdown back without saving', async () => {
  const api = service();
  render(<TeamReporting service={api} />);
  const select = await screen.findByLabelText('po1@example.com');
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await userEvent.selectOptions(select, 'pm2');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(select).toHaveValue('pm1');
  expect(api.assign).not.toHaveBeenCalled();
});

it('has nothing to save after picking the current manager again', async () => {
  render(<TeamReporting service={service()} />);
  const select = await screen.findByLabelText('po1@example.com');
  await userEvent.selectOptions(select, 'pm2');
  await userEvent.selectOptions(select, 'pm1');
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
});

it('keeps the unsaved pick and shows the reason when saving fails', async () => {
  const api = service({ assign: vi.fn(async () => { throw new Error('This person is not a Procurement Manager in your organisation.'); }) });
  render(<TeamReporting service={api} />);
  const select = await screen.findByLabelText('po1@example.com');
  await userEvent.selectOptions(select, 'pm2');
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('not a Procurement Manager');
  expect(select).toHaveValue('pm2');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(select).toHaveValue('pm1');
});

it('saves several picks and keeps only the one that failed', async () => {
  const first: ReportingOverview = { managers, officers: [{ ...start.officers[0], pm_user_id: 'pm2' }, start.officers[1]] };
  const assign = vi.fn<TeamReportingService['assign']>().mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('Could not save.'));
  render(<TeamReporting service={service({ assign })} />);
  await userEvent.selectOptions(await screen.findByLabelText('po1@example.com'), 'pm2');
  await userEvent.selectOptions(screen.getByLabelText('po2@example.com'), 'pm1');
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save.');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByLabelText('po1@example.com')).toHaveValue('pm2');
  expect(screen.getByLabelText('po2@example.com')).toHaveValue('');
});

it('refresh copies members from Clerk and reloads the list', async () => {
  const api = service();
  render(<TeamReporting service={api} />);
  await screen.findByLabelText('po1@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Refresh team list' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Team list updated.');
  expect(api.syncMembers).toHaveBeenCalledTimes(1);
  expect(api.load).toHaveBeenCalledTimes(2);
});

it('shows the reason when a refresh fails and allows another try', async () => {
  const api = service({ syncMembers: vi.fn(async () => { throw new Error('Member sync is not configured.'); }) });
  render(<TeamReporting service={api} />);
  await screen.findByLabelText('po1@example.com');
  const refresh = screen.getByRole('button', { name: 'Refresh team list' });
  await userEvent.click(refresh);
  expect(await screen.findByRole('alert')).toHaveTextContent('not configured');
  await waitFor(() => expect(refresh).toBeEnabled());
  expect(refresh).not.toHaveClass('is-refreshing');
});

it('offers a retry when the team cannot load', async () => {
  const load = vi.fn<TeamReportingService['load']>().mockRejectedValueOnce(new Error('Could not load.')).mockResolvedValue(start);
  render(<TeamReporting service={service({ load })} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load.');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByLabelText('po1@example.com')).toBeVisible());
});

describe('automatic update', () => {
  const tick = () => act(async () => { vi.advanceTimersByTime(5000); });
  const later: ReportingOverview = { managers, officers: [start.officers[0]] };
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('shows a role change without any click', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const load = vi.fn<TeamReportingService['load']>().mockResolvedValueOnce(start).mockResolvedValue(later);
    render(<TeamReporting service={service({ load })} />);
    await screen.findByLabelText('po2@example.com');
    await tick();
    await waitFor(() => expect(screen.queryByLabelText('po2@example.com')).not.toBeInTheDocument());
    expect(screen.getByText('All officers have a manager.')).toBeVisible();
  });

  it('keeps an unsaved pick when the list updates', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = service();
    render(<TeamReporting service={api} />);
    const select = await screen.findByLabelText('po1@example.com');
    await userEvent.selectOptions(select, 'pm2');
    await tick();
    await waitFor(() => expect(api.load).toHaveBeenCalledTimes(2));
    expect(select).toHaveValue('pm2');
  });

  it('does not check while the tab is hidden', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const api = service();
    render(<TeamReporting service={api} />);
    await screen.findByLabelText('po2@example.com');
    await tick();
    expect(api.load).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when a background check fails', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const load = vi.fn<TeamReportingService['load']>().mockResolvedValueOnce(start).mockRejectedValue(new Error('Could not load.'));
    render(<TeamReporting service={service({ load })} />);
    await screen.findByLabelText('po2@example.com');
    await tick();
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('po2@example.com')).toBeVisible();
  });

  it('does not let an older check undo a save', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const saved: ReportingOverview = { managers, officers: [start.officers[0], { ...start.officers[1], pm_user_id: 'pm2' }] };
    let finishCheck: (value: ReportingOverview) => void = () => {};
    const load = vi.fn<TeamReportingService['load']>().mockResolvedValueOnce(start)
      .mockImplementationOnce(() => new Promise(resolve => { finishCheck = resolve; }));
    render(<TeamReporting service={service({ load, assign: vi.fn(async () => saved) })} />);
    const select = await screen.findByLabelText('po2@example.com');
    await tick();
    await userEvent.selectOptions(select, 'pm2');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Saved.');
    await act(async () => { finishCheck(start); });
    expect(screen.getByLabelText('po2@example.com')).toHaveValue('pm2');
  });
});

it('explains empty teams', async () => {
  render(<TeamReporting service={service({ load: vi.fn(async () => ({ officers: [], managers: [] })) })} />);
  expect(await screen.findByText(/No Procurement Officers yet/)).toBeVisible();
});

it('shows names, keeps the email under each officer, and adds the email only to managers who share a name', async () => {
  const named: ReportingOverview = {
    officers: [{ user_id: 'po1', label: 'Rae Tan', email: 'rae@example.com', pm_user_id: null }],
    managers: [
      { user_id: 'pm1', label: 'Alex Lim', email: 'alex1@example.com', officer_count: 0 },
      { user_id: 'pm2', label: 'Alex Lim', email: 'alex2@example.com', officer_count: 0 },
      { user_id: 'pm3', label: 'Yashwanth Annem', email: 'yash@example.com', officer_count: 0 },
    ],
  };
  render(<TeamReporting service={service({ load: vi.fn(async () => named) })} />);
  const select = await screen.findByRole('combobox');
  expect(screen.getByText('Rae Tan')).toBeVisible();
  expect(screen.getByText('rae@example.com')).toBeVisible();
  expect(within(select).getByRole('option', { name: 'Alex Lim (alex1@example.com) (0 PO)' })).toBeInTheDocument();
  expect(within(select).getByRole('option', { name: 'Alex Lim (alex2@example.com) (0 PO)' })).toBeInTheDocument();
  expect(within(select).getByRole('option', { name: 'Yashwanth Annem (0 PO)' })).toBeInTheDocument();
});
