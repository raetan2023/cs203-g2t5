import React from 'react';
import '../styles/dashboard.css';
import { useMarketDashboard } from '../hooks/useMarketDashboard';
import TickerCards from '../components/TickerCards';
import MGOChart from '../components/MGOChart';
import IndicatorsTable from '../components/IndicatorsTable';

function formatScenarioDateBadge(dateStr) {
  if (!dateStr) return 'OCT 24, 2025';
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
    }
  } catch (e) {}
  return dateStr.toUpperCase();
}

/**
 * MarketDashboard Page Component (Anjali's Historical Market Dashboard)
 * Matches the Bunker Buddy UI mockup with:
 * - Top navigation bar featuring hamburger icon, anchor brand, and historical view badge
 * - 4 Ticker Cards (Singapore MGO, Gasoil futures, Brent crude, USD index)
 * - MGO History & Forecast Line Chart
 * - Selected Indicators Table
 */
export default function MarketDashboard({ onToggleNav }) {
  const { status, data, error, retry } = useMarketDashboard();

  // Loading state
  if (status === 'loading') {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p style={{ color: '#8b949e' }}>Loading historical market dashboard...</p>
      </div>
    );
  }

  // Error state
  if (status === 'error' && error !== 'NO_DATA') {
    return (
      <div className="center-screen">
        <div className="error-icon">!</div>
        <h2>Failed to load dashboard</h2>
        <p style={{ color: '#8b949e', maxWidth: 280 }}>
          We couldn't fetch the latest market data. Please check your connection and try again.
        </p>
        <button className="retry" onClick={retry}>Retry</button>
      </div>
    );
  }

  // No data / empty state
  if (!data || !data.tickers || data.tickers.length === 0) {
    return (
      <div className="center-screen">
        <p style={{ color: '#8b949e' }}>No market data available for this scenario date.</p>
      </div>
    );
  }

  const badgeDate = formatScenarioDateBadge(data.scenarioDate);

  // Success state matching UI mockup
  return (
    <div className="dashboard-container">
      {/* Top Bar with hamburger icon and historical scenario pill */}
      <header className="top-navbar">
        <div className="navbar-left">
          <button
            className="hamburger-btn"
            onClick={onToggleNav}
            aria-label="Toggle navigation menu"
            title="Open navigation menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00d4c8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        <div className="scenario-badge">
          HISTORICAL VIEW · AS OF {badgeDate}
        </div>
      </header>

      {/* Main Historical Dashboard Area */}
      <main className="dashboard-content">
        <TickerCards tickers={data.tickers} />
        <MGOChart chartSeries={data.chartSeries} scenarioDate={data.scenarioDate} />
        <IndicatorsTable indicators={data.indicators} />
      </main>
    </div>
  );
}
