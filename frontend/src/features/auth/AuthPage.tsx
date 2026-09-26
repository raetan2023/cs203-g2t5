import { useEffect, useRef, useState } from 'react';
import { AppLink } from '../../app/router';
import { Brand } from '../../components/Brand';
import { AppIcon } from '../../components/AppIcon';
import { AuthError, type AuthService, type SessionUser } from './types';
import './auth.css';

export function AuthPage({ mode, service, onSuccess, mock = false }: {
  mode: 'login' | 'signup'; service: AuthService; onSuccess(user: SessionUser): void; mock?: boolean;
}) {
  const signup = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<AuthError['fields']>({});
  const [verification, setVerification] = useState('');
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const form = useRef<HTMLFormElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    const next: AuthError['fields'] = {};
    if (signup && !name.trim()) next.name = 'Enter your full name.';
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    // Password policy belongs to the configured authentication provider.
    setFields(next); setError('');
    if (Object.keys(next).length) {
      form.current?.querySelector<HTMLInputElement>(`[name="${Object.keys(next)[0]}"]`)?.focus();
      return;
    }
    lock.current = true; setBusy(true);
    try {
      if (signup) {
        const result = await service.signUp({ name: name.trim(), email: email.trim(), password });
        if (!mounted.current) return;
        if (result.status === 'complete') onSuccess(result.user);
        else { setPassword(''); setVerification(result.email); }
      } else {
        const user = await service.signIn({ email: email.trim(), password, remember: false });
        if (mounted.current) onSuccess(user);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Please try again.');
      if (failure instanceof AuthError) setFields(failure.fields);
    } finally { lock.current = false; setBusy(false); }
  }
  const fieldProps = (field: keyof AuthError['fields']) => ({
    name: field, id: `auth-${field}`, disabled: busy, 'aria-invalid': !!fields[field],
    'aria-describedby': fields[field] ? `auth-${field}-error` : undefined,
  });
  function clearField(field: keyof AuthError['fields']) { setFields(previous => ({ ...previous, [field]: undefined })); }

  return <main className={`auth-page ${signup ? 'auth-page--signup' : ''}`}>
    <section className="auth-hero" aria-label="About Bunker Buddy">
      <Brand />
      <div className="auth-hero-copy"><h1>{signup ? 'Create your account' : 'Your next bunker purchase starts with a clear plan'}</h1>
        <p>Manage your Singapore MGO purchase plan and explore market conditions in a single view.</p>
      </div>
      <Illustration />
      {!signup && <div className="auth-badges"><span>◇ &nbsp; Advisory only</span><span>◇ &nbsp; Human-in-the-loop</span><span>◇ &nbsp; You stay in control</span></div>}
    </section>
    <section className="auth-form-area" aria-label={signup ? 'Create account' : 'Sign in'}>
      <div className="auth-card">
        <h2>{verification ? 'Check your email' : signup ? 'Create account' : 'Sign in'}</h2>
        <p className="auth-subtitle">{verification ? `Continue verification for ${verification}.` : signup ? 'Get started with your purchase plan' : 'Enter your credentials to continue'}</p>
        {verification ? <><p role="status">Your account needs verification before you can sign in. Complete the verification steps supplied by your authentication provider.</p><AppLink className="auth-switch-link" href="/login">Back to sign in</AppLink></> : <>
          {!signup && <><div className="auth-social">
            <button type="button" disabled aria-describedby="social-unavailable"><span className="auth-microsoft" aria-hidden="true"><i /><i /><i /><i /></span>Continue with Microsoft</button>
            <button type="button" disabled aria-describedby="social-unavailable"><span className="auth-google" aria-hidden="true">G</span>Continue with Google</button>
          </div><p id="social-unavailable" className="auth-helper">Social sign-in is not available yet.</p><div className="auth-divider"><span>or</span></div></>}
          <form ref={form} noValidate onSubmit={submit} aria-busy={busy}>
            {signup && <div className="auth-field"><label htmlFor="auth-name">Full name</label><input {...fieldProps('name')} autoComplete="name" placeholder="Jane Doe" value={name} onChange={event => { setName(event.target.value); clearField('name'); }} />{fields.name && <p id="auth-name-error" className="auth-field-error">{fields.name}</p>}</div>}
            <div className="auth-field"><label htmlFor="auth-email">Email address</label><input {...fieldProps('email')} type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={event => { setEmail(event.target.value); clearField('email'); }} />{fields.email && <p id="auth-email-error" className="auth-field-error">{fields.email}</p>}</div>
            <div className="auth-field"><label htmlFor="auth-password">Password</label><div className="auth-password"><input {...fieldProps('password')} type={visible ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} placeholder="Enter your password" value={password} onChange={event => { setPassword(event.target.value); clearField('password'); }} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} disabled={busy} onClick={() => setVisible(value => !value)}><AppIcon name={visible ? 'eye-off' : 'eye'} /></button></div>{fields.password && <p id="auth-password-error" className="auth-field-error">{fields.password}</p>}</div>
            {!signup && <label className="auth-remember"><input type="checkbox" disabled />Remember me <span>(available after integration)</span></label>}
            {mock && <p className="auth-demo-note">Demo only — no real account is {signup ? 'created' : 'authenticated'}. Use a sample email and any nonempty demo password.</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button type="submit" className="bb-button auth-submit" disabled={busy}>{busy ? signup ? 'Creating account...' : 'Signing in...' : signup ? 'Create account' : 'Sign in'}</button>
            <span className="auth-sr-only" role="status">{busy ? 'Please wait...' : ''}</span>
          </form>
          <p className="auth-switch">{signup ? 'Already have an account? ' : 'New here? '}<AppLink href={signup ? '/login' : '/signup'} onClick={event => { if (busy) event.preventDefault(); }}>{signup ? 'Sign in' : 'Create an account'}</AppLink></p>
        </>}
      </div>
      <footer className="auth-footer">© 2026 Bunker Buddy</footer>
    </section>
  </main>;
}

function Illustration() {
  return <figure className="auth-illustration" aria-label="Illustrative mock market trend, not a forecast">
    <svg viewBox="0 0 720 320" role="img" aria-label="Decorative mock market trend">
      <defs><linearGradient id="trendFade"><stop stopColor="#75808b" /><stop offset="1" stopColor="#c9d1d6" /></linearGradient></defs>
      {[20, 95, 170, 245, 319].map(y => <path key={y} d={`M0 ${y}H720`} stroke="#172333" />)}
      <path d="m60 199 120-20 120 31 120-51 100 10" stroke="url(#trendFade)" strokeWidth="2" fill="none" />
      <path d="m520 169 80-29h120" stroke="#0db3b1" strokeWidth="3" fill="none" />
      <path d="m600 140 120-50m-120 50 120 50" stroke="#0db3b1" strokeWidth="1.5" strokeDasharray="4 5" />
      <circle cx="600" cy="140" r="5" fill="white" stroke="#0db3b1" strokeWidth="3" />
    </svg>
    <figcaption><span aria-hidden="true">●</span> Singapore MGO · Illustrative / mock data</figcaption>
  </figure>;
}
