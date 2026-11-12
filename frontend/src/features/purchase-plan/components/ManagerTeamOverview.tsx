import { useRef, useState } from 'react';
import { OfficerFilter } from './OfficerFilter';
import { PurchaseProgress } from './PurchaseProgress';
import { type OverviewPeriod, type PurchasePlanService } from '../types';
import { ErrorBanner } from './Primitives';
import { useManagerRefresh } from '../useManagerRefresh';
import { ManagerRefreshBar, ManagerSkeleton, useRefreshSweep } from './ManagerLoading';
import { formatDate } from '../dates';
import { RefreshIconButton, UpdatedAt } from './UpdatedAt';

const PERIODS: { id: OverviewPeriod; label: string }[] = [{ id: 'all', label: 'All' }, { id: '30d', label: '30 days' }];

export function ManagerTeamOverview({ service }: { service: PurchasePlanService }) {
  const [period, setPeriod] = useState<OverviewPeriod>('all');
  const [officers, setOfficers] = useState<string[]>([]);
  const officerKey = officers.join(',');
  // Filters reload in place: the current figures stay, dimmed, until the new ones arrive.
  // A slower reply for a choice that was just left is discarded.
  const { data, loadedAt, error, loading, refresh } = useManagerRefresh(service, () => service.managerOverview!(period, officers), undefined, `${period}|${officerKey}`);
  // Keep the officer list while the next figures load, so the dropdown does not vanish.
  const team = useRef<NonNullable<typeof data>['officers']>(undefined);
  if (data?.officers) team.current = data.officers;
  const officerOptions = (team.current ?? []).map(officer => ({ id: officer.user_id, label: officer.label, count: officer.plan_count }));
  const refreshing = loading && data !== undefined;
  const sweep = useRefreshSweep(loading);
  const number = (value: number) => value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
  return <section className="pp-card pp-manager-panel" aria-label="Team oversight" aria-busy={loading}>
    <div className="pp-overview-header">
      <div>
        <h2>Team oversight</h2>
        <p className="pp-card-description">Plans from the officers you manage.</p>
        <UpdatedAt loadedAt={loadedAt} current={!loading && !error} />
      </div>
      <div className="pp-overview-controls pp-inbox-controls">
        {officerOptions.length > 0 && <OfficerFilter options={officerOptions} selected={officers} onChange={ids => { sweep.start(); setOfficers(ids); }} />}
        <div className="pp-filter" role="group" aria-label="Time period">
          {PERIODS.map(option => <button type="button" key={option.id} aria-pressed={period === option.id} onClick={() => { if (option.id !== period) { sweep.start(); setPeriod(option.id); } }}>{option.label}</button>)}
        </div>
        <RefreshIconButton label="Refresh team overview" loading={loading} refreshing={refreshing} onClick={() => { sweep.start(); refresh(); }} />
      </div>
    </div>
    {sweep.sweeping && <ManagerRefreshBar label="Updating team exposure…" />}
    {loading && !data ? <><p className="pp-sr-only" role="status">Loading team exposure…</p><ManagerSkeleton kind="totals" /></> : error ? <ErrorBanner>{error}</ErrorBanner> : data && <div className={`pp-refresh-content${refreshing || sweep.sweeping ? ' pp-refresh-content--pending' : ''}`}>
      <dl className="pp-team-totals">
        <div><dt>Total planned volume</dt><dd>{number(data.total_quantity_mt)} MT</dd></div>
        <div><dt>Purchased volume</dt><dd>{number(data.purchased_quantity_mt)} MT</dd>
          {!!data.purchase_difference_mt && <p className="pp-figure-note">{number(Math.abs(data.purchase_difference_mt))} MT {data.purchase_difference_mt < 0 ? 'less' : 'more'} than planned</p>}</div>
        <div><dt>Remaining to buy</dt><dd>{number(data.open_quantity_mt)} MT</dd></div>
        <div><dt>Estimated remaining cost</dt><dd>{data.exposure_usd === null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.exposure_usd)}</dd></div>
      </dl>
      <PurchaseProgress purchased={data.purchased_quantity_mt} remaining={data.open_quantity_mt} shortfall={Math.max(0, -(data.purchase_difference_mt ?? 0))} />
      <p className="pp-card-description">{data.reference_date && data.reference_price_usd_per_mt !== null
        ? `Estimated remaining cost = Remaining to buy × Singapore MGO price (USD ${number(data.reference_price_usd_per_mt)}/MT on ${formatDate(data.reference_date)})`
        : 'Estimated remaining cost = Remaining to buy × Singapore MGO price. No price is available yet.'}</p>
    </div>}
  </section>;
}
