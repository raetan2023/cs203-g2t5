import { AppLink } from '../../app/router';

export function HomePage({ displayName }: { displayName: string }) {
  return <main className="bb-home">
    <h1>Welcome back{displayName.trim() ? `, ${displayName.trim()}` : ''}</h1>
    <p>Manage your purchase plan and explore market conditions.</p>
    <AppLink className="bb-button" href="/purchase-plans">Go to purchase plans <span aria-hidden="true">→</span></AppLink>
  </main>;
}
