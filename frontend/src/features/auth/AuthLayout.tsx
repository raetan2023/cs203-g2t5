import type { ReactNode } from 'react';
import { Brand } from '../../components/Brand';
import { WireframeVessel } from './WireframeVessel';
import './auth.css';

/** Wireframe login layout shared by the Clerk page and the mock preview page. */
export function AuthLayout({ label, children }: { label: string; children: ReactNode }) {
  return <div className="auth-page">
    <header className="auth-header"><Brand /></header>
    <main className="auth-layout">
      <section className="auth-intro" aria-labelledby="auth-intro-title">
        <h1 id="auth-intro-title">A clearer course.<br />A smarter purchase.</h1>
        <p>Navigate MGO price uncertainty with forecasts<br className="auth-desktop-break" /> and a purchase plan built around you.</p>
        <WireframeVessel />
      </section>
      <section className="auth-form-area" aria-label={label}>{children}</section>
    </main>
  </div>;
}
