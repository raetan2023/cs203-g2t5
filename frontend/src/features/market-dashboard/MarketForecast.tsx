import { useEffect, useState } from 'react';
import type { Forecast, Horizon, ReadyForecast } from '../forecast/apiService';
import { useForecastContext } from '../forecast/ForecastContext';
import { deriveDirection } from '../forecast/utils';
import { amount, perMt } from '../recommendations/format';
import { ageLabel, daysOld, fullDate, shortDate } from './format';
import { Symbol } from './StoredMarketPanel';

const HORIZONS: Horizon[] = [7, 14, 30];
type HorizonResult = { horizon: Horizon; forecast?: Forecast; error?: string };

/** All three horizons through the provider's shared reads, so a refresh or new run updates them together. */
function useHorizonForecasts() {
  const { service, refreshKey } = useForecastContext();
  const [results, setResults] = useState<HorizonResult[]>();
  useEffect(() => {
    if (!service) return;
    let active = true;
    Promise.allSettled(HORIZONS.map(horizon => service.read(horizon))).then(settled => {
      if (active) setResults(settled.map((result, index) => result.status === 'fulfilled'
        ? { horizon: HORIZONS[index], forecast: result.value }
        : { horizon: HORIZONS[index], error: result.reason instanceof Error ? result.reason.message : 'Could not load the forecast.' }));
    });
    return () => { active = false; };
  }, [service, refreshKey]);
  return results;
}

function QuoteTile({ anchor, date, age }: { anchor: number; date: string; age: number }) {
  return <li className="mf-tile">
    <div className="mf-tile-head"><strong>Latest quote</strong><span>{shortDate(date)}</span></div>
    <div className="mf-figure"><span className="mf-value">${perMt(anchor)}</span></div>
    <span className="mf-detail">Observed · {ageLabel(age)}</span>
  </li>;
}

function HorizonTile({ forecast }: { forecast: ReadyForecast }) {
  const direction = deriveDirection(forecast.forecast, forecast.anchor_price);
  const percent = Math.abs((forecast.forecast - forecast.anchor_price) / forecast.anchor_price * 100).toFixed(1);
  return <li className="mf-tile">
    <div className="mf-tile-head"><strong>{forecast.horizon_days} days</strong><span>{shortDate(forecast.target_date)}</span></div>
    <div className="mf-figure">
      <span className="mf-value">${perMt(forecast.forecast)}</span>
      <span className={`mf-change sm-${direction === 'flat' ? 'neutral' : direction}`}>
        <span aria-hidden="true">{direction === 'up' ? '↑' : direction === 'down' ? '↓' : '—'}</span> {percent}%
        <span className="sm-sr-only">{direction === 'up' ? ' dearer than the latest quote' : direction === 'down' ? ' cheaper than the latest quote' : ' change from the latest quote'}</span>
      </span>
    </div>
    <span className="mf-detail">Range ${amount(forecast.low)} – {amount(forecast.high)}</span>
  </li>;
}

function UnavailableTile({ result }: { result: HorizonResult }) {
  return <li className="mf-tile">
    <div className="mf-tile-head"><strong>{result.horizon} days</strong></div>
    <span className="mf-value mf-value-missing">Unavailable</span>
    <span className="mf-detail">{result.forecast?.status === 'unavailable' ? result.forecast.message : result.error}</span>
  </li>;
}

/** Four steps from inputs to range. Worded from what the served forecast reports; nothing is recalculated. */
function ForecastSteps({ forecasts, age }: { forecasts: ReadyForecast[]; age: number }) {
  const [first] = forecasts;
  const newsDay = first.source_dates.gdelt ?? first.news_window_start.slice(0, 10);
  const measured = first.interval.nominal_coverage != null;
  const experimental = first.interval.method === 'experimental_gdelt_scaled_quantiles';
  return <section className="mf-steps" aria-labelledby="mf-steps-title">
    <div><h3 id="mf-steps-title">How this forecast was made</h3><p>Four steps from market data to price range.</p></div>
    <ol>
      <li><span className="mf-step-label">1 · Latest quote</span><strong>USD {perMt(first.anchor_price)}/MT</strong>
        <span>The last observed MGO price, from {shortDate(first.anchor_quote_date)}, now {ageLabel(age)}.</span></li>
      <li><span className="mf-step-label">2 · News signal</span><strong>GDELT {shortDate(newsDay)}</strong><span>Synthesise world news and obtain overall market signal.</span></li>
      <li><span className="mf-step-label">3 · Central estimate</span><strong>{first.model_version.startsWith('ridge-') ? 'Ridge regression' : first.model_version}</strong>
        <span>The model gives one price for each of the {forecasts.length === 1 ? 'available horizon' : `${forecasts.length} horizons`}, from the quote, related markets and news.</span></li>
      <li><span className="mf-step-label">4 · Price range</span>
        <strong>{measured ? `${Math.round(first.interval.nominal_coverage! * 100)}% target range` : 'Experimental range'}</strong>
        <span>{experimental ? 'Past forecast errors set each range, and unusually heavy or strongly toned news widens it. Coverage isn’t measured.'
          : 'Past forecast errors set each range around the central estimate.'}</span></li>
    </ol>
  </section>;
}

