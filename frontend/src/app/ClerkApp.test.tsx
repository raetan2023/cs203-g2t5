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
afterEach(() => vi.unstubAllGlobals());
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('Clerk API wiring', () => {
  it('mounts both real adapters and refreshes backend configuration after a scenario conflict', async () => {
    window.history.replaceState(null, '', '/purchase-plans/recommendation');
    let scenario = '2025-10-24';
    const unavailable = { status: 'unavailable', reason: 'missing_forecast', message: 'No ML provider connected.' };
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/config')) return reply({ scenario_as_of_date: scenario });
      if (url.endsWith('/purchase-plan')) return reply({ plan: { ...ANALYSIS_DEMO_PLAN, scenario_as_of_date: scenario, days_remaining: scenario === '2025-10-24' ? 22 : 21 } });
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
