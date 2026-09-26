import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { ClerkApp } from './app/ClerkApp';
import './app/app.css';

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkKey) {
  throw new Error(
    'Missing VITE_CLERK_PUBLISHABLE_KEY in frontend/.env.local',
  );
}

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <ClerkProvider
      publishableKey={clerkKey}
      signInUrl="/login"
      signUpUrl="/signup"
      signInFallbackRedirectUrl="/home"
      signUpFallbackRedirectUrl="/home"
      afterSignOutUrl="/login"
    >
      <ClerkApp />
    </ClerkProvider>
  </StrictMode>,
);
