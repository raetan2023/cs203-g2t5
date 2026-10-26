import { useAuth, useUser } from '@clerk/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusPage } from '../components/StatusPage';
import { ClerkAuthPage } from '../features/auth/ClerkAuthPage';
import type { AuthService, SessionUser } from '../features/auth/types';
import { createApiPlanService, fetchScenarioDate } from '../features/purchase-plan/apiService';
import { App } from './App';
import MarketDashboard from '../features/market-dashboard/MarketDashboard';
import { createApiForecastService } from '../features/forecast/apiService';
import { createApiRecommendationService } from '../features/recommendations/apiService';


type Scenario =
  | { state: 'idle' | 'loading' }
  | { state: 'ready'; date: string }
  | { state: 'error'; message: string };

export function singaporeDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function msUntilSingaporeMidnight(now = new Date()) {
  return Date.parse(`${singaporeDate(now)}T00:00:00+08:00`) + 86_400_000 - now.getTime() + 100;
}

export function ClerkApp() {
  const authState = useAuth();
  const userState = useUser();
  const [scenario, setScenario] = useState<Scenario>({ state: 'idle' });
  const [scenarioAttempt, setScenarioAttempt] = useState(0);

  const signedIn = authState.isLoaded && authState.isSignedIn && userState.isLoaded && userState.isSignedIn;

  useEffect(() => {
    if (!signedIn) {
      setScenario({ state: 'idle' });
      return;
    }

    let current = true;
    setScenario(previous => previous.state === 'ready' ? previous : { state: 'loading' });
    fetchScenarioDate()
      .then(date => { if (current) { setScenario({ state: 'ready', date }); } })
      .catch(error => {
        if (current) setScenario({
          state: 'error',
          message: error instanceof Error ? error.message : 'Could not load the application configuration.',
        });
      });
    return () => { current = false; };
  }, [signedIn, authState.userId, scenarioAttempt]);

  useEffect(() => {
    if (!signedIn) return;
    let timer: ReturnType<typeof setTimeout>;
    function refresh() { setScenarioAttempt(value => value + 1); }
    function schedule() { timer = setTimeout(() => { refresh(); schedule(); }, msUntilSingaporeMidnight()); }
    function visible() { if (document.visibilityState === 'visible') refresh(); }
    schedule();
    document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [signedIn]);

  const sessionUser = useMemo<SessionUser | null>(() => {
    if (!signedIn) return null;
    const email = userState.user.primaryEmailAddress?.emailAddress ?? '';
    return {
      id: userState.user.id,
      displayName: userState.user.fullName ?? userState.user.firstName ?? (email || 'User'),
      email,
    };
  }, [signedIn, userState.user]);

  const auth = useMemo<AuthService>(() => ({
    async readSession() { return sessionUser; },
    async signIn() { throw new Error('Sign in is handled by Clerk.'); },
    async signUp() { throw new Error('Sign up is handled by Clerk.'); },
    async signOut() { await authState.signOut({ redirectUrl: '/login' }); },
    subscribe() { return () => {}; },
  }), [authState.signOut, sessionUser]);

  const createPlanService = useCallback(
    () => createApiPlanService({ getToken: () => authState.getToken() }),
    [authState.getToken],
  );
  const createForecastService = useCallback(
    () => createApiForecastService({ getToken: () => authState.getToken() }),
    [authState.getToken],
  );
  const createRecommendationService = useCallback(
    () => createApiRecommendationService({ getToken: () => authState.getToken() }),
    [authState.getToken],
  );

  if (!authState.isLoaded || !userState.isLoaded) return <StatusPage message="Loading your session..." />;
  if (signedIn && scenario.state !== 'ready') {
    if (scenario.state === 'error') return <StatusPage message="" error={scenario.message} retry={() => setScenarioAttempt(value => value + 1)} />;
    return <StatusPage message="Loading application data..." />;
  }

  return <App
    key={authState.userId ?? 'signed-out'}
    auth={auth}
    createPlanService={createPlanService}
    createRecommendationService={createRecommendationService}
    createForecastService={createForecastService}
    dataRevision={scenarioAttempt}
    refreshScenario={() => setScenarioAttempt(value => value + 1)}
    scenarioDate={scenario.state === 'ready' ? scenario.date : ''}
    renderAuthPage={mode => <ClerkAuthPage mode={mode} />}
    MarketDashboard={MarketDashboard}
  />;
}
