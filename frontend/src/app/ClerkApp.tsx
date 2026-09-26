import { useAuth, useUser } from '@clerk/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusPage } from '../components/StatusPage';
import { ClerkAuthPage } from '../features/auth/ClerkAuthPage';
import type { AuthService, SessionUser } from '../features/auth/types';
import { createApiPlanService, fetchScenarioDate } from '../features/purchase-plan/apiService';
import { App } from './App';

type Scenario =
  | { state: 'idle' | 'loading' }
  | { state: 'ready'; date: string }
  | { state: 'error'; message: string };

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
    setScenario({ state: 'loading' });
    fetchScenarioDate()
      .then(date => { if (current) setScenario({ state: 'ready', date }); })
      .catch(error => {
        if (current) setScenario({
          state: 'error',
          message: error instanceof Error ? error.message : 'Could not load the application configuration.',
        });
      });
    return () => { current = false; };
  }, [signedIn, scenarioAttempt]);

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

  if (!authState.isLoaded || !userState.isLoaded) return <StatusPage message="Loading your session..." />;
  if (signedIn && scenario.state !== 'ready') {
    if (scenario.state === 'error') return <StatusPage message="" error={scenario.message} retry={() => setScenarioAttempt(value => value + 1)} />;
    return <StatusPage message="Loading application data..." />;
  }

  return <App
    auth={auth}
    createPlanService={createPlanService}
    scenarioDate={scenario.state === 'ready' ? scenario.date : ''}
    renderAuthPage={mode => <ClerkAuthPage mode={mode} />}
  />;
}
