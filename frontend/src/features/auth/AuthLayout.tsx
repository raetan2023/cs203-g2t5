import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Brand } from '../../components/Brand';
import poster from './assets/signin-ship-poster.jpg';
import shipVideo from './assets/signin-ship.mp4';
import './auth.css';

function useReducedMotion() {
  const [reduce, setReduce] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setReduce(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduce;
}

/**
 * Looping aerial shot of a container ship (Pexels 15795926, full 49s, centre-cropped to 900x900, native 59.94fps, 1s fades at both ends);
 * a still frame when reduced motion is on or the video fails.
 */
function HeroVideo() {
  const reduce = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    // React does not always write the muted attribute, which blocks autoplay; set it on the element.
    element.muted = true;
    const play = () => { try { void element.play()?.catch(() => {}); } catch { /* not supported (tests) */ } };
    // No decoding while the tab is hidden.
    const onVisibility = () => { if (document.hidden) element.pause(); else play(); };
    play();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [reduce, failed]);

  if (reduce || failed) return <img className="auth-hero-media" src={poster} alt="" data-auth-hero="poster" />;
  // No poster: the clip fades in from (and out to) black, so it rises out of the dark panel and loops without a jump cut.
  return <video ref={video} className="auth-hero-media" src={shipVideo} autoPlay muted loop playsInline preload="auto"
    onError={() => setFailed(true)} data-auth-hero="video" />;
}

/** Sign-in / sign-up layout shared by the Clerk page and the mock preview page: ship video panel left, form right. */
export function AuthLayout({ label, children }: { label: string; children: ReactNode }) {
  return <div className="auth-page">
    <main className="auth-content">
      <div className="auth-hero">
        <div className="auth-hero-scene" aria-hidden="true">
          <HeroVideo />
          <span className="auth-hero-shade-top" />
          <span className="auth-hero-shade-bottom" />
          <span className="auth-hero-shade-corner" />
        </div>
        <div className="auth-header"><Brand /></div>
        <div className="auth-copy">
          <h1 id="auth-intro-title">A clearer course.<br />A smarter purchase.</h1>
          <p>Forecasts for Singapore MGO, with purchase plans built around your deadlines.</p>
        </div>
      </div>
      <section className="auth-form-area" aria-label={label}>{children}</section>
    </main>
  </div>;
}
