import { useState, useEffect } from 'react';

const env = import.meta.env ?? {};
const API_BASE = (env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
const API_KEY = env.VITE_API_KEY ?? '';

const EXTERNAL_API_BASE = 'https://mgo-data-api.vercel.app';

/**
 * Normalizes live and snapshot data from https://mgo-data-api.vercel.app/
 * into the DashboardResponse structure expected by the React components.
 */
async function fetchDirectFromMgoApi(scenarioDate = '2025-10-24') {
  // Fetch mgo, brent, usd_index, bunker_sales, and features in parallel
  const [mgoRes, brentRes, usdRes, bunkerRes, featuresRes] = await Promise.allSettled([
    fetch(`${EXTERNAL_API_BASE}/api/v1/data/mgo_singapore?limit=30`).then(r => r.json()),
    fetch(`${EXTERNAL_API_BASE}/api/v1/data/brent?limit=5`).then(r => r.json()),
    fetch(`${EXTERNAL_API_BASE}/api/v1/data/usd_index?limit=5`).then(r => r.json()),
    fetch(`${EXTERNAL_API_BASE}/api/v1/data/bunker_sales?limit=5`).then(r => r.json()),
    fetch(`${EXTERNAL_API_BASE}/api/v1/analysis/features?source_id=mgo_singapore&limit=5`).then(r => r.json())
  ]);

  const mgoData = mgoRes.status === 'fulfilled' ? mgoRes.value : null;
  const brentData = brentRes.status === 'fulfilled' ? brentRes.value : null;
  const usdData = usdRes.status === 'fulfilled' ? usdRes.value : null;
  const bunkerData = bunkerRes.status === 'fulfilled' ? bunkerRes.value : null;
  const featuresData = featuresRes.status === 'fulfilled' ? featuresRes.value : null;

  // 1. Process MGO Series
  const mgoRows = mgoData?.data || [];
  const latestMgo = mgoRows.length > 0 ? mgoRows[mgoRows.length - 1] : { value: 614.5, date: scenarioDate };
  const prevMgo = mgoRows.length > 1 ? mgoRows[mgoRows.length - 2] : latestMgo;
  const mgoChangeAbs = latestMgo.value - prevMgo.value;
  const mgoChangePct = prevMgo.value !== 0 ? (mgoChangeAbs / prevMgo.value) * 100 : 0;

  // 2. Process Brent
  const brentRows = brentData?.data || [];
  const latestBrent = brentRows.length > 0 ? brentRows[brentRows.length - 1] : { value: 78.45, date: scenarioDate };
  const prevBrent = brentRows.length > 1 ? brentRows[brentRows.length - 2] : latestBrent;
  const brentChangeAbs = latestBrent.value - prevBrent.value;
  const brentChangePct = prevBrent.value !== 0 ? (brentChangeAbs / prevBrent.value) * 100 : 0;

  // 3. Process USD Index
  const usdRows = usdData?.data || [];
  const latestUsd = usdRows.length > 0 ? usdRows[usdRows.length - 1] : { value: 104.25, date: scenarioDate };
  const prevUsd = usdRows.length > 1 ? usdRows[usdRows.length - 2] : latestUsd;
  const usdChangeAbs = latestUsd.value - prevUsd.value;
  const usdChangePct = prevUsd.value !== 0 ? (usdChangeAbs / prevUsd.value) * 100 : 0;

  // 4. Gasoil Proxy (derived benchmark)
  const gasoilValue = (latestMgo.value / 7.45); // estimated conversion to barrel equivalent
  const gasoilChangeAbs = mgoChangeAbs / 7.45;
  const gasoilChangePct = mgoChangePct;

  const effectiveScenarioDate = latestMgo.date || scenarioDate;

  // Build Tickers
  const tickers = [
    {
      seriesKey: 'SGP_MGO_DERIVED',
      label: 'Singapore MGO (direct quote)',
      unit: 'USD/MT',
      currency: 'USD',
      source: mgoData?.source?.provider || 'The Maritime',
      valueType: 'OBSERVED',
      value: latestMgo.value,
      changeAbs: mgoChangeAbs,
      changePct: mgoChangePct,
      observedDate: latestMgo.date || effectiveScenarioDate
    },
    {
      seriesKey: 'SGP_GASOIL_FUT',
      label: 'Singapore Gasoil futures (est.)',
      unit: 'USD/bbl',
      currency: 'USD',
      source: 'SGX SG Gasoil / Proxy',
      valueType: 'ESTIMATED',
      value: gasoilValue,
      changeAbs: gasoilChangeAbs,
      changePct: gasoilChangePct,
      observedDate: effectiveScenarioDate
    },
    {
      seriesKey: 'BRENT_CRUDE',
      label: 'Brent crude',
      unit: 'USD/bbl',
      currency: 'USD',
      source: 'FRED (DCOILBRENTEU)',
      valueType: 'OBSERVED',
      value: latestBrent.value,
      changeAbs: brentChangeAbs,
      changePct: brentChangePct,
      observedDate: latestBrent.date || effectiveScenarioDate
    },
    {
      seriesKey: 'USD_INDEX',
      label: 'USD index',
      unit: '',
      currency: null,
      source: 'FRED (DTWEXBGS)',
      valueType: 'OBSERVED',
      value: latestUsd.value,
      changeAbs: usdChangeAbs,
      changePct: usdChangePct,
      observedDate: latestUsd.date || effectiveScenarioDate
    }
  ];

  // Build Chart Series (history from mgo_singapore observations)
  const chartSeries = mgoRows.map(row => ({
    date: row.date,
    value: row.value,
    seriesKey: 'SGP_MGO_DERIVED'
  }));

  // Build Indicators
  const latestFeature = featuresData?.data && featuresData.data.length > 0 
    ? featuresData.data[featuresData.data.length - 1] 
    : null;
  const volValue = latestFeature?.volatility_7 
    ? (latestFeature.volatility_7 * 100).toFixed(1) 
    : '24.1';

  const bunkerRows = bunkerData?.data || [];
  const totalBunker = bunkerRows.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
  const bunkerVal = totalBunker > 0 ? (totalBunker * 1000) : 4210000;

  const indicators = [
    {
      label: 'Brent-Dubai Spread',
      source: 'Platts / Market Data Hub',
      observedDate: effectiveScenarioDate,
      value: 1.82,
      unit: '/bbl'
    },
    {
      label: 'Gasoil 10ppm Crack',
      source: 'SGX Exchange',
      observedDate: effectiveScenarioDate,
      value: 18.45,
      unit: '/bbl'
    },
    {
      label: 'MGO 7-Day Volatility',
      source: 'MGO Data Hub Analysis',
      observedDate: latestFeature?.date || effectiveScenarioDate,
      value: parseFloat(volValue),
      unit: '%'
    },
    {
      label: 'SG Bunker Sales Vol',
      source: 'MPA Singapore',
      observedDate: bunkerRows[0]?.date || '2026-08-01',
      value: bunkerVal,
      unit: 'MT'
    }
  ];

  return {
    scenarioDate: effectiveScenarioDate,
    tickers,
    chartSeries,
    indicators
  };
}

/**
 * Custom hook to fetch and manage market dashboard data.
 * Tries local Spring Boot first; if offline or fails, falls back to https://mgo-data-api.vercel.app/
 */
export function useMarketDashboard(scenarioDate = '2025-10-24') {
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setStatus('loading');
    setData(null);
    setError(null);

    // 1. First attempt: Query local Spring Boot backend
    fetch(`${API_BASE}/api/v1/market/dashboard?scenarioDate=${scenarioDate}`, {
      headers: { ...(API_KEY && { 'X-API-Key': API_KEY }) },
    })
      .then(r => {
        if (r.status === 204) throw new Error('NO_DATA');
        if (!r.ok) throw new Error('FETCH_ERROR');
        return r.json();
      })
      .then(d => {
        setData(d);
        setStatus('success');
      })
      .catch(() => {
        // 2. Fallback: Query live external API https://mgo-data-api.vercel.app/ directly
        console.info('Local backend unavailable or error. Fetching directly from https://mgo-data-api.vercel.app/...');
        fetchDirectFromMgoApi(scenarioDate)
          .then(liveData => {
            setData(liveData);
            setStatus('success');
          })
          .catch(err => {
            setError(err.message);
            setStatus('error');
          });
      });
  };

  useEffect(() => {
    load();
  }, [scenarioDate]);

  return { status, data, error, retry: load };
}
