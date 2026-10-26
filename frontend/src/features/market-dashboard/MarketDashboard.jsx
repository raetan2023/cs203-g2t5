import React from 'react';
import StoredMarketPanel from './StoredMarketPanel';
import ForecastWidget from '../forecast/ForecastWidget';

// Observed market data and the shared published forecast retain their own dates.
export default function MarketDashboard() {
  return <><StoredMarketPanel /><section className="market-forecast" aria-label="Market forecast"><ForecastWidget /></section></>;
}
