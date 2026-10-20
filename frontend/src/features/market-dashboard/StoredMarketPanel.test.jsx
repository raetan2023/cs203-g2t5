import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StoredMarketPanel from './StoredMarketPanel';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div>{children}</div>,
  CartesianGrid: () => null, Line: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));

const series = (key, label, category, value, unit, date, currency = null) => ({
  category, ticker: { seriesKey: key, label, value, unit, observedDate: date, currency,
    source: 'Provider', valueType: 'OBSERVED', changeAbs: null, changePct: null },
  history: [{ date, value }],
});
function serve(rows, missing = []) {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200,
    json: async () => ({ storage: 'supabase', fetchedAt: '2026-10-20T05:00:00Z', series: rows, missing }) });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

describe('stored market dashboard', () => {
  it('reads only the database route and shows missing series instead of proxy prices', async () => {
    const fetcher = serve([series('BRENT_CRUDE', 'Brent crude', 'prices', 126.55, 'USD/barrel', '2026-10-14', 'USD')], ['Singapore MGO']);
    render(<StoredMarketPanel />);
    expect(await screen.findByText('Not yet stored:')).toBeInTheDocument();
    expect(screen.getByText(/Singapore MGO\. No example prices/)).toBeInTheDocument();
    expect(fetcher.mock.calls[0][0]).toMatch(/\/api\/v1\/market\/stored$/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/614.50/)).not.toBeInTheDocument();
  });

  it('preserves unknown futures units and does not label the value as dollars', async () => {
    serve([series('SGP_GASOIL_FUT', 'Singapore gasoil futures', 'prices', 171.08, 'source-defined', '2026-10-16')]);
    render(<StoredMarketPanel />);
    expect(await screen.findByText(/Physical unit and contract definition/)).toBeInTheDocument();
    expect(screen.queryByText('$171.08')).not.toBeInTheDocument();
  });

  it('retains zero sales in published units and explains monthly date labels', async () => {
    serve([series('MPA_BUNKER_SALES_MGO', 'Bunker sales: MGO', 'sales', 0, 'thousand tonnes', '2026-08-01')]);
    render(<StoredMarketPanel />);
    expect(await screen.findByRole('region', { name: 'Monthly bunker sales' })).toHaveTextContent('thousand tonnes');
    expect(screen.getByText(/Dates identify the represented month/)).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('shows empty storage without fabricated indicators or forecasts', async () => {
    serve([], ['Brent crude', 'Monthly bunker sales']);
    render(<StoredMarketPanel />);
    expect(await screen.findByText('No imported market observations are available.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Stored observation history' })).not.toBeInTheDocument();
  });

  it('filters fuel categories and expands the full category list', async () => {
    serve(Array.from({ length: 8 }, (_, index) => series(`MPA_BUNKER_SALES_FUEL_${index}`,
      `Bunker sales: FUEL ${index}`, 'sales', index, 'thousand tonnes', '2026-08-01')));
    render(<StoredMarketPanel />);
    const region = await screen.findByRole('region', { name: 'Monthly bunker sales' });
    expect(within(region).getAllByRole('row')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'View all 8 categories' }));
    expect(within(region).getAllByRole('row')).toHaveLength(9);
    fireEvent.change(screen.getByLabelText('Filter fuel categories'), { target: { value: 'Fuel 0' } });
    expect(within(region).getAllByRole('row')).toHaveLength(2);
    expect(within(region).getByText('0')).toBeInTheDocument();
  });

  it('changes the displayed history range without inventing daily observations', async () => {
    const item = series('BRENT_CRUDE', 'Brent crude', 'prices', 126.55, 'USD/barrel', '2026-08-20', 'USD');
    item.history = Array.from({ length: 20 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, '0')}`, value: 100 + index }));
    serve([item]);
    render(<StoredMarketPanel />);
    await screen.findByRole('region', { name: 'Stored observation history' });
    fireEvent.click(screen.getByRole('button', { name: '15 obs' }));
    expect(screen.getByRole('button', { name: '15 obs' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/15 observations ·/)).toBeInTheDocument();
  });
});
