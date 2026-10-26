import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ANALYSIS_DEMO_PLAN } from '../features/purchase-plan/fixtures';
import { ClerkApp } from './ClerkApp';

const clerk = vi.hoisted(() => {
  const user = { id: 'user_a', fullName: 'Rae', firstName: 'Rae', primaryEmailAddress: { emailAddress: 'rae@example.test' } };
  return { auth: { isLoaded: true, isSignedIn: true, userId: 'user_a', getToken: vi.fn(async () => 'session-a'), signOut: vi.fn() },
    user: { isLoaded: true, isSignedIn: true, user } };
});
vi.mock('@clerk/react', () => ({ useAuth: () => clerk.auth, useUser: () => clerk.user }));
vi.mock('../features/auth/ClerkAuthPage', () => ({ ClerkAuthPage: () => <p>Clerk sign-in</p> }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('Clerk API wiring', () => {
  it('refreshes the backend date on resume without remounting Home', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-26T15:59:00Z'));
    window.history.replaceState(null, '', '/home');
    let date = '2026-10-26';
    const fetcher = vi.fn(async () => reply({ scenario_as_of_date: date }));
    vi.stubGlobal('fetch', fetcher);
    render(<ClerkApp />);
    const heading = await screen.findByRole('heading', { name: /Welcome back/ });
    expect(await screen.findByText('26 Oct 2026')).toBeInTheDocument();
    date = '2026-10-27';
    now.mockReturnValue(Date.parse('2026-10-26T16:01:00Z'));
    window.dispatchEvent(new Event('focus'));
    expect(await screen.findByText('27 Oct 2026')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Welcome back/ })).toBe(heading);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
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
