import { SignIn, SignUp } from '@clerk/react';
import { clerkAppearance } from '../../styles/theme';
import { AuthLayout } from './AuthLayout';

export function ClerkAuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';

  return <AuthLayout label={signup ? 'Create account' : 'Sign in'}>
    <div className="clerk-auth-host">
      {signup
        ? <SignUp routing="hash" signInUrl="/login" fallbackRedirectUrl="/home" appearance={clerkAppearance} />
        : <SignIn routing="hash" signUpUrl="/signup" fallbackRedirectUrl="/home" appearance={clerkAppearance} />}
    </div>
  </AuthLayout>;
}
