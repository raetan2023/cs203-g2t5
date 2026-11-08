import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
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

it('saves a chosen manager and shows the new assignment', async () => {
  const updated: ReportingOverview = { managers, officers: [start.officers[0], { ...start.officers[1], pm_user_id: 'pm2' }] };
  const api = service({ assign: vi.fn(async () => updated) });
  render(<TeamReporting service={api} />);
  await userEvent.selectOptions(await screen.findByLabelText('po2@example.com'), 'pm2');
  expect(api.assign).toHaveBeenCalledWith('po2', 'pm2');
  expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
  expect(screen.queryByText('No PM assigned')).not.toBeInTheDocument();
});

it('keeps the current manager and shows the reason when saving fails', async () => {
  const api = service({ assign: vi.fn(async () => { throw new Error('This person is not a Procurement Manager in your organisation.'); }) });
  render(<TeamReporting service={api} />);
  await userEvent.selectOptions(await screen.findByLabelText('po1@example.com'), 'pm2');
  expect(await screen.findByRole('alert')).toHaveTextContent('not a Procurement Manager');
  expect(screen.getByLabelText('po1@example.com')).toHaveValue('pm1');
});

it('syncs members from Clerk and reloads the list', async () => {
  const api = service();
  render(<TeamReporting service={api} />);
  await screen.findByLabelText('po1@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Sync members from Clerk' }));
  expect(await screen.findByRole('status')).toHaveTextContent('3 current, 1 removed');
  expect(api.load).toHaveBeenCalledTimes(2);
});

it('offers a retry when the team cannot load', async () => {
  const load = vi.fn<TeamReportingService['load']>().mockRejectedValueOnce(new Error('Could not load.')).mockResolvedValue(start);
  render(<TeamReporting service={service({ load })} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load.');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByLabelText('po1@example.com')).toBeVisible());
});

it('explains empty teams', async () => {
  render(<TeamReporting service={service({ load: vi.fn(async () => ({ officers: [], managers: [] })) })} />);
  expect(await screen.findByText(/No Procurement Officers yet/)).toBeVisible();
});
