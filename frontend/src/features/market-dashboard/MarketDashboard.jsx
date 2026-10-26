import React from 'react';
import StoredMarketPanel from './StoredMarketPanel';
import { ForecastWidget } from '../forecast';

// Observed market data and the shared published forecast retain their own dates.
export default function MarketDashboard() {
  return (
    <>
      <StoredMarketPanel />
      <section className="market-forecast" aria-label="Market forecast" style={{ maxWidth: 1560, margin: '0 auto', padding: '8px 40px 48px' }}>
        <ForecastWidget />
      </section>
    </>
  );
}
