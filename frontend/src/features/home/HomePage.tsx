import { AppLink } from '../../app/router';

export function HomePage({ displayName, canReadPlans = true }: { displayName: string; canReadPlans?: boolean }) {
  return <main className="bb-home">
    <h1>Welcome back{displayName.trim() ? `, ${displayName.trim()}` : ''}</h1>
    <p>{canReadPlans ? "Manage purchase plans and explore market conditions." : "Manage your organisation’s people and access using the organisation menu."}</p>
    {canReadPlans && <AppLink className="bb-button" href="/purchase-plans">Go to purchase plans <span aria-hidden="true">→</span></AppLink>}
  </main>;
}
