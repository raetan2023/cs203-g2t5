// Sample data for market-proposal.html, in the exact shapes the app receives:
//   stored   = GET /api/v1/market/stored   (StoredMarketService.Response)
//   forecast = GET /api/v1/forecast?horizon_days=N, one entry per horizon (apiService.ReadyForecast)
//   plans    = the purchase-plan list, with each plan's recommendation action (recommendations/apiService)
// Latest values, dates, sources and units are from the stored read of 28 Oct 2026. Histories are sample paths that
// end on those values. Sales show the six categories seen on screen (16 are stored). Forecast, plans and organisation
// are sample. Regenerate `stored` from the live backend with: node docs/ui-revamp/market-proposal/snapshot.mjs
(() => {
  const DAY = 86400000;
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  // Weekday observation dates ending on `end`, oldest first.
  const weekdays = (end, n) => {
    const out = []; let t = Date.parse(end + 'T00:00:00Z');
    while (out.length < n) { const d = new Date(t).getUTCDay(); if (d !== 0 && d !== 6) out.unshift(iso(t)); t -= DAY; }
    return out;
  };
  const daily = (end, n) => Array.from({ length: n }, (_, i) => iso(Date.parse(end + 'T00:00:00Z') - (n - 1 - i) * DAY));
  // The ticker's change is computed from the last two stored values, as the backend does.
  const series = (category, seriesKey, label, unit, currency, source, values, dates) => {
    const history = values.map((value, i) => ({ date: dates[i], value }));
    const last = history.at(-1), prev = history.at(-2);
    const changeAbs = prev ? +(last.value - prev.value).toFixed(6) : null;
    const changePct = prev && prev.value !== 0 ? +((changeAbs / prev.value) * 100).toFixed(4) : null;
    return { category, ticker: { seriesKey, label, value: last.value, unit, currency, observedDate: last.date, source,
      valueType: 'OBSERVED', changeAbs, changePct }, history };
  };
  const price = (key, label, unit, currency, source, end, values) =>
    series('prices', key, label, unit, currency, source, values, weekdays(end, values.length));

  const mgo = [1238,1236,1241,1249,1252,1247,1255,1262,1270,1268,1274,1281,1290,1302,1298,1306,1314,1325,1318,1312,1309,1315,1322,1318,1326,1320,1317,1324,1342,1338,1335,1339,1344,1349,1352,1347,1350,1351.5,1351.5];
  const sales = [
    ['LOW_SULPHUR_FUEL_OIL', 'Low Sulphur Fuel Oil', 2218.11], ['MARINE_FUEL_OIL', 'Marine Fuel Oil', 1993.2],
    ['LOW_SULPHUR_MARINE_GAS_OIL', 'Low Sulphur Marine Gas Oil', 378.84], ['BIO_BLENDED_LOW_SULPHUR_FUEL_OIL', 'Bio Blended Low Sulphur Fuel Oil', 76.2],
    ['LNG', 'LNG', 51.51], ['BIO_BLENDED_MARINE_GAS_OIL', 'Bio Blended Marine Gas Oil', 4.33],
  ];
  const stored = {
    storage: 'supabase', fetchedAt: '2026-10-27T17:13:00Z', missing: [],
    series: [
      price('SGP_MGO_OBSERVED', 'Singapore MGO', 'USD/MT', 'USD', 'The Maritime', '2026-10-26', mgo),
      price('SGP_GASOIL_FUT', 'Singapore gasoil futures', 'source-defined', null, 'Investing.com manual export', '2026-10-23',
        [158,159.5,161,160.2,162.8,164,163.1,165.5,167,166.2,168.4,170.1,169.3,171.8,173,172.1,174.4,176,175.2,173.9,172.6,173.8,175.1,174.2,173.38,174.73]),
      price('BRENT_CRUDE', 'Brent crude', 'USD/barrel', 'USD', 'FRED', '2026-10-20',
        [93,89,88,90,90,96,98,100,102,104,106,110,121,118,121,131,128,121,119,116,115,117,120,116,120,114,116,115,136,126,126,126,130,130,130,126,127,127,120,118.82,115.22]),
      price('DUBAI_CRUDE', 'Dubai crude futures', 'source-defined', null, 'Investing.com manual export', '2026-10-23',
        [96,95.2,97.4,99,101.2,103,102.4,105,108.8,107.5,110.2,113.6,112.1,110.9,112.4,114,113.2,111.5,110.8,112.3,113.9,112.6,111.2,110.5,111.68]),
      // FRED's broad dollar index is published weekly here.
      series('prices', 'USD_INDEX', 'Broad USD index', 'index', null, 'FRED',
        [120.10,120.32,120.55,120.41,120.78,120.96,121.12,120.88,121.05,121.31,121.47,121.22,121.38,121.6,121.52,121.575,121.4048],
        Array.from({ length: 17 }, (_, i) => iso(Date.parse('2026-10-16T00:00:00Z') - (16 - i) * 3 * DAY))),
      ...sales.map(([key, label, value]) => series('sales', 'MPA_BUNKER_SALES_' + key, 'Bunker sales: ' + label,
        'thousand tonnes (as published)', null, 'MPA Singapore', [value], ['2026-09-01'])),
      series('news', 'GDELT_ARTICLE_COUNT', 'GDELT daily article count', 'articles', null, 'GDELT',
        [210,232,198,260,281,240,255,300,276,290,318,305,296,318], daily('2026-10-26', 14)),
      series('news', 'GDELT_AVERAGE_TONE', 'GDELT average tone', 'tone', null, 'GDELT',
        [-0.8,-0.95,-1.1,-0.7,-1.2,-1.35,-1.0,-1.25,-1.5,-1.3,-1.4,-1.2,-1.45,-1.3909], daily('2026-10-26', 14)),
    ],
  };

  const mgoHistory = stored.series[0].history.map(({ date, value }) => ({ date, price: value }));
  const interval = { nominal_coverage: null, empirical_coverage: null, evaluation_rows: 0, baseline_coverage: null,
    baseline_mean_width: null, mean_width: null, method: 'experimental_gdelt_scaled_quantiles',
    evaluation_scope: 'Not evaluated.', limitations: 'Experimental range scaled by news coverage. Coverage has not been measured.' };
  const forecastAt = (h, forecast, low, high, drivers) => ({
    status: 'ready', run_id: 'run-2026-10-26-0105', forecast_origin_date: '2026-10-26',
    target_date: iso(Date.parse('2026-10-26T00:00:00Z') + h * DAY), anchor_quote_date: '2026-10-26', anchor_price: 1351.5,
    forecast, low, high, unit: 'USD/metric tonne', horizon_days: h, interval,
    news_window_start: '2026-10-25T00:00:00Z', news_window_end: '2026-10-26T00:00:00Z',
    source_dates: { mgo: '2026-10-26', gasoil: '2026-10-23', brent: '2026-10-20', dubai: '2026-10-23', usd_index: '2026-10-16' },
    model_version: 'ridge-sha256-3f9a0c41d2', published_at: '2026-10-26T01:05:00Z', top_drivers: drivers, history: mgoHistory,
  });
  const forecast = {
    7: forecastAt(7, 1351.5, 1199.58, 1385.55, [{ feature: 'brent_fred_lag1', contribution: -0.42 }, { feature: 'sg_gasoil_investing_ret20', contribution: 0.28 },
      { feature: 'usd_index_lag1', contribution: -0.12 }, { feature: 'mgo_lag_price', contribution: 0.06 }]),
    14: forecastAt(14, 1356, 1150, 1460, [{ feature: 'sg_gasoil_investing_ret20', contribution: 0.34 }, { feature: 'brent_fred_lag1', contribution: -0.3 },
      { feature: 'dubai_crude_investing_lag1', contribution: 0.1 }, { feature: 'usd_index_lag1', contribution: -0.08 }]),
    30: forecastAt(30, 1362, 1080, 1590, [{ feature: 'sg_gasoil_investing_ret20', contribution: 0.38 }, { feature: 'brent_fred_lag1', contribution: -0.21 },
      { feature: 'hsfo_lag1', contribution: 0.12 }, { feature: 'usd_index_lag1', contribution: -0.05 }]),
  };

  window.MARKET_DATA = {
    today: '2026-10-28',
    organisation: { name: 'Straits Marine', role: 'Buyer' },
    access: { can_read_plans: true, can_write_plans: true },
    stored: window.MARKET_SNAPSHOT || stored, forecast,
    plans: [
      { plan_id: 'plan-99', quantity_mt: 99, purchase_deadline: '2026-10-31', days_remaining: 3, action: 'BUY_NOW' },
      { plan_id: 'plan-47', quantity_mt: 47, purchase_deadline: '2026-11-05', days_remaining: 8, action: 'MONITOR' },
    ],
  };
})();
