import './manager-loading.css';

/** Static semantic loading text accompanies decorative, layout-sized placeholders. */
export function ManagerSkeleton({ kind = 'rows' }: { kind?: 'rows' | 'totals' | 'cards' }) {
  return <div aria-hidden="true" className={`pp-manager-skeleton pp-manager-skeleton--${kind}`}>
    {Array.from({ length: kind === 'totals' ? 5 : kind === 'cards' ? 3 : 4 }, (_, row) =>
      <div key={row} className="pp-manager-skeleton-item">
        <span className="pp-shimmer pp-shimmer--label" />
        <span className="pp-shimmer pp-shimmer--value" />
        {kind !== 'totals' && <span className="pp-shimmer pp-shimmer--action" />}
      </div>)}
  </div>;
}

export function ManagerRefreshBar({ label }: { label: string }) {
  return <><div className="pp-refresh-bar" aria-hidden="true"><span /></div><p className="pp-sr-only" role="status">{label}</p></>;
}

export function ManagerPlansLoading() {
  return <section aria-label="Loading organisation plans" aria-busy="true">
    <header className="pp-heading"><div><h1>Organisation purchase plans</h1><p>Loading your team’s plans and approval requests…</p></div></header>
    <p className="pp-sr-only" role="status">Loading organisation purchase plans…</p>
    <section className="pp-card"><h2>Approval inbox</h2><ManagerSkeleton /></section>
    <section className="pp-card pp-manager-loading-overview"><h2>Team oversight</h2><ManagerSkeleton kind="totals" /></section>
    <ManagerSkeleton kind="cards" />
  </section>;
}
