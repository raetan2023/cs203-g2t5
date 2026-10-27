import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ANALYSIS_DEMO_PLAN } from '../features/purchase-plan/fixtures';
import { ClerkApp } from './ClerkApp';

const clerk = vi.hoisted(() => {
  const user = { id: 'user_a', fullName: 'Rae', firstName: 'Rae', primaryEmailAddress: { emailAddress: 'rae@example.test' } };
  return { auth: { isLoaded: true, isSignedIn: true, userId: 'user_a', orgId: 'org_a' as string | null, orgRole: 'org:buyer' as string | null, getToken: vi.fn(async () => 'session-a'), signOut: vi.fn() },
    user: { isLoaded: true, isSignedIn: true, user },
    organisation: { isLoaded: true, organization: { id: 'org_a', name: 'Bunker Buddy' } as { id: string; name: string } | null } };
});
vi.mock('@clerk/react', () => ({
  useAuth: () => clerk.auth, useUser: () => clerk.user, useOrganization: () => clerk.organisation,
  OrganizationList: (props: { hidePersonal?: boolean; skipInvitationScreen?: boolean }) => <div data-testid="organisation-list"
    data-hide-personal={String(props.hidePersonal)} data-skip-invitations={String(props.skipInvitationScreen)}>Your organisations</div>,
  OrganizationSwitcher: () => <button>Switch organisation</button>,
}));
beforeEach(() => {
  clerk.auth.isLoaded = true; clerk.auth.isSignedIn = true;
  clerk.auth.orgId = 'org_a'; clerk.auth.orgRole = 'org:buyer';
  clerk.user.isLoaded = true; clerk.user.isSignedIn = true;
  clerk.organisation.isLoaded = true;
  clerk.organisation.organization = { id: 'org_a', name: 'Bunker Buddy' };
  clerk.auth.getToken.mockReset().mockResolvedValue('session-a');
  clerk.auth.signOut.mockReset();
});
vi.mock('../features/auth/ClerkAuthPage', () => ({ ClerkAuthPage: () => <p>Clerk sign-in</p> }));
afterEach(() => vi.unstubAllGlobals());
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('Clerk API wiring', () => {
  it('mounts both real adapters and refreshes backend configuration after a scenario conflict', async () => {
    window.history.replaceState(null, '', `/purchase-plans/recommendation?plan_id=${ANALYSIS_DEMO_PLAN.plan_id}`);
    let scenario = '2025-10-24';
    const unavailable = { status: 'unavailable', reason: 'missing_forecast', message: 'No ML provider connected.' };
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/config')) return reply({ scenario_as_of_date: scenario });
      if (url.endsWith(`/purchase-plans/${ANALYSIS_DEMO_PLAN.plan_id}`)) return reply({ plan: { ...ANALYSIS_DEMO_PLAN, scenario_as_of_date: scenario, days_remaining: scenario === '2025-10-24' ? 22 : 21 } });
      if (scenario === '2025-10-24') return reply({ detail: 'The backend scenario changed.' }, 409);
      return reply({ provenance: 'unavailable', context: { ...ANALYSIS_DEMO_PLAN, scenario_as_of_date: scenario },
        reference: unavailable, forecast: unavailable, cost_impact: unavailable, recommendation: { ...unavailable, reason: 'recommendation_unavailable' } });
    });
    vi.stubGlobal('fetch', fetcher);
    render(<ClerkApp />);
    const buttons = await screen.findAllByRole('button', { name: 'Reload saved plan' });
    scenario = '2025-10-25';
    await userEvent.click(buttons[0]);
    expect(await screen.findByText('21 days')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('No ML provider connected.')).toHaveLength(2));
    const analysisCalls = fetcher.mock.calls.filter(([url]) => /\/(cost-impact|recommendation)\?/.test(url));
    expect(analysisCalls.length).toBeGreaterThanOrEqual(4);
    for (const call of analysisCalls) expect(call[1]?.headers).toEqual({ Authorization: 'Bearer session-a' });
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/config'))).toHaveLength(2);
  });
});


