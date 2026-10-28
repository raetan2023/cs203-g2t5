import { useEffect, useRef, type ReactNode } from 'react';
import { Brand } from '../../components/Brand';
import { ReactiveShip } from './ReactiveShip';
import { useAuthFormSignals } from './useAuthFormSignals';
import './auth.css';

/** Sign-in / sign-up layout shared by the Clerk page and the mock preview page: a dusk scene whose ship reacts to the form card. */
export function AuthLayout({ label, children }: { label: string; children: ReactNode }) {
  const card = useRef<HTMLElement>(null);
  const signals = useAuthFormSignals(card);

  // A returned error shakes the card once; restarting the class replays the animation.
  useEffect(() => {
    const element = card.current;
    if (!signals.shake || !element) return;
    element.classList.remove('auth-shake');
    void element.offsetWidth;
    element.classList.add('auth-shake');
  }, [signals.shake]);

  return <div className="auth-page">
    <ReactiveShip levels={signals.levels} bridge={signals.bridge} dim={signals.dim} sail={signals.sail} paused={signals.paused} />
    <main className="auth-content">
      <div className="auth-intro">
        <div className="auth-header"><Brand /></div>
        <div className="auth-copy">
          <h1 id="auth-intro-title">A clearer course.<br />A smarter purchase.</h1>
          <p>Navigate MGO price uncertainty with forecasts and a purchase plan built around you.</p>
        </div>
      </div>
      <section ref={card} className="auth-form-area" aria-label={label}
        onAnimationEnd={event => { if (event.target === event.currentTarget) event.currentTarget.classList.remove('auth-shake'); }}>{children}</section>
    </main>
  </div>;
}
