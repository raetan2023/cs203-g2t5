import { useSyncExternalStore, type AnchorHTMLAttributes } from 'react';

const routeEvent = 'bunker-buddy:navigate';
export function navigate(path: string, replace = false) {
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(routeEvent));
}
function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener(routeEvent, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(routeEvent, listener);
  };
}
export function usePath() {
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => '/login');
}
export function AppLink({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === '_blank') return;
    event.preventDefault();
    navigate(href);
  }} />;
}
