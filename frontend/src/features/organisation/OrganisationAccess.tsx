import { OrganizationList, OrganizationSwitcher } from '@clerk/react';
import { useState } from 'react';
import { OrganisationSelectionFrame } from './OrganisationSelectionFrame';
import { organisationAppearance } from './appearance';
import './organisation.css';

export function OrganisationSelection({ unsupportedRole, onSignOut }: {
  unsupportedRole?: boolean; onSignOut(): Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <OrganisationSelectionFrame unsupportedRole={unsupportedRole} busy={busy} error={error} onSignOut={async () => {
    setBusy(true); setError('');
    try { await onSignOut(); }
    catch { setError('Could not sign out. Please try again.'); }
    finally { setBusy(false); }
  }}>
    <OrganizationList hidePersonal skipInvitationScreen
      appearance={{ ...organisationAppearance, elements: {
        ...organisationAppearance.elements, rootBox: 'bb-org-clerk-list', header: { display: 'none' },
      } }}
      afterSelectOrganizationUrl="/home" afterCreateOrganizationUrl="/home"
      fallback={<p className="bb-org-loading" role="status">Loading your organisations...</p>} />
  </OrganisationSelectionFrame>;
}

export function OrganisationControl({ name, role }: { name: string; role: string }) {
  return <div className="bb-organisation-control" aria-label="Active organisation">
    <div className="bb-org-workspace"><span className="bb-org-workspace-label">ORGANISATION</span>
      <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/home"
        afterCreateOrganizationUrl="/home" afterLeaveOrganizationUrl="/home"
        appearance={organisationAppearance} organizationProfileProps={{ appearance: organisationAppearance }} />
    </div>
    <span className="bb-org-sr-only">{name}</span>
    <span className="bb-org-role-badge"><span aria-hidden="true" />{role}</span>
  </div>;
}
