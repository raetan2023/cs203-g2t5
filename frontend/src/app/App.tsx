import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { AppLink, navigate, usePath } from './router';
import { AppShell } from '../components/AppShell';
import { StatusPage } from '../components/StatusPage';
import { AuthPage } from '../features/auth/AuthPage';
import type { AuthService, SessionUser } from '../features/auth/types';
import { HomePage } from '../features/home/HomePage';
import { PurchasePlanPage, type PurchasePlanService } from '../features/purchase-plan';
import './app.css';

type Session = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; user: SessionUser | null };
const privateRoutes = ['/home', '/purchase-plans', '/market-dashboard'];
export interface AppProps {
  auth: AuthService;
  createPlanService(user: SessionUser): PurchasePlanService;
  scenarioDate: string;
  mock?: boolean;
  renderAuthPage?: (mode: 'login' | 'signup') => ReactNode;
  /** Anjali owns this component. No dashboard implementation is supplied here. */
  MarketDashboard?: ComponentType<{ scenarioDate: string }>;
}

export function App({ auth, createPlanService, scenarioDate, mock = false, renderAuthPage, MarketDashboard }: AppProps) {
  const path = usePath();
  const [session, setSession] = useState<Session>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const returnPath = useRef('/home');
  const read = useRef<{ auth: AuthService; attempt: number; promise: ReturnType<AuthService['readSession']> } | null>(null);
  const generation = useRef(0);
  const planStore = useRef<{ userId: string; service: PurchasePlanService } | null>(null);

  function acceptUser(user: SessionUser | null) {
    generation.current++;
    if (!user || planStore.current?.userId !== user.id) planStore.current = null;
    setSession({ state: 'ready', user });
  }
  useEffect(() => {
    let current = true;
    const epoch = generation.current;
    setSession({ state: 'loading' });
    if (!read.current || read.current.auth !== auth || read.current.attempt !== attempt) {
      read.current = { auth, attempt, promise: auth.readSession() };
    }
    read.current.promise.then(user => { if (current && epoch === generation.current) acceptUser(user); }).catch(error => {
      if (current && epoch === generation.current) setSession({ state: 'error', message: error instanceof Error ? error.message : 'Please try again.' });
    });
    const unsubscribe = auth.subscribe(user => {
      if (!current) return;
      setNotice(user ? '' : 'Your session ended. Please sign in again. Unsaved changes were discarded.');
      acceptUser(user);
    });
    return () => { current = false; unsubscribe(); };
  }, [auth, attempt]);

  const user = session.state === 'ready' ? session.user : null;
  useEffect(() => {
    if (session.state !== 'ready') return;
    if (path === '/') navigate(user ? '/home' : '/login', true);
    else if (!user && privateRoutes.includes(path)) { returnPath.current = path; navigate('/login', true); }
    else if (user && (path === '/login' || path === '/signup')) navigate(returnPath.current, true);
  }, [path, session, user]);

  useEffect(() => {
    document.title = `${({ '/login': 'Sign in', '/signup': 'Create account', '/home': 'Home', '/purchase-plans': 'Purchase plans', '/market-dashboard': 'Market dashboard' } as Record<string, string>)[path] ?? 'Bunker Buddy'} · Bunker Buddy`;
  }, [path]);

  if (session.state === 'loading') return <StatusPage message={privateRoutes.includes(path) ? 'Loading your home...' : 'Loading your session...'} />;
  if (session.state === 'error') return <StatusPage message="" error={session.message} retry={() => setAttempt(value => value + 1)} />;
  if (path === '/' || (!user && privateRoutes.includes(path)) || (user && (path === '/login' || path === '/signup'))) return <StatusPage message="Loading..." />;
  if (!user && (path === '/login' || path === '/signup')) {
    const epoch = generation.current;
    const mode = path === '/signup' ? 'signup' : 'login';
    if (renderAuthPage) return <>{notice && <p className="bb-notice" role="status">{notice}</p>}{renderAuthPage(mode)}</>;
    return <>{notice && <p className="bb-notice" role="status">{notice}</p>}<AuthPage key={`${path}-${epoch}`} mode={mode} service={auth} mock={mock} onSuccess={nextUser => {
      if (epoch !== generation.current) return;
      setNotice(''); acceptUser(nextUser); navigate(returnPath.current, true);
    }} /></>;
  }
  if (!user) return <div className="bb-app"><main className="bb-status"><h1>Page not found</h1><AppLink className="bb-button" href="/login">Go to sign in</AppLink></main></div>;
  if (!planStore.current || planStore.current.userId !== user.id) planStore.current = { userId: user.id, service: createPlanService(user) };
  return <AppShell path={path} scenarioDate={scenarioDate} marketAvailable={!!MarketDashboard} onSignOut={async () => {
    await auth.signOut(); acceptUser(null); returnPath.current = '/home'; setNotice(''); navigate('/login', true);
  }}>
    {path === '/home' ? <HomePage displayName={user.displayName} /> : path === '/purchase-plans' ? <PurchasePlanPage key={user.id} service={planStore.current.service} scenarioDate={scenarioDate} /> : path === '/market-dashboard' ? MarketDashboard ? <MarketDashboard scenarioDate={scenarioDate} /> : <main className="bb-status"><h1>Market dashboard is not connected yet</h1><p>This page will be supplied by the market dashboard feature.</p><AppLink className="bb-button" href="/home">Back to Home</AppLink></main> : <main className="bb-status"><h1>Page not found</h1><AppLink className="bb-button" href="/home">Back to Home</AppLink></main>}
  </AppShell>;
}
