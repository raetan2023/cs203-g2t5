import { useEffect, useState } from 'react';
import { formatDateTime } from '../dates';
import { Icon } from './Primitives';

/** Figures older than this may have missed a team change. */
export const FRESH_FOR_MS = 60_000;

/** "Updated as of …" with a green dot while fresh and a white dot once a minute has passed. */
export function UpdatedAt({ loadedAt, current }: { loadedAt?: Date; current: boolean }) {
  // Re-check every 5 seconds so the dot turns white soon after a minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 5_000); return () => window.clearInterval(timer); }, []);
  if (!loadedAt) return null;
  const fresh = current && now - loadedAt.getTime() < FRESH_FOR_MS;
  return <p className="pp-card-description pp-updated">
    <span className={`pp-updated-dot${fresh ? ' pp-updated-dot--fresh' : ''}`} aria-hidden="true" />
    <span><span className="pp-sr-only">{fresh ? 'Up to date. ' : 'May be out of date. '}</span>Updated as of <strong>{formatDateTime(loadedAt)}</strong></span>
  </p>;
}

export function RefreshIconButton({ label, loading, refreshing, onClick }: { label: string; loading: boolean; refreshing: boolean; onClick: () => void }) {
  return <button type="button" className={`pp-icon-button${refreshing ? ' is-refreshing' : ''}`} aria-label={label} title={label} disabled={loading} onClick={onClick}><Icon name="refresh" /></button>;
}
