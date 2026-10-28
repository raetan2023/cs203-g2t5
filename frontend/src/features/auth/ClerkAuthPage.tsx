import { SignIn, SignUp } from '@clerk/react';
import { useEffect, useRef, type RefObject } from 'react';
import { clerkAppearance } from '../../styles/theme';
import { AuthLayout } from './AuthLayout';

/**
 * Clerk's first sign-in step renders a password field that it only reveals once the field has a value (for
 * password managers), so it appeared on autofill and vanished when cleared. Keep it visible and reachable:
 * auth.css un-collapses the row, and this removes Clerk's aria-hidden / tabindex=-1 whenever Clerk sets them.
 * Clerk still owns the value and the flow (email + password signs in at once; email alone goes to the password step).
 */
function useVisibleFirstStepPassword(host: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const reveal = () => {
      root.querySelectorAll('.cl-formFieldRow__password[aria-hidden="true"]').forEach(row => row.removeAttribute('aria-hidden'));
      root.querySelectorAll('.cl-formFieldRow__password input[name="password"][tabindex="-1"]').forEach(input => input.removeAttribute('tabindex'));
    };
    reveal();
    const observer = new MutationObserver(reveal);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-hidden', 'tabindex'] });
    return () => observer.disconnect();
  }, [host]);
}

export function ClerkAuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';
  const host = useRef<HTMLDivElement>(null);
  useVisibleFirstStepPassword(host);

  return <AuthLayout label={signup ? 'Create account' : 'Sign in'}>
    <div ref={host} className="clerk-auth-host">
      {signup
        ? <SignUp routing="hash" signInUrl="/login" fallbackRedirectUrl="/home" appearance={clerkAppearance} />
        : <SignIn routing="hash" signUpUrl="/signup" fallbackRedirectUrl="/home" appearance={clerkAppearance} />}
    </div>
  </AuthLayout>;
}
