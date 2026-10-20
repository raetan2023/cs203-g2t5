import React from 'react';
import StoredMarketPanel from './StoredMarketPanel';

// This page now reads only imported Supabase observations. Historical scenario
// dates remain available elsewhere in the app; they do not relabel latest prices.
export default function MarketDashboard() {
  return <StoredMarketPanel />;
}
