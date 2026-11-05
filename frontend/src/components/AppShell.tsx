import { useRef, useState, type ReactNode } from 'react';
import { AppLink } from '../app/router';
import { useBuyerDecisions } from '../features/purchase-plan/components/BuyerDecisions';
import { Brand } from './Brand';
import { AppIcon } from './AppIcon';

export function AppShell({ isAdmin = false, children, path, onSignOut, marketAvailable = false, organisationControl, canReadPlans = true, canViewDecisionHistory = true }: {
  isAdmin?: boolean; children: ReactNode; path: string; scenarioDate: string; onSignOut(): Promise<void>; marketAvailable?: boolean; organisationControl?: ReactNode; canReadPlans?: boolean; canViewDecisionHistory?: boolean;
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function signOut() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await onSignOut(); }
    catch { setError("We couldn't sign you out. Please try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  const home = path === '/home';
  const count = useBuyerDecisions()?.data?.unread_count ?? 0;
  return <div className={home ? 'bb-app bb-app--home' : 'bb-app'}>
    <a className="bb-skip" href="#app-content">Skip to content</a>
    {!home && <header className="bb-header">
      <span className="bb-brand-home"><Brand /></span>
      <nav className="bb-topnav" aria-label="Main navigation">
      {isAdmin && <AppLink href="/admin" aria-current={path === '/admin' ? 'page' : undefined}><AppIcon name="chart" />Organisation administration</AppLink>}
      {canReadPlans && <AppLink href="/purchase-plans" aria-current={path.startsWith('/purchase-plans') && path !== '/purchase-plans/decisions' ? 'page' : undefined}><AppIcon name="plan" />Purchase plans{count > 0 && <span className="pp-unread" aria-label={`${count} unread decisions`}>{count}</span>}</AppLink>}
      {canReadPlans && canViewDecisionHistory && <AppLink href="/purchase-plans/decisions" aria-current={path === '/purchase-plans/decisions' ? 'page' : undefined}><AppIcon name="plan" />Decision history</AppLink>}
      {marketAvailable ? <AppLink href="/market-dashboard" aria-current={path === '/market-dashboard' ? 'page' : undefined}><AppIcon name="chart" />Market dashboard</AppLink> : null}
      </nav>
      <div className="bb-header-account">
        {count > 0 && <AppLink className="bb-decisions-alert" href="/purchase-plans/notifications">{count} unread {count === 1 ? 'decision' : 'decisions'}</AppLink>}
        {organisationControl}
        <button className="bb-signout" disabled={busy} onClick={signOut}><AppIcon name="logout" />{busy ? 'Signing out...' : 'Sign out'}</button>
      </div>
    </header>}
    {error && <p className="bb-notice" role="alert">{error}</p>}
    <div id="app-content" tabIndex={-1}>{children}</div>
  </div>;
}
