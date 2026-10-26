import React from 'react';
import StoredMarketPanel from './StoredMarketPanel';
import { ForecastWidget } from '../forecast';

export default function MarketDashboard() {
  return (
    <>
      <StoredMarketPanel />
      <div style={{ maxWidth: 1560, margin: '0 auto', padding: '8px 40px 48px' }}>
        <ForecastWidget />
      </div>
    </>
  );
}