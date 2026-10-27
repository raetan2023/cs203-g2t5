import { useAuth, useUser, useOrganization } from '@clerk/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusPage } from '../components/StatusPage';
import { ClerkAuthPage } from '../features/auth/ClerkAuthPage';
import type { AuthService, SessionUser } from '../features/auth/types';
import { createApiPlanService, fetchScenarioDate } from '../features/purchase-plan/apiService';
import { App } from './App';
import MarketDashboard from '../features/market-dashboard/MarketDashboard';
import { createApiRecommendationService } from '../features/recommendations/apiService';
import { OrganisationSelection, OrganisationControl } from '../features/organisation/OrganisationAccess';
import { organisationRoleLabel } from '../features/organisation/roles';

type Scenario =
  | { state: 'idle' | 'loading' }
  | { state: 'ready'; date: string; context: string }
  | { state: 'error'; message: string; context: string };

export function ClerkApp() {
  const authState = useAuth();
  const userState = useUser();
  const organisationState = useOrganization();
  const [scenario, setScenario] = useState<Scenario>({ state: 'idle' });
  const [scenarioAttempt, setScenarioAttempt] = useState(0);

  const signedIn = authState.isLoaded && authState.isSignedIn && userState.isLoaded && userState.isSignedIn;
  const orgId = authState.orgId;
  const orgRole = authState.orgRole;
  const roleLabel = organisationRoleLabel(orgRole);
  const organisationReady = signedIn && organisationState.isLoaded && !!orgId
    && organisationState.organization?.id === orgId && !!roleLabel;
  const contextKey = JSON.stringify([signedIn, authState.userId, orgId, orgRole]);
  const generation = useRef({ key: contextKey, value: 0 });
  if (generation.current.key !== contextKey) {
    generation.current = { key: contextKey, value: generation.current.value + 1 };
  }
  const currentGeneration = generation.current.value;

  useEffect(() => {
    if (!organisationReady) {
      setScenario({ state: 'idle' });
      return;
    }

    let current = true;
    setScenario({ state: 'loading' });
    fetchScenarioDate()
      .then(date => { if (current) setScenario({ state: 'ready', date, context: contextKey }); })
      .catch(error => {
        if (current) setScenario({
          state: 'error', context: contextKey,
          message: error instanceof Error ? error.message : 'Could not load the application configuration.',
        });
      });
    return () => { current = false; };
  }, [organisationReady, contextKey, scenarioAttempt]);

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

  // Prevent an adapter from sending a request after its account/organisation context changed.
  const getContextToken = useCallback(async () => {
    if (!organisationReady || generation.current.value !== currentGeneration) {
      throw new Error('Your organisation changed. Please try again.');
    }
    const token = await authState.getToken();
    if (generation.current.value !== currentGeneration) {
      throw new Error('Your organisation changed. Please try again.');
    }
    return token;
  }, [authState.getToken, organisationReady, currentGeneration]);
  const createPlanService = useCallback(
    () => createApiPlanService({ getToken: getContextToken }), [getContextToken],
  );
  const createRecommendationService = useCallback(
    () => createApiRecommendationService({ getToken: getContextToken }), [getContextToken],
  );

  if (!authState.isLoaded || !userState.isLoaded) return <StatusPage message="Loading your session..." />;
  if (signedIn && (!organisationState.isLoaded || (orgId && organisationState.organization?.id !== orgId))) {
    return <StatusPage message="Loading your organisation..." />;
  }
  if (signedIn && (!orgId || !roleLabel)) {
    return <OrganisationSelection unsupportedRole={!!orgId && !roleLabel}
      onSignOut={() => authState.signOut({ redirectUrl: '/login' })} />;
  }
  if (signedIn && (scenario.state !== 'ready' || scenario.context !== contextKey)) {
    if (scenario.state === 'error' && scenario.context === contextKey) return <StatusPage message="" error={scenario.message} retry={() => setScenarioAttempt(value => value + 1)} />;
    return <StatusPage message="Loading application data..." />;
  }

  return <App
    key={contextKey}
    organisationControl={organisationReady ? <OrganisationControl name={organisationState.organization!.name} role={roleLabel!} /> : undefined}
    personalPlansNotice={organisationReady}
    auth={auth}
    createPlanService={createPlanService}
    createRecommendationService={createRecommendationService}
    refreshScenario={() => setScenarioAttempt(value => value + 1)}
    scenarioDate={scenario.state === 'ready' ? scenario.date : ''}
    renderAuthPage={mode => <ClerkAuthPage mode={mode} />}
    MarketDashboard={MarketDashboard}
  />;
}
