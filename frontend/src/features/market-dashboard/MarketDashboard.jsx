import React from 'react';
import StoredMarketPanel from './StoredMarketPanel';
import { MarketForecast } from './MarketForecast';
import { singaporeToday } from './format';

// Observed market data and the shared published forecast retain their own dates.
export default function MarketDashboard({ scenarioDate, canCreatePlan = false }) {
  const today = scenarioDate || singaporeToday();
  return <StoredMarketPanel today={today} forecast={<MarketForecast today={today} canCreatePlan={canCreatePlan} />} />;
}
