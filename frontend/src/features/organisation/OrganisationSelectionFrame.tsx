import type { ReactNode } from 'react';
import { Brand } from '../../components/Brand';
import './organisation.css';

const responsibilities = [
  ['01', 'Buyer', 'Purchase planning'],
  ['02', 'Procurement Manager', 'Team oversight'],
  ['03', 'Finance/Risk Analyst', 'Cost and risk analysis'],
  ['04', 'Admin', 'People and access'],
];

/** Layout is independent of Clerk so account and error states share one shell. */
export function OrganisationSelectionFrame({ children, unsupportedRole, busy, error, onSignOut }: {
  children: ReactNode; unsupportedRole?: boolean; busy: boolean; error: string; onSignOut(): void;
}) {
  return <main className="bb-organisation-setup">
    <header className="bb-org-topbar">
      <Brand />
      <button className="bb-org-signout" disabled={busy} onClick={onSignOut}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4" /></svg>
        {busy ? 'Signing out...' : 'Sign out'}
      </button>
    </header>
    <div className="bb-org-layout">
      <section className="bb-org-intro" aria-labelledby="bb-org-heading">
        <span className="bb-org-eyebrow"><span />YOUR TEAM WORKSPACE</span>
        <h1 id="bb-org-heading">{unsupportedRole ? 'Organisation role needs updating' : 'Choose your organisation'}</h1>
        <p className="bb-org-lead">{unsupportedRole
          ? 'Ask your organisation admin to assign Buyer, Procurement Manager, Finance/Risk Analyst or Admin. You can also choose another organisation.'
          : 'A shared starting point for your team’s next bunker purchase. Choose a workspace to continue.'}</p>
        <div className="bb-org-route" aria-hidden="true">
          <svg viewBox="0 0 500 130" fill="none">
            <path className="bb-org-route-grid" d="M0 35h500M0 65h500M0 95h500M50 5v120M130 5v120M210 5v120M290 5v120M370 5v120M450 5v120" />
            <path className="bb-org-route-line" d="M45 85h110c42 0 45-40 90-40h95c36 0 46 40 95 40" />
            <circle cx="45" cy="85" r="6" /><circle cx="245" cy="45" r="6" /><circle cx="435" cy="85" r="6" />
            <path className="bb-org-ship" d="m245 38-14-8h28l-14 8Zm-7-10V17h14v11m-7-11v-6" />
          </svg>
          <div><span>Plan with clarity</span><span>Stay connected</span><span>Move together</span></div>
        </div>
        <div className="bb-org-team" aria-label="Team responsibilities">
          <p className="bb-org-section-label">FOUR ROLES. ONE TEAM.</p>
          <div className="bb-org-role-grid">{responsibilities.map(([number, name, description]) =>
            <div className="bb-org-role" key={number}><span>{number}</span><div><strong>{name}</strong><p>{description}</p></div></div>)}</div>
        </div>
      </section>
      <section className="bb-org-panel" aria-labelledby="bb-org-panel-heading">
        <div className="bb-org-panel-heading">
          <span className="bb-org-panel-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 7h2m4 0h2M8 11h2m4 0h2M10 21v-6h4v6" /></svg></span>
          <div><h2 id="bb-org-panel-heading">Your organisations</h2><p>Select your team or create a new workspace.</p></div>
        </div>
        {unsupportedRole && <p className="bb-org-role-warning" role="status">Your current membership needs one of the four supported roles.</p>}
        <div className="bb-org-picker">{children}</div>
        <div className="bb-org-invitation-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3 7 9 6 9-6" /></svg>
          <div><strong>Joining an existing team?</strong><p>Ask your admin for an invitation sent to the email you signed in with.</p></div>
        </div>
        {error && <p className="bb-org-error" role="alert">{error}</p>}
      </section>
    </div>
    <footer className="bb-org-footer"><span>BUNKER BUDDY</span><span>A clearer course for your next purchase.</span></footer>
  </main>;
}