function ForecastMessage({ title, detail, alert, retry }: { title: string; detail?: string; alert?: boolean; retry?: () => void }) {
  return <div className="mf-message" role={alert ? 'alert' : 'status'}>
    <strong>{title}</strong>{detail && <p>{detail}</p>}
    {retry && <button type="button" className="sm-text-button" onClick={retry}>Retry forecast</button>}
  </div>;
}

export function MarketForecast({ today }: { today: string }) {
  const { connected, retry } = useForecastContext();
  const results = useHorizonForecasts();
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { setRefreshing(false); }, [results]);
  const forecasts = (results ?? []).flatMap(result => result.forecast?.status === 'ready' ? [result.forecast] : []);
  const first = forecasts[0];
  const age = first ? daysOld(first.anchor_quote_date, today) : 0;
  const failed = results?.find(result => result.forecast?.status !== 'ready');
  const lastRun = results?.flatMap(result => result.forecast?.status === 'unavailable' && result.forecast.last_successful_run ? [result.forecast.last_successful_run] : [])[0];
  const refresh = () => { setRefreshing(true); retry(); };

  return <section className="sm-panel mf" aria-label="MGO price forecast">
    <div className="mf-header">
      <div className="mf-intro">
        <div className="mf-title"><h2>MGO price forecast</h2>
          {first && <span className="sm-chip">{first.synthetic ? 'Synthetic preview' : first.forecast_origin_date === today ? 'Updated today' : `Updated ${shortDate(first.forecast_origin_date)}`}</span>}</div>
        {first ? <p>From the latest quote of USD {perMt(first.anchor_price)}/MT on {shortDate(first.anchor_quote_date)}. Each horizon is a separate estimate with its own range.</p>
          : <p>Experimental forecast from market and news signals. Purchasing outcomes are uncertain.</p>}
      </div>
      {first && <button type="button" className="bb-button bb-button--secondary sm-refresh" onClick={refresh} disabled={refreshing} aria-label="Refresh forecast" aria-busy={refreshing}>
        <Symbol name="refresh" className={refreshing ? 'sm-spinning' : ''} />{refreshing ? 'Checking…' : 'Refresh forecast'}
      </button>}
    </div>

    {!connected ? <ForecastMessage title="Forecast unavailable" detail="The forecast service is not connected." />
      : !results ? <ForecastMessage title="Loading forecast…" />
        : !first ? <ForecastMessage alert={Boolean(failed?.error)} title="Forecast unavailable" retry={retry}
          detail={[failed?.forecast?.status === 'unavailable' ? failed.forecast.message : failed?.error,
            lastRun && `Last successful forecast: ${fullDate(lastRun.origin_date)}. It is not shown as a current forecast.`].filter(Boolean).join(' ')} />
          : <>
            <ul className="mf-tiles" aria-label="Forecast by horizon">
              <QuoteTile anchor={first.anchor_price} date={first.anchor_quote_date} age={age} />
              {results.map(result => result.forecast?.status === 'ready'
                ? <HorizonTile key={result.horizon} forecast={result.forecast} />
                : <UnavailableTile key={result.horizon} result={result} />)}
            </ul>
            <div className="mf-footnote">
              {first.interval.nominal_coverage == null ? <span>Experimental ranges, coverage not measured.</span> : <span />}
              <span>Ran {shortDate(first.forecast_origin_date)} · {first.model_version.startsWith('ridge-') ? 'Ridge regression' : first.model_version}</span>
            </div>
            <ForecastSteps forecasts={forecasts} age={age} />
          </>}
  </section>;
}
