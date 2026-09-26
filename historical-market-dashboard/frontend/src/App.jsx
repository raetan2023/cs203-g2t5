import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import MarketDashboard from './pages/MarketDashboard';
import './styles/dashboard.css';

/**
 * Bunker Buddy Application
 * Implements Anjali's historical market context feature.
 * Integrates the shared navigation drawer (implemented in Sidebar.jsx) via
 * the top navigation bar hamburger icon shown on the UI mockup.
 */
export default function App() {
  const [navOpen, setNavOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('market_dashboard');

  return (
    <div className="app-layout">
      {/* Backdrop overlay for slide-out navigation menu */}
      <div
        className={`sidebar-overlay ${navOpen ? 'open' : ''}`}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      {/* Navigation Drawer integrated from separate file (Sidebar.jsx) */}
      <Sidebar
        isOpen={navOpen}
        onClose={() => setNavOpen(false)}
        activeNav={activeNav}
        setActiveNav={(id) => {
          setActiveNav(id);
          setNavOpen(false);
        }}
      />

      {/* Main Historical Market Dashboard matching UI mockup shown */}
      <MarketDashboard onToggleNav={() => setNavOpen(prev => !prev)} />
    </div>
  );
}
