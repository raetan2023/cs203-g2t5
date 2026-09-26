import React from 'react';

/**
 * Sidebar Navigation Component
 * 
 * Features:
 * - Back/collapse chevron button to close the drawer
 * - Navigation links: Home, Purchase plans, Market dashboard, Recommendation (Coming Soon)
 * - Sign out button at the bottom
 */
export default function Sidebar({ isOpen, onClose, activeNav, setActiveNav }) {
  const navItems = [
    {
      id: 'home',
      label: 'Home',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      )
    },
    {
      id: 'purchase_plans',
      label: 'Purchase plans',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      )
    },
    {
      id: 'market_dashboard',
      label: 'Market dashboard',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18"/>
          <path d="M7 16l4-5 4 3 6-8"/>
        </svg>
      )
    },
    {
      id: 'recommendation',
      label: 'Recommendation',
      disabled: true,
      badge: 'COMING SOON',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6"/>
          <path d="M10 22h4"/>
          <path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 6h8c1.5-1.5 3-3.5 3-6a7 7 0 0 0-7-7z"/>
        </svg>
      )
    }
  ];

  return (
    <aside className={`sidebar-container ${isOpen ? 'open' : ''}`}>
      {/* Header with Close Button (Bunker Buddy and logo removed) */}
      <div className="sidebar-header" style={{ justifyContent: 'flex-end' }}>
        <button
          className="collapse-toggle-btn"
          onClick={onClose}
          title="Close navigation menu"
          aria-label="Close navigation menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="sidebar-nav">
        {navItems.map(item => {
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              className={`sidebar-nav-item ${isActive ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
              onClick={() => {
                if (!item.disabled) {
                  setActiveNav(item.id);
                  if (onClose) onClose();
                }
              }}
              disabled={item.disabled}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.badge && <span className="nav-badge">{item.badge}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer / Sign Out */}
      <div className="sidebar-footer">
        <button
          className="sidebar-signout-btn"
          onClick={() => alert('Signing out...')}
        >
          <span className="signout-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </span>
          <span className="signout-text">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
