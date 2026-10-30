import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppLink } from '../app/router';
import { Icon } from '../features/purchase-plan/components/Primitives';
import { formatDate } from '../features/purchase-plan/dates';
import { useBuyerDecisions } from '../features/purchase-plan/components/BuyerDecisions';
import { Brand } from './Brand';
import { AppIcon } from './AppIcon';

export function AppShell({ children, path, scenarioDate, onSignOut, marketAvailable = false, organisationControl, canReadPlans = true }: {
  children: ReactNode; path: string; scenarioDate: string; onSignOut(): Promise<void>; marketAvailable?: boolean; organisationControl?: ReactNode; canReadPlans?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const home = path === '/home';
  const count = useBuyerDecisions()?.data?.unread_count ?? 0;
  return <div className={home ? 'bb-app bb-app--home' : 'bb-app'}>
    <a className="bb-skip" href="#app-content">Skip to content</a>
    <header className="bb-header">
      <button ref={trigger} className="bb-menu" aria-label="Open navigation" aria-expanded={open} aria-controls="app-navigation" onClick={() => setOpen(true)}><Icon name="menu" /></button>
      {/* Home shows today's date in its greeting instead of the chip. */}
      <Brand />{home ? null : path === '/market-dashboard'
        ? <span className="bb-date">MARKET OVERVIEW</span>
        : <time className="bb-date" dateTime={scenarioDate}>{formatDate(scenarioDate)}</time>}
      {count > 0 && <AppLink className="bb-decisions-alert" href="/purchase-plans#decisions">{count} unread {count === 1 ? 'decision' : 'decisions'}</AppLink>}
      {organisationControl}
    </header>
    <div id="app-content" tabIndex={-1}>{children}</div>
    {open && <Navigation canReadPlans={canReadPlans} unreadCount={count} path={path} marketAvailable={marketAvailable} onSignOut={onSignOut} onClose={() => { setOpen(false); trigger.current?.focus(); }} />}
  </div>;
}

function Navigation({ path, onClose, onSignOut, marketAvailable, canReadPlans, unreadCount }: {
  path: string; onClose(): void; onSignOut(): Promise<void>; marketAvailable: boolean; canReadPlans: boolean; unreadCount: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal(); close.current?.focus(); document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  async function signOut() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await onSignOut(); }
    catch { setError("We couldn't sign you out. Please try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <dialog id="app-navigation" className="bb-sidebar" ref={dialog} aria-label="Main navigation" onCancel={event => { event.preventDefault(); if (!lock.current) onClose(); }} onClick={event => {
    if (event.target === event.currentTarget && !lock.current) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX > rect.right || event.clientX < rect.left) onClose();
    }
  }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    // Enumerate in tree order before filtering so keyboard order stays stable.
    const items = Array.from(dialog.current!.querySelectorAll<HTMLElement>('*')).filter(item =>
      (item instanceof HTMLAnchorElement && item.hasAttribute('href')) ||
      (item instanceof HTMLButtonElement && !item.disabled));
    if (!items.length) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)!.focus(); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
  }}>
    <div className="bb-sidebar-top"><Brand /><button ref={close} className="bb-icon-button" aria-label="Close navigation" disabled={busy} onClick={onClose}><AppIcon name="close" /></button></div>
    <nav>
      <AppLink href="/home" aria-current={path === '/home' ? 'page' : undefined} onClick={event => { if (busy) event.preventDefault(); else onClose(); }}><AppIcon name="home" />Home</AppLink>
      {canReadPlans && <AppLink href="/purchase-plans" aria-current={path.startsWith('/purchase-plans') ? 'page' : undefined} onClick={event => { if (busy) event.preventDefault(); else onClose(); }}><AppIcon name="plan" />Purchase plans{unreadCount > 0 && <span className="pp-unread" aria-label={`${unreadCount} unread decisions`}>{unreadCount}</span>}</AppLink>}
      {marketAvailable ? <AppLink href="/market-dashboard" aria-current={path === '/market-dashboard' ? 'page' : undefined} onClick={event => { if (busy) event.preventDefault(); else onClose(); }}><AppIcon name="chart" />Market dashboard</AppLink> : <button disabled title="Awaiting market dashboard integration"><AppIcon name="chart" />Market dashboard</button>}
    </nav>
    <div className="bb-sidebar-bottom">{error && <p role="alert">{error}</p>}<button className="bb-signout" disabled={busy} onClick={signOut}><AppIcon name="logout" />{busy ? 'Signing out...' : 'Sign out'}</button></div>
  </dialog>;
}
