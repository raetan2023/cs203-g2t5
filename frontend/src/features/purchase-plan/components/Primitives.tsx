import type { ComponentPropsWithRef } from 'react';

export function Icon({ name }: { name: 'plus' | 'trash' | 'alert' | 'anchor' | 'menu' }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'plus' && <path d="M12 5v14M5 12h14" />}
    {name === 'trash' && <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>}
    {name === 'alert' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" /></>}
    {name === 'anchor' && <><circle cx="12" cy="4" r="2" /><path d="M12 6v15M7 10h10M4 13v3c0 3 8 5 8 5s8-2 8-5v-3M2 15l2-2 2 2M18 15l2-2 2 2" /></>}
    {name === 'menu' && <path d="M3 5h18M3 12h18M3 19h18" />}
  </svg>;
}

export function PlanButton({ variant = 'primary', className = '', ...props }: ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'danger-outline';
}) {
  return <button type="button" {...props} className={`pp-button pp-button--${variant} ${className}`} />;
}

export function ErrorBanner({ children }: { children: React.ReactNode }) {
  return <div className="pp-error-banner" role="alert"><Icon name="alert" /><span>{children}</span></div>;
}

export function LoadingState() {
  return <div className="pp-loading" role="status">
    <span className="pp-spinner" aria-hidden="true" />
    <p>Loading your purchase plans...</p>
  </div>;
}
