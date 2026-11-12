/**
 * How much of the approved volume has been bought: a tall two-part bar (bought, then still to buy)
 * with a percentage headline. It redraws, with a short slide, whenever the figures change.
 */
export function PurchaseProgress({ purchased, remaining, shortfall = 0 }: { purchased: number; remaining: number; shortfall?: number }) {
  // The headline counts what was bought or is still to buy; the bar also shows approved volume that was never bought.
  const active = purchased + remaining;
  const whole = active + shortfall;
  if (!(whole > 0)) return <p className="pp-card-description pp-progress-empty">No approved volume yet, so there is nothing to track.</p>;
  const mt = (value: number) => `${value.toLocaleString('en-GB', { maximumFractionDigits: 2 })} MT`;
  const share = (value: number) => Math.round((value / whole) * 100);
  const purchasedShare = active > 0 ? Math.round((purchased / active) * 100) : 0;
  const parts = [
    { key: 'purchased', name: 'Purchased', value: purchased },
    { key: 'remaining', name: 'Remaining to buy', value: remaining },
    { key: 'shortfall', name: 'Not bought', value: shortfall },
  ];
  const summary = `${purchasedShare}% purchased: ${mt(purchased)} bought, ${mt(remaining)} remaining to buy${shortfall > 0 ? `, ${mt(shortfall)} approved but not bought` : ''}.`;
  return <figure className="pp-progress">
    <figcaption className="pp-progress-head">
      <span className="pp-progress-title">Purchase progress</span>
      <span className="pp-progress-share"><strong>{purchasedShare}%</strong> purchased</span>
    </figcaption>
    <div className="pp-progress-bar" role="img" aria-label={summary}>
      {parts.map(part => part.value > 0 && <div key={part.key} className={`pp-progress-part pp-progress-part--${part.key}`}
        style={{ width: `${(part.value / whole) * 100}%` }} tabIndex={0} aria-label={`${part.name}: ${mt(part.value)}, ${share(part.value)}%`}>
        {/* A block too narrow for its label prints none; hover and the figures above still give the amount. */}
        {part.value / whole >= 0.14 && <span className="pp-progress-label" aria-hidden="true">{mt(part.value)}</span>}
        <span className="pp-progress-tip" role="tooltip" aria-hidden="true"><strong>{part.name}</strong>{part.key === 'shortfall' ? `${mt(part.value)} less than planned` : `${mt(part.value)} · ${share(part.value)}%`}</span>
      </div>)}
    </div>
    <ul className="pp-progress-legend" aria-hidden="true">
      {parts.filter(part => part.key !== 'shortfall' || part.value > 0).map(part => <li key={part.key}><span className={`pp-progress-swatch pp-progress-swatch--${part.key}`} />{part.name}</li>)}
    </ul>
  </figure>;
}
