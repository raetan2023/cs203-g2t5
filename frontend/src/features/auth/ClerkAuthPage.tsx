import { SignIn, SignUp } from '@clerk/react';
import { Brand } from '../../components/Brand';
import './auth.css';

const appearance = {
  variables: {
    colorPrimary: '#008e90',
    colorText: '#122334',
    colorBackground: '#ffffff',
    borderRadius: '0.5rem',
  },
  elements: {
    rootBox: { width: '100%' },
    cardBox: { width: '100%', boxShadow: 'none' },
    card: { width: '100%', padding: '2.5rem', boxShadow: 'none', border: '1px solid #dbe4ec' },
    headerTitle: { fontSize: '2rem', lineHeight: '1.2' },
    headerSubtitle: { fontSize: '1.05rem', lineHeight: '1.5' },
    socialButtonsBlockButton: { minHeight: '3.4rem', fontSize: '1rem' },
    formFieldLabel: { fontSize: '1rem' },
    formFieldInput: { minHeight: '3.4rem', fontSize: '1.05rem' },
    formButtonPrimary: { minHeight: '3.4rem', fontSize: '1.05rem' },
    footerActionText: { fontSize: '1rem' },
    footerActionLink: { fontSize: '1rem' },
  },
} as const;

export function ClerkAuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';

  return <main className={`auth-page ${signup ? 'auth-page--signup' : ''}`}>
    <section className="auth-hero" aria-label="About Bunker Buddy">
      <Brand />
      <div className="auth-hero-copy">
        <h1>{signup ? 'Create your account' : 'Your next bunker purchase starts with a clear plan'}</h1>
        <p>Manage your Singapore MGO purchase plan and explore market conditions in a single view.</p>
      </div>
      <Illustration />
      {!signup && <div className="auth-badges"><span>◇ &nbsp; Advisory only</span><span>◇ &nbsp; Human-in-the-loop</span><span>◇ &nbsp; You stay in control</span></div>}
    </section>
    <section className="auth-form-area" aria-label={signup ? 'Create account' : 'Sign in'}>
      <div className="clerk-auth-host">
        {signup
          ? <SignUp routing="hash" signInUrl="/login" fallbackRedirectUrl="/home" appearance={appearance} />
          : <SignIn routing="hash" signUpUrl="/signup" fallbackRedirectUrl="/home" appearance={appearance} />}
      </div>
      <footer className="auth-footer">© 2026 Bunker Buddy</footer>
    </section>
  </main>;
}

function Illustration() {
  return <figure className="auth-illustration" aria-label="Illustrative mock market trend, not a forecast">
    <svg viewBox="0 0 720 320" role="img" aria-label="Decorative mock market trend">
      <defs><linearGradient id="clerkTrendFade"><stop stopColor="#75808b" /><stop offset="1" stopColor="#c9d1d6" /></linearGradient></defs>
      {[20, 95, 170, 245, 319].map(y => <path key={y} d={`M0 ${y}H720`} stroke="#172333" />)}
      <path d="m60 199 120-20 120 31 120-51 100 10" stroke="url(#clerkTrendFade)" strokeWidth="2" fill="none" />
      <path d="m520 169 80-29h120" stroke="#0db3b1" strokeWidth="3" fill="none" />
      <path d="m600 140 120-50m-120 50 120 50" stroke="#0db3b1" strokeWidth="1.5" strokeDasharray="4 5" />
      <circle cx="600" cy="140" r="5" fill="white" stroke="#0db3b1" strokeWidth="3" />
    </svg>
    <figcaption><span aria-hidden="true">●</span> Singapore MGO · Illustrative / mock data</figcaption>
  </figure>;
}
