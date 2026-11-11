import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppLink } from '../app/router';
import { useBuyerDecisions } from '../features/purchase-plan/components/BuyerDecisions';
import { Brand } from './Brand';
import { AppIcon } from './AppIcon';

/** Phones (docs/ui-revamp/MOBILE_PLAN.md): at this width the nav and account controls move into a menu sheet. */
const PHONE = '(max-width: 480px)';

export function AppShell({ isAdmin = false, children, path, onSignOut, marketAvailable = false, organisationControl, canReadPlans = true, canViewDecisionHistory = true }: {
  isAdmin?: boolean; children: ReactNode; path: string; scenarioDate: string; onSignOut(): Promise<void>; marketAvailable?: boolean; organisationControl?: ReactNode; canReadPlans?: boolean; canViewDecisionHistory?: boolean;
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  async function signOut() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await onSignOut(); }
    catch { setError("We couldn't sign you out. Please try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  function closeMenu(returnFocus = false) {
    setMenuOpen(false);
    if (returnFocus) toggle.current?.focus();
  }
  // A route change, or growing past phone width, closes the menu.
  useEffect(() => { setMenuOpen(false); }, [path]);
  useEffect(() => {
    const phone = window.matchMedia?.(PHONE);
    if (!phone) return;
    const leave = () => { if (!phone.matches) setMenuOpen(false); };
    phone.addEventListener('change', leave);
    return () => phone.removeEventListener('change', leave);
  }, []);
  // While open: the sheet sits under the header wherever the header is, the page behind does not scroll,
  // focus moves into the sheet, and Escape closes it.
  useEffect(() => {
    if (!menuOpen) return;
    const root = document.documentElement;
    const top = header.current?.getBoundingClientRect().bottom ?? 64;
    root.style.setProperty('--bb-menu-top', `${Math.max(0, Math.round(top))}px`);
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    sheet.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu(true); };
    document.addEventListener('keydown', onKey);
    return () => { root.style.overflow = overflow; document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);
  const home = path === '/home';
  const count = useBuyerDecisions()?.data?.unread_count ?? 0;
  return <div className={home ? 'bb-app bb-app--home' : 'bb-app'}>
    <a className="bb-skip" href="#app-content">Skip to content</a>
    <header className="bb-header" ref={header}>
      <AppLink className="bb-brand-home" href="/home" aria-label="Bunker Buddy home"><Brand /></AppLink>
      {count > 0 && <AppLink className="bb-menu-badge" href="/purchase-plans/notifications" aria-label={`Manager decisions, ${count} unread`}>{count}</AppLink>}
      <button ref={toggle} type="button" className="bb-menu bb-menu-toggle" aria-label="Menu" aria-expanded={menuOpen} aria-controls="bb-header-menu"
        onClick={() => setMenuOpen(open => !open)}><AppIcon name={menuOpen ? 'dismiss' : 'menu'} /></button>
      {/* Above phone width both wrappers are display: contents, so the header lays out exactly as before. */}
      <div id="bb-header-menu" className="bb-header-menu" data-open={menuOpen || undefined}
        onClick={event => { if (event.target === event.currentTarget) closeMenu(true); }}>
        <div className="bb-header-menu-sheet" ref={sheet} onClick={event => { if ((event.target as HTMLElement).closest('a')) closeMenu(); }}>
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
        </div>
      </div>
    </header>
    {error &&<p className="bb-notice" role="alert">{error}</p>}
    <div id="app-content" tabIndex={-1}>{children}</div>
  </div>;
}
