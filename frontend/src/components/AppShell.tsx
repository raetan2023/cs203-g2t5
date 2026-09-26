import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppLink } from '../app/router';
import { Icon } from '../features/purchase-plan/components/Primitives';
import { formatDate } from '../features/purchase-plan/dates';
import { Brand } from './Brand';
import { AppIcon } from './AppIcon';

export function AppShell({ children, path, scenarioDate, onSignOut, marketAvailable = false }: {
  children: ReactNode; path: string; scenarioDate: string; onSignOut(): Promise<void>; marketAvailable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <div className="bb-app">
    <a className="bb-skip" href="#app-content">Skip to content</a>
    <header className="bb-header">
      <button ref={trigger} className="bb-menu" aria-label="Open navigation" aria-expanded={open} aria-controls="app-navigation" onClick={() => setOpen(true)}><Icon name="menu" /></button>
      <Brand /><time className="bb-date" dateTime={scenarioDate}>{formatDate(scenarioDate)}</time>
    </header>
    <div id="app-content" tabIndex={-1}>{children}</div>
    {open && <Navigation path={path} marketAvailable={marketAvailable} onSignOut={onSignOut} onClose={() => { setOpen(false); trigger.current?.focus(); }} />}
  </div>;
}

function Navigation({ path, onClose, onSignOut, marketAvailable }: {
  path: string; onClose(): void; onSignOut(): Promise<void>; marketAvailable: boolean;
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
      <AppLink href="/purchase-plans" aria-current={path === '/purchase-plans' ? 'page' : undefined} onClick={event => { if (busy) event.preventDefault(); else onClose(); }}><AppIcon name="plan" />Purchase plans</AppLink>
      {marketAvailable ? <AppLink href="/market-dashboard" aria-current={path === '/market-dashboard' ? 'page' : undefined} onClick={event => { if (busy) event.preventDefault(); else onClose(); }}><AppIcon name="chart" />Market dashboard</AppLink> : <button disabled title="Awaiting market dashboard integration"><AppIcon name="chart" />Market dashboard</button>}
      <button disabled><AppIcon name="bulb" />Recommendation <span className="bb-coming">Coming soon</span></button>
    </nav>
    <div className="bb-sidebar-bottom">{error && <p role="alert">{error}</p>}<button className="bb-signout" disabled={busy} onClick={signOut}><AppIcon name="logout" />{busy ? 'Signing out...' : 'Sign out'}</button></div>
  </dialog>;
}