describe('Organisation selection and role recognition', () => {
  function configuration() {
    const fetcher = vi.fn(async (_url: string) => reply({ scenario_as_of_date: '2025-10-24' }));
    vi.stubGlobal('fetch', fetcher);
    window.history.replaceState(null, '', '/home');
    return fetcher;
  }

  it('keeps sign-in available without an active organisation', async () => {
    const fetcher = configuration();
    clerk.auth.isSignedIn = false; clerk.user.isSignedIn = false;
    clerk.auth.orgId = null; clerk.auth.orgRole = null;
    window.history.replaceState(null, '', '/login');
    render(<ClerkApp />);
    expect(await screen.findByText('Clerk sign-in')).toBeInTheDocument();
    expect(screen.queryByTestId('organisation-list')).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires a selection before requesting application data and skips invitation setup', () => {
    const fetcher = configuration();
    clerk.auth.orgId = null; clerk.auth.orgRole = null;
    clerk.organisation.organization = null;
    render(<ClerkApp />);
    expect(screen.getByRole('heading', { name: 'Choose your organisation' })).toBeInTheDocument();
    expect(screen.getByTestId('organisation-list')).toHaveAttribute('data-hide-personal', 'true');
    expect(screen.getByTestId('organisation-list')).toHaveAttribute('data-skip-invitations', 'true');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['org:admin', 'Admin'], ['org:buyer', 'Buyer'],
    ['org:manager', 'Procurement Manager'], ['org:analyst', 'Finance/Risk Analyst'],
  ])('shows the active organisation and %s membership role', async (role, label) => {
    configuration(); clerk.auth.orgRole = role;
    render(<ClerkApp />);
    expect(await screen.findByRole('button', { name: 'Switch organisation' })).toBeInTheDocument();
    expect(screen.getByLabelText('Active organisation')).toHaveTextContent('Bunker Buddy');
    expect(screen.getByLabelText('Active organisation')).toHaveTextContent(label);
  });

  it.each([null, 'org:member', 'org:unknown', 'toString'])('does not guess a role for %s', role => {
    const fetcher = configuration(); clerk.auth.orgRole = role;
    render(<ClerkApp />);
    expect(screen.getByRole('heading', { name: 'Organisation role needs updating' })).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('waits while Clerk is loading the selected organisation', () => {
    const fetcher = configuration();
    clerk.auth.orgId = 'org_b';
    render(<ClerkApp />);
    expect(screen.getByText('Loading your organisation...')).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('allows sign-out from organisation setup and handles a failed attempt', async () => {
    configuration(); clerk.auth.orgId = null; clerk.auth.orgRole = null;
    clerk.auth.signOut.mockRejectedValueOnce(new Error('offline'));
    render(<ClerkApp />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(clerk.auth.signOut).toHaveBeenCalledWith({ redirectUrl: '/login' });
  });

  it('clears old page state when switching organisation and reloads configuration', async () => {
    let resolveOld!: (response: Response) => void;
    const oldRows = new Promise<Response>(resolve => { resolveOld = resolve; });
    let first = true;
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/config')) return reply({ scenario_as_of_date: '2025-10-24' });
      if (first) { first = false; return oldRows; }
      return reply({ plans: [] });
    });
    vi.stubGlobal('fetch', fetcher);
    window.history.replaceState(null, '', '/purchase-plans');
    const view = render(<ClerkApp />);
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.endsWith('/purchase-plans'))).toBe(true));
    clerk.auth.orgId = 'org_b';
    clerk.organisation.organization = { id: 'org_b', name: 'Other Company' };
    view.rerender(<ClerkApp />);
    expect(await screen.findByText("You haven't created a purchase plan yet.")).toBeInTheDocument();
    await act(async () => { resolveOld(reply({ plans: [ANALYSIS_DEMO_PLAN] })); });
    expect(screen.queryByText('Your purchase plan')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Active organisation')).toHaveTextContent('Other Company');
    expect(screen.getByText('Purchase plans are personal and are not shared with this organisation yet.')).toBeInTheDocument();
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/config'))).toHaveLength(2);
  });

  it('does not send a delayed API request after the organisation changes', async () => {
    let resolveToken!: (token: string) => void;
    clerk.auth.getToken.mockImplementationOnce(() => new Promise(resolve => { resolveToken = resolve; }));
    const fetcher = configuration();
    window.history.replaceState(null, '', '/purchase-plans');
    const view = render(<ClerkApp />);
    await waitFor(() => expect(clerk.auth.getToken).toHaveBeenCalled());
    clerk.auth.orgId = null; clerk.auth.orgRole = null; clerk.organisation.organization = null;
    view.rerender(<ClerkApp />);
    await act(async () => { resolveToken('old-token'); });
    expect(screen.getByRole('heading', { name: 'Choose your organisation' })).toBeInTheDocument();
    expect(fetcher.mock.calls.every(([url]) => url.endsWith('/config'))).toBe(true);
  });
});
