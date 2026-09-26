-- ============================================================================
-- Phase 1: Database Mock Seed Data (Supabase / PostgreSQL)
-- File: database/02_insert_mock_data.sql
-- Role: Populates test records for the scenario date '2025-10-24' so the
--       dashboard has realistic data to display across all UI components.
-- ============================================================================

-- 1. Insert series definitions
INSERT INTO MARKET_SERIES (series_key, label, unit, currency, source, value_type) VALUES
('SGP_MGO_DERIVED',  'Singapore MGO (derived est.)', 'USD/MT',  'USD', 'Derived via Singapore Gasoil Proxy', 'ESTIMATED'),
('SGP_GASOIL_FUT',   'Singapore Gasoil futures',    'USD/bbl', 'USD', 'SGX SG Gasoil (GSD)',               'OBSERVED'),
('BRENT_CRUDE',      'Brent crude',                 'USD/bbl', 'USD', 'ICE Brent Crude',                   'OBSERVED'),
('USD_INDEX',        'USD index',                   NULL,      NULL,  'ICE DXY',                           'OBSERVED');

-- 2. Insert ticker cards snapshot for scenario date 2025-10-24
INSERT INTO MARKET_OBSERVATIONS (series_id, observed_date, value, change_abs, change_pct, scenario_date) VALUES
(1, '2025-10-24', 614.50,  4.20,  0.69, '2025-10-24'),
(2, '2025-10-24',  84.10,  0.85,  1.02, '2025-10-24'),
(3, '2025-10-24',  78.45, -1.20, -1.51, '2025-10-24'),
(4, '2025-10-24', 104.25,  0.12,  0.12, '2025-10-24');

-- 3. Insert historical price observations for MGO derived series (feeds the line chart)
INSERT INTO MARKET_OBSERVATIONS (series_id, observed_date, value, change_abs, change_pct, scenario_date) VALUES
(1, '2025-10-01', 582.00, NULL, NULL, '2025-10-24'),
(1, '2025-10-05', 587.50, NULL, NULL, '2025-10-24'),
(1, '2025-10-10', 591.00, NULL, NULL, '2025-10-24'),
(1, '2025-10-15', 598.00, NULL, NULL, '2025-10-24'),
(1, '2025-10-18', 601.00, NULL, NULL, '2025-10-24'),
(1, '2025-10-21', 607.00, NULL, NULL, '2025-10-24');

-- 4. Insert macroeconomic and regional indicators
INSERT INTO MARKET_INDICATORS (series_key, label, source, observed_date, value, unit, scenario_date) VALUES
('BRENT_DUBAI_SPREAD', 'Brent-Dubai Spread',     'Platts / S&P',      '2025-10-24', 1.82,    '/bbl',  '2025-10-24'),
('GASOIL_10PPM_CRACK', 'Gasoil 10ppm Crack',     'SGX Exchange',      '2025-10-24', 18.45,   '/bbl',  '2025-10-24'),
('MGO_IMPLIED_VOL',    'MGO Implied Volatility', 'Internal Estimate', '2025-10-23', 24.1,    '%',     '2025-10-24'),
('SG_BUNKER_SALES',    'SG Bunker Sales Vol',    'MPA Singapore',     '2025-09-01', 4210000, 'MT',    '2025-10-24');
