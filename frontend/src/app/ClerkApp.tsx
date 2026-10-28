import { useAuth, useClerk, useUser, useOrganization } from '@clerk/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusPage } from '../components/StatusPage';
import { ClerkAuthPage } from '../features/auth/ClerkAuthPage';
import type { AuthService, SessionUser } from '../features/auth/types';
import { createApiPlanService, fetchScenarioDate } from '../features/purchase-plan/apiService';
import { App } from './App';
import MarketDashboard from '../features/market-dashboard/MarketDashboard';
import { createApiForecastService } from '../features/forecast/apiService';
import { createApiRecommendationService } from '../features/recommendations/apiService';
import { OrganisationSelection, OrganisationControl } from '../features/organisation/OrganisationAccess';
import { fetchOrganisationAccess, type OrganisationPermissions } from '../features/organisation/apiService';
import { organisationRoleLabel } from '../features/organisation/roles';
import { organisationAppearance } from '../features/organisation/appearance';
import { createStoredMgoQuoteReader } from '../features/home/marketQuote';

type Scenario =
  | { state: 'idle' | 'loading' }
  | { state: 'ready'; date: string; context: string; permissions: OrganisationPermissions }
  | { state: 'error'; message: string; context: string };

export function singaporeDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function msUntilSingaporeMidnight(now = new Date()) {
  return Date.parse(`${singaporeDate(now)}T00:00:00+08:00`) + 86_400_000 - now.getTime() + 100;
}

export function ClerkApp() {
  const authState = useAuth();
  const clerk = useClerk();
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
    setScenario(previous => previous.state === 'ready' && previous.context === contextKey ? previous : { state: 'loading' });
    Promise.all([fetchScenarioDate(), fetchOrganisationAccess(() => getContextToken(true))])
      .then(([date, permissions]) => {
        if (!current) return;
        if (permissions.organisation_id !== orgId || permissions.role !== orgRole) {
          throw new Error('Your organisation membership changed. Refresh your session and retry.');
        }
        setScenario({ state: 'ready', date, context: contextKey, permissions });
      })
      .catch(error => {
        if (current) setScenario({
          state: 'error', context: contextKey,
          message: error instanceof Error ? error.message : 'Could not load the application configuration.',
        });
      });
    return () => { current = false; };
  }, [organisationReady, contextKey, scenarioAttempt]);

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

  // Prevent an adapter from sending a request after its account/organisation context changed.
  const getContextToken = useCallback(async (skipCache = false) => {
    if (!organisationReady || generation.current.value !== currentGeneration) {
      throw new Error('Your organisation changed. Please try again.');
    }
    const token = await authState.getToken({ skipCache });
    if (generation.current.value !== currentGeneration) {
      throw new Error('Your organisation changed. Please try again.');
    }
    return token;
  }, [authState.getToken, organisationReady, currentGeneration]);
  const createPlanService = useCallback(
    () => createApiPlanService({ getToken: getContextToken }), [getContextToken],
  );
  const createForecastService = useCallback(
    () => createApiForecastService({ getToken: () => authState.getToken() }),
    [authState.getToken],
  );
  const createPurchaseForecastService = useCallback(
    () => createApiForecastService({ getToken: () => authState.getToken(), path: '/api/v1/purchase-plans/forecast' }),
    [authState.getToken],
  );
  const createRecommendationService = useCallback(
    () => createApiRecommendationService({ getToken: getContextToken }), [getContextToken],
  );
  const readMarketQuote = useMemo(() => createStoredMgoQuoteReader(), []);
  // Members, invitations and roles are managed in Clerk; the backend has no member endpoints.
  const manageOrganisation = useCallback(
    () => clerk.openOrganizationProfile({ appearance: organisationAppearance }), [clerk],
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
    planAccess={scenario.state === 'ready' ? scenario.permissions : undefined}
    auth={auth}
    createPlanService={createPlanService}
    createRecommendationService={createRecommendationService}
    createForecastService={createForecastService}
    createPurchaseForecastService={createPurchaseForecastService}
    dataRevision={scenarioAttempt}
    refreshScenario={() => setScenarioAttempt(value => value + 1)}
    scenarioDate={scenario.state === 'ready' ? scenario.date : ''}
    renderAuthPage={mode => <ClerkAuthPage mode={mode} />}
    MarketDashboard={MarketDashboard}
    readMarketQuote={readMarketQuote}
    onManageOrganisation={manageOrganisation}
  />;
}
