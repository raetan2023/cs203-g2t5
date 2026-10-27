import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Brand } from '../../components/Brand';
import { AppIcon } from '../../components/AppIcon';
import { createMockAuthService } from '../../preview/mockAuthService';
import poster from './assets/vessel-poster.jpg';
import vesselVideo from './assets/vessel.mp4';

function VesselBackground() {
  const [motion, setMotion] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const update = () => setMotion(!preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  return <div className="oris-scene" aria-hidden="true">
    <img src={poster} alt="" className="oris-vessel" />
    {motion && !failed && <video className="oris-vessel" autoPlay muted playsInline poster={poster}
      onError={() => setFailed(true)}
      onTimeUpdate={event => {
        // One short establishing shot; no endless movement behind a form.
        if (event.currentTarget.currentTime >= 5) event.currentTarget.pause();
      }}><source src={vesselVideo} type="video/mp4" /></video>}
    <div className="oris-shade" />
  </div>;
}

function ProviderMark({ provider }: { provider: 'Google' | 'Microsoft' }) {
  return provider === 'Microsoft'
    ? <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2 2h9v9H2zm11 0h9v9h-9zM2 13h9v9H2zm11 0h9v9h-9z" /></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.8 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.5c-.3 1.3-1 2.4-2.1 3.1-1 .7-2.1 1-3.4 1a6.3 6.3 0 1 1 0-12.6c1.5 0 2.8.5 3.8 1.5l3.1-3.1A10.4 10.4 0 1 0 12 22.5c3 0 5.5-1 7.3-2.8 1.7-1.8 2.5-4.3 2.5-7.5Z" /></svg>;
}

export function OrisLogin({ background, introVisual, className = '' }: { background?: ReactNode; introVisual?: ReactNode; className?: string } = {}) {
  const [auth] = useState(() => createMockAuthService());
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (complete) heading.current?.focus(); }, [complete]);

  function reset(nextSignup: boolean) {
    setSignup(nextSignup); setPassword(''); setVisible(false); setFields({}); setError(''); setComplete(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const next: Record<string, string> = {};
    if (signup && !name.trim()) next.name = 'Enter your full name.';
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    setFields(next); setError('');
    if (Object.keys(next).length) {
      form.current?.querySelector<HTMLInputElement>(`[name="${Object.keys(next)[0]}"]`)?.focus();
      return;
    }
    locked.current = true; setBusy(true);
    try {
      if (signup) await auth.signUp({ name: name.trim(), email: email.trim(), password });
      else await auth.signIn({ email: email.trim(), password, remember: false });
      if (mounted.current) { setPassword(''); setComplete(true); }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Please try again.');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const fieldProps = (key: string) => ({
    name: key, id: `oris-${key}`, disabled: busy, 'aria-invalid': !!fields[key],
    'aria-describedby': fields[key] ? `oris-${key}-error` : undefined,
  });
  const clear = (key: string) => setFields(current => ({ ...current, [key]: '' }));

  return <div className={`oris-page ${className}`}>
    {background ?? <VesselBackground />}
    <header className="oris-header"><Brand /></header>
    <main className="oris-layout">
      <section className="oris-intro" aria-labelledby="oris-title">
        <h1 id="oris-title">A clearer course.<br />A smarter purchase.</h1>
        <p>Navigate MGO price uncertainty with forecasts<br className="oris-desktop-break" /> and a purchase plan built around you.</p>
        {introVisual}
      </section>
      <section className="oris-card" aria-labelledby="oris-form-title">
        <h2 ref={heading} tabIndex={-1} id="oris-form-title">{complete ? 'You’re signed in.' : signup ? 'Create your account.' : 'Welcome back.'}</h2>
        <p className="oris-subtitle">{complete ? 'The preview is complete. No real account was accessed.' : signup ? 'Start planning your next purchase.' : 'Sign in to your Bunker Buddy account.'}</p>
        {complete ? <button className="oris-submit" onClick={() => { void auth.signOut(); reset(false); }}>Back to sign in</button> : <>
          {!signup && <><div className="oris-providers">
            {(['Google', 'Microsoft'] as const).map(provider => <button key={provider} type="button" onClick={() => setError(`${provider} sign-in is not connected in this preview. Use the sample email form below.`)} disabled={busy} aria-label={`Continue with ${provider}`}><ProviderMark provider={provider} />{provider}</button>)}
          </div><div className="oris-divider"><span>or continue with email</span></div></>}
          <form ref={form} noValidate onSubmit={submit} aria-busy={busy}>
            {signup && <div className="oris-field"><label htmlFor="oris-name">Full name</label><input {...fieldProps('name')} autoComplete="name" value={name} placeholder="Your name" onChange={event => { setName(event.target.value); clear('name'); }} />{fields.name && <p id="oris-name-error" className="oris-field-error">{fields.name}</p>}</div>}
            <div className="oris-field"><label htmlFor="oris-email">Email address</label><input {...fieldProps('email')} type="email" autoComplete="email" value={email} placeholder="you@company.com" onChange={event => { setEmail(event.target.value); clear('email'); }} />{fields.email && <p id="oris-email-error" className="oris-field-error">{fields.email}</p>}</div>
            <div className="oris-field"><label htmlFor="oris-password">Password</label><div className="oris-password"><input {...fieldProps('password')} type={visible ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} value={password} placeholder="Enter your password" onChange={event => { setPassword(event.target.value); clear('password'); }} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} disabled={busy} onClick={() => setVisible(current => !current)}><AppIcon name={visible ? 'eye-off' : 'eye'} /></button></div>{fields.password && <p id="oris-password-error" className="oris-field-error">{fields.password}</p>}</div>
            {error && <p className="oris-error" role="alert">{error}</p>}
            <button className="oris-submit" type="submit" disabled={busy}><span>{busy ? signup ? 'Creating account…' : 'Signing in…' : signup ? 'Create account' : 'Sign in'}</span><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></button>
            <span className="oris-sr-only" role="status">{busy ? 'Please wait.' : ''}</span>
          </form>
          <p className="oris-switch">{signup ? 'Already have an account?' : 'New to Bunker Buddy?'} <button disabled={busy} onClick={() => reset(!signup)}>{signup ? 'Sign in' : 'Create an account'}</button></p>
          <p className="oris-preview-note">Visual preview · Use a sample email and password.</p>
        </>}
      </section>
    </main>
  </div>;
}
