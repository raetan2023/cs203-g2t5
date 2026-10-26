import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ANALYSIS_DEMO_PLAN } from '../features/purchase-plan/fixtures';
import { ClerkApp, singaporeDate, msUntilSingaporeMidnight } from './ClerkApp';
import { addDays } from '../features/forecast/utils';
import { buildMockForecast } from '../features/forecast/mockService';

const clerk = vi.hoisted(() => {
  const user = { id: 'user_a', fullName: 'Rae', firstName: 'Rae', primaryEmailAddress: { emailAddress: 'rae@example.test' } };
  return { auth: { isLoaded: true, isSignedIn: true, userId: 'user_a', getToken: vi.fn(async () => 'session-a'), signOut: vi.fn() },
    user: { isLoaded: true, isSignedIn: true, user } };
});
vi.mock('../features/forecast/ForecastChart', () => ({ default: () => null }));
vi.mock('@clerk/react', () => ({ useAuth: () => clerk.auth, useUser: () => clerk.user }));
vi.mock('../features/auth/ClerkAuthPage', () => ({ ClerkAuthPage: () => <p>Clerk sign-in</p> }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('Clerk API wiring', () => {
  it('mounts both real adapters and refreshes backend configuration after a scenario conflict', async () => {
    window.history.replaceState(null, '', `/purchase-plans/recommendation?plan_id=${ANALYSIS_DEMO_PLAN.plan_id}`);
    let scenario = '2025-10-24';
    const unavailable = { status: 'unavailable', reason: 'missing_forecast', message: 'No ML provider connected.' };
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes('/forecast?')) return reply({ ...buildMockForecast(Number(new URL(url).searchParams.get('horizon_days'))), forecast_origin_date: scenario, anchor_quote_date: scenario,
        target_date: '2027-01-01', published_at: scenario + 'T01:00:00Z', history: [], source_dates: { mgo: scenario }, news_window_start: addDays(scenario, -1) + 'T00:00:00Z', news_window_end: scenario + 'T00:00:00Z' });
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
    expect(screen.queryByText('Synthetic preview')).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url.includes('/api/v1/purchase-plans/forecast?'))).toBe(true);
    expect(fetcher.mock.calls.some(([url]) => url.includes('/api/v1/forecast?'))).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: '14d' }));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.includes('/cost-impact?') && new URL(url).searchParams.get('horizon_days') === '14'
      && new URL(url).searchParams.get('run_id') === 'synthetic-preview')).toBe(true));
  });
});


describe('Singapore application date refresh', () => {
  it('calculates Singapore midnight independently of the browser timezone', () => {
    const before = new Date('2026-10-26T15:59:59Z');
    expect(singaporeDate(before)).toBe('2026-10-26');
    expect(msUntilSingaporeMidnight(before)).toBe(1100);
    expect(singaporeDate(new Date('2026-10-26T16:00:00Z'))).toBe('2026-10-27');
  });

  it('refreshes backend configuration after Singapore midnight and when the tab becomes visible', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T15:59:59Z'));
    window.history.replaceState(null, '', '/home');
    const fetcher = vi.fn(async (url: string) => url.endsWith('/config')
      ? reply({ scenario_as_of_date: singaporeDate() })
      : reply({ status: 'unavailable', reason: 'no_run', message: 'No current forecast.' }));
    vi.stubGlobal('fetch', fetcher);
    await act(async () => { render(<ClerkApp />); });
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/config'))).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/config'))).toHaveLength(2);
    expect(screen.getByText('27 Oct 2026')).toBeVisible();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/config'))).toHaveLength(3);
  });
});
