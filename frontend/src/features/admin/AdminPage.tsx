import type { ReactNode } from 'react';
import { AppLink } from '../../app/router';
import './admin.css';

export function AdminPage({ organisationName, organisationSwitcher, management, teamReporting, onManageOrganisation }: {
  organisationName?: string; organisationSwitcher?: ReactNode; management?: ReactNode; teamReporting?: ReactNode; onManageOrganisation?: () => void;
}) {
  return <main className="bb-admin">
    <AppLink className="bb-admin-back" href="/home">← Back to Home</AppLink>
    <header className="bb-admin-heading">
      <div><p className="bb-admin-eyebrow">Organisation administration</p>
        <h1>{organisationName || 'Your organisation'}</h1>
        <p className="bb-admin-intro">Give your team the right access. Manage people, invitations and company settings.</p>
      </div>
      <div className="bb-admin-heading-side">
        {organisationSwitcher && <div className="bb-admin-switcher"><span className="bb-admin-switcher-label" id="admin-switch-organisation">Switch organisation</span>
          <div aria-labelledby="admin-switch-organisation" role="group">{organisationSwitcher}</div></div>}
        <span className="bb-admin-role">Admin access</span>
      </div>
    </header>
    {teamReporting}
    <section className="bb-admin-workspace" aria-labelledby="admin-workspace">
      <div className="bb-admin-section-heading"><h2 id="admin-workspace">People and settings</h2>
        <p>Use Members to invite colleagues and assign roles. Use General to update organisation details.</p>
      </div>
      {management ? <div className="bb-admin-management">{management}</div> : <div className="bb-admin-fallback">
        <p>Manage your organisation’s members, pending invitations and settings in the organisation profile.</p>
        {onManageOrganisation ? <button className="bb-button" onClick={onManageOrganisation}>Manage organisation</button> : <p role="status">Organisation management is unavailable in this preview.</p>}
      </div>}
    </section>
    <details className="bb-admin-roles">
      <summary><span>Which role should I assign?</span><span className="bb-admin-summary-hint">Role permissions</span></summary>
      <div className="bb-admin-role-table"><table>
        <caption>Access within your organisation</caption>
        <thead><tr><th scope="col">Role</th><th scope="col">Responsibilities</th></tr></thead>
        <tbody>
          <tr><th scope="row">Procurement Officer</th><td>Create plans, submit approval requests, withdraw requests and record purchases.</td></tr>
          <tr><th scope="row">Procurement Manager</th><td>Oversee team plans and exposure, and approve or reject submitted requests with comments.</td></tr>
          <tr><th scope="row">Admin</th><td>Manage members, invitations, roles and settings. View organisation purchase plans without changing them.</td></tr>
        </tbody>
      </table></div>
    </details>
  </main>;
}
