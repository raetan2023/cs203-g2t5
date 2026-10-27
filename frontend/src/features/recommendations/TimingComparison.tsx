import { useEffect, useState } from 'react';
import type { Forecast, ForecastService, Horizon, ReadyForecast } from '../forecast/apiService';
import { formatDate } from '../purchase-plan/dates';

const horizons = [7, 14, 30] as const;
const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
type Entry = { horizon: Horizon; forecast?: ReadyForecast; message?: string };

/** Read every horizon as a group; never combine forecasts from different snapshots. */
export function TimingComparison({ service, today, deadline, revision, selectedRun, selectedHorizon, refresh, select }: {
  service: ForecastService; today: string; deadline: string; revision?: string; selectedRun?: string; selectedHorizon?: Horizon; refresh?(): void;
  select(horizon: Horizon): void;
}) {
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState<{ service: ForecastService; today: string; revision?: string; attempt: number; entries: Entry[] }>();
  useEffect(() => {
    let active = true;
    Promise.allSettled(horizons.map(h => service.read(h))).then(results => {
      if (!active) return;
      const entries: Entry[] = results.map((r, i) => {
        const value: Forecast | undefined = r.status === 'fulfilled' ? r.value : undefined;
        return { horizon: horizons[i], ...(value?.status === 'ready' ? { forecast: value }
          : { message: value?.status === 'unavailable' ? value.message : 'Could not load this estimate.' }) };
      });
      const runs = new Set(entries.flatMap(e => e.forecast ? [e.forecast.run_id] : []));
      setResult({ service, today, revision, attempt, entries: runs.size > 1
        ? entries.map(e => ({ horizon: e.horizon, message: 'Source data changed. Refresh the comparison.' })) : entries });
    });
    return () => { active = false; };
  }, [service, today, revision, attempt]);
  const currentEntries = result?.service === service && result.today === today && result.revision === revision && result.attempt === attempt ? result.entries : undefined;
  const entries: Entry[] | undefined = currentEntries && selectedRun && currentEntries.some(e => e.forecast && e.forecast.run_id !== selectedRun)
    ? currentEntries.map(e => ({ horizon: e.horizon, message: 'Source data changed. Refresh the comparison.' })) : currentEntries;
  const points = entries?.filter((e): e is Entry & { forecast: ReadyForecast } => !!e.forecast) ?? [];
  const min = points.length ? Math.min(...points.flatMap(e => [e.forecast.low, e.forecast.forecast])) * .96 : 0;
  const max = points.length ? Math.max(...points.flatMap(e => [e.forecast.high, e.forecast.forecast])) * 1.04 : 1;
  const y = (price: number) => 235 - (price - min) / Math.max(max - min, 1) * 190;
  const x = (h: Horizon) => 135 + horizons.indexOf(h) * 220;
  return <section className="timing-comparison" aria-label="Compare purchase timing" aria-busy={!entries}>
    <div className="timing-heading"><div><p className="rec-eyebrow">Compare model horizons</p><h2>MGO price forecasts</h2><p>All forecasts remain visible. Only targets on or before your deadline are eligible for the final recommendation.</p></div>
      <button className="bb-button" onClick={() => { refresh?.(); retry(n => n + 1); }}>Refresh comparison</button></div>
    {entries && <>
      {points[0] && <p className="timing-reference"><strong>Buy today: USD {money(points[0].forecast.anchor_price)}/MT</strong> · {deadline < today ? 'Deadline passed' : 'Eligible'}<br />Reference observed {formatDate(points[0].forecast.anchor_quote_date)}; confirm a current supplier quote.</p>}
      <div className="timing-options">{entries.map(e => <button key={e.horizon} className={`timing-option ${selectedHorizon === e.horizon ? 'timing-selected' : ''}`} aria-pressed={selectedHorizon === e.horizon} disabled={!e.forecast || e.forecast.target_date <= today || e.forecast.target_date > deadline} onClick={() => select(e.horizon)}>
        <span className="timing-option-heading"><span className="rec-eyebrow">{e.horizon} days </span>{selectedHorizon === e.horizon && <> <span className="timing-selection">Selected</span></>}</span>
        {e.forecast ? <><strong>USD {money(e.forecast.forecast)}<small>/MT</small></strong><span>{money(e.forecast.low)}–{money(e.forecast.high)} uncertainty</span><span>Target {formatDate(e.forecast.target_date)}</span>{e.forecast.target_date > deadline ? <span>Too late · After your deadline</span> : e.forecast.target_date <= today ? <span>Past target</span> : <span>Eligible</span>}</> : <><strong>Unavailable</strong><span>Model status: {e.message}</span></>}
      </button>)}</div>
      <details className="rec-forecast timing-chart-disclosure"><summary>View price ranges chart</summary>
      <div className="timing-legend"><span><i /> Central price</span><span><i className="timing-band-key" /> Experimental uncertainty range</span><span>USD / MT</span></div>
      <div className="timing-chart-scroll" role="region" aria-label="Price ranges chart, scroll horizontally on small screens" tabIndex={0}><svg className="timing-chart" viewBox="0 0 700 295" role="img" aria-label="Central MGO price and experimental lower and upper bounds for 7, 14 and 30 day model horizons">
        {[0, 1, 2, 3, 4].map(i => { const price = min + (max - min) * i / 4; return <g key={i}><line x1="75" x2="665" y1={y(price)} y2={y(price)} stroke="#284052" strokeDasharray="4 6" /><text x="62" y={y(price) + 4} textAnchor="end" fill="#92a8bc" fontSize="12">{points.length ? money(price) : '—'}</text></g>; })}
        {horizons.map(h => { const f = entries.find(e => e.horizon === h)?.forecast; return <g key={h}>
          <text x={x(h)} y="270" textAnchor="middle" fill="#e4edf5" fontSize="14">{h} days</text>
          {f ? <><title>{h} days: central USD {money(f.forecast)}, range {money(f.low)} to {money(f.high)}, target {f.target_date}</title>
            <rect x={x(h) - 34} width="68" y={y(f.high)} height={Math.max(2, y(f.low) - y(f.high))} rx="14" fill="#2dd4bf" fillOpacity=".13" />
            <line x1={x(h)} x2={x(h)} y1={y(f.low)} y2={y(f.high)} stroke="#5eead4" strokeWidth="3" />
            {[f.low, f.high].map((p, i) => <line key={i} x1={x(h) - 14} x2={x(h) + 14} y1={y(p)} y2={y(p)} stroke="#5eead4" strokeWidth="3" />)}
            <circle cx={x(h)} cy={y(f.forecast)} r="7" fill="#e4fff9" stroke="#113c3b" strokeWidth="3" />
          </> : <text x={x(h)} y="145" textAnchor="middle" fill="#91a4ba" fontSize="13">Unavailable</text>}
        </g>; })}
      </svg></div>
      </details>
      <p className="timing-footnote">Horizons run from the model’s observed quote. Exact target dates appear above. Experimental bounds have no measured confidence coverage.</p>
    </>}
  </section>;
}
