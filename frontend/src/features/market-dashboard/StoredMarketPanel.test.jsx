import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StoredMarketPanel from './StoredMarketPanel';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children, data }) => <div data-testid="history-chart" data-dates={data.map(row => row.date).join(',')}>{children}</div>,
  CartesianGrid: () => null, Line: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));

const series = (key, label, category, value, unit, date, currency = null) => ({
  category, ticker: { seriesKey: key, label, value, unit, observedDate: date, currency,
    source: 'Provider', valueType: 'OBSERVED', changeAbs: null, changePct: null },
  history: [{ date: new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10), value }, { date, value }],
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
    expect((await screen.findAllByText('Unit pending verification')).length).toBeGreaterThan(0);
    expect(screen.queryByText('$171.08')).not.toBeInTheDocument();
  });

  it('retains zero sales in published units and names the month', async () => {
    serve([series('MPA_BUNKER_SALES_MGO', 'Bunker sales: MGO', 'sales', 0, 'thousand tonnes', '2026-08-01')]);
    render(<StoredMarketPanel />);
    expect(await screen.findByRole('region', { name: 'Monthly bunker sales' })).toHaveTextContent('thousand tonnes');
    expect(screen.getByText('August 2026 · monthly, as published')).toBeInTheDocument();
    expect(screen.getAllByText('0.00').length).toBeGreaterThan(0);
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
    fireEvent.change(screen.getByLabelText('Find a fuel category'), { target: { value: 'Fuel 0' } });
    expect(within(region).getAllByRole('row')).toHaveLength(2);
    expect(within(region).getByText('0.00')).toBeInTheDocument();
  });

  it('changes the displayed history range without inventing daily observations', async () => {
    const item = series('BRENT_CRUDE', 'Brent crude', 'prices', 126.55, 'USD/barrel', '2026-08-20', 'USD');
    item.history = Array.from({ length: 20 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, '0')}`, value: 100 + index }));
    serve([item]);
    render(<StoredMarketPanel />);
    await screen.findByRole('region', { name: 'Stored observation history' });
    fireEvent.click(screen.getByRole('button', { name: '15 days' }));
    expect(screen.getByRole('button', { name: '15 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/15 observations ·/)).toBeInTheDocument();
    expect(screen.queryByText('Stored observations', { exact: true })).not.toBeInTheDocument();
  });
  it('filters sparse dates by calendar days across a month boundary', async () => {
    const item = series('BRENT_CRUDE', 'Brent crude', 'prices', 120, 'USD/barrel', '2026-03-05', 'USD');
    item.history = ['2026-01-04', '2026-01-05', '2026-02-03', '2026-02-04',
      '2026-02-18', '2026-02-19', '2026-03-05'].map(date => ({ date, value: 120 }));
    serve([item]);
    render(<StoredMarketPanel />);
    await screen.findByRole('region', { name: 'Stored observation history' });
    const dates = () => screen.getByTestId('history-chart').getAttribute('data-dates').split(',');
    expect(dates()).toEqual(item.history.slice(1).map(row => row.date));
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    expect(dates()).toEqual(['2026-02-04', '2026-02-18', '2026-02-19', '2026-03-05']);
    fireEvent.click(screen.getByRole('button', { name: '15 days' }));
    expect(dates()).toEqual(['2026-02-19', '2026-03-05']);
    expect(screen.getByText(/2 observations ·/)).toBeInTheDocument();
  });

  it('refreshes on click and spins the icon until the request finishes', async () => {
    const fetcher = serve([series('BRENT_CRUDE', 'Brent crude', 'prices', 120, 'USD/barrel', '2026-10-14', 'USD')]);
    render(<StoredMarketPanel />);
    await screen.findByRole('region', { name: 'Stored observation history' });
    let resolve;
    fetcher.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const button = screen.getByRole('button', { name: 'Refresh market data' });
    fireEvent.click(button);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('svg')).toHaveClass('sm-spinning');
    await act(async () => resolve({ ok: true, status: 200, json: async () => ({
      storage: 'supabase', fetchedAt: '2026-10-20T05:01:00Z', missing: [],
      series: [series('BRENT_CRUDE', 'Brent crude', 'prices', 125, 'USD/barrel', '2026-10-14', 'USD')],
    }) }));
    expect(button).toBeEnabled();
    expect(button.querySelector('svg')).not.toHaveClass('sm-spinning');
    expect(screen.getAllByText('$125.00').length).toBeGreaterThan(0);
  });

  it('offers only documented market price/index series with usable database history', async () => {
    const priceKeys = ['SGP_MGO_OBSERVED', 'SGP_GASOIL_FUT', 'BRENT_CRUDE', 'DUBAI_CRUDE', 'USD_INDEX'];
    const items = priceKeys.map(key => series(key, key, 'prices', 120, 'index', '2026-10-14'));
    const single = series('BRENT_CRUDE', 'Brent without history', 'prices', 120, 'USD/barrel', '2026-10-14');
    single.history = [{ date: '2026-10-14', value: 120 }];
    serve([...items.filter(item => item.ticker.seriesKey !== 'BRENT_CRUDE'), single,
      series('MPA_BUNKER_SALES_MGO', 'Bunker sales: MGO', 'sales', 5, 'thousand tonnes', '2026-08-01'),
      series('GDELT_ARTICLE_COUNT', 'GDELT daily article count', 'news', 5, 'articles', '2026-10-14'),
      series('UNKNOWN_PRICE', 'Undocumented price', 'prices', 5, 'USD', '2026-10-14')]);
    render(<StoredMarketPanel />);
    const menu = await screen.findByRole('combobox', { name: 'Choose a series' });
    expect(within(menu).getAllByRole('option').map(option => option.value))
      .toEqual(['SGP_MGO_OBSERVED', 'SGP_GASOIL_FUT', 'DUBAI_CRUDE', 'USD_INDEX']);
    expect(menu).toHaveValue('SGP_MGO_OBSERVED');
    fireEvent.change(menu, { target: { value: 'USD_INDEX' } });
    expect(menu).toHaveValue('USD_INDEX');
    expect(screen.getByRole('region', { name: 'Monthly bunker sales' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'GDELT daily aggregates' })).toBeInTheDocument();
  });

  it('keeps MGO first and puts an unlisted price series last', async () => {
    serve([series('UNKNOWN_PRICE', 'Undocumented price', 'prices', 5, 'USD', '2026-10-14'),
      series('BRENT_CRUDE', 'Brent crude', 'prices', 120, 'USD/barrel', '2026-10-14'),
      series('SGP_MGO_OBSERVED', 'Singapore MGO', 'prices', 1351.5, 'USD/MT', '2026-10-14')]);
    render(<StoredMarketPanel />);
    const region = await screen.findByRole('region', { name: 'Stored prices and index' });
    expect(within(region).getAllByRole('heading').map(heading => heading.textContent))
      .toEqual(['Singapore MGO', 'Brent crude', 'Undocumented price']);
  });

  it('flags any series over seven days old and opens the chart on MGO', async () => {
    const mgo = series('SGP_MGO_OBSERVED', 'Singapore MGO', 'prices', 1351.5, 'USD/MT', '2026-10-26', 'USD');
    const brent = series('BRENT_CRUDE', 'Brent crude', 'prices', 123.1, 'USD/barrel', '2026-11-01', 'USD');
    serve([brent, mgo]);
    render(<StoredMarketPanel today="2026-11-06" />);
    expect(await screen.findByText('11 days old')).toBeInTheDocument();
    expect(screen.queryByText('5 days old')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Choose a series' })).toHaveValue('SGP_MGO_OBSERVED');
  });

  it('colours a card by what the move means for a buyer, and leaves the USD index neutral', async () => {
    const moved = (key, label, changeAbs) => { const item = series(key, label, 'prices', 100, 'USD/barrel', '2026-10-14', 'USD'); item.ticker.changeAbs = changeAbs; item.ticker.changePct = changeAbs; return item; };
    serve([moved('BRENT_CRUDE', 'Brent crude', -3.92), moved('DUBAI_CRUDE', 'Dubai crude', 0.24), moved('USD_INDEX', 'Broad USD index', -0.06)]);
    render(<StoredMarketPanel />);
    const card = async name => (await screen.findByRole('heading', { name })).closest('article');
    expect(await card('Brent crude')).toHaveClass('sm-tone-down');
    expect(await card('Dubai crude')).toHaveClass('sm-tone-up');
    expect(await card('Broad USD index')).toHaveClass('sm-tone-neutral');
    expect(within(await card('Brent crude')).getByText(/−3.92%/)).toBeInTheDocument();
  });

  it('marks MGO fuel rows and states one month and unit for the whole table', async () => {
    serve([series('MPA_BUNKER_SALES_A', 'Bunker sales: LOW SULPHUR MARINE GAS OIL', 'sales', 378.84, 'thousand tonnes (as published)', '2026-09-01'),
      series('MPA_BUNKER_SALES_B', 'Bunker sales: MARINE FUEL OIL', 'sales', 1993.2, 'thousand tonnes (as published)', '2026-09-01')]);
    render(<StoredMarketPanel />);
    const region = await screen.findByRole('region', { name: 'Monthly bunker sales' });
    expect(within(region).getByText('September 2026 · monthly, as published')).toBeInTheDocument();
    expect(within(region).getByRole('columnheader', { name: 'Sales · thousand tonnes' })).toBeInTheDocument();
    expect(within(region).getAllByText('MGO')).toHaveLength(1);
  });

  it('shows the news tone on a gauge and keeps the caveat', async () => {
    serve([series('GDELT_ARTICLE_COUNT', 'GDELT daily article count', 'news', 187, 'articles', '2026-10-27'),
      series('GDELT_AVERAGE_TONE', 'GDELT average tone', 'news', -1.189, 'tone', '2026-10-27')]);
    render(<StoredMarketPanel today="2026-11-06" />);
    const region = await screen.findByRole('region', { name: 'GDELT daily aggregates' });
    expect(within(region).getByText('−1.19')).toBeInTheDocument();
    expect(within(region).getByRole('img', { name: /Average tone -1.19, negative/ })).toBeInTheDocument();
    expect(within(region).getByText(/Context, not a price signal/)).toBeInTheDocument();
    expect(within(region).getByText('10 days old')).toBeInTheDocument();
  });

  it('writes every date one way, with no weekday, leading zero or four-letter month', async () => {
    serve([series('SGP_MGO_OBSERVED', 'Singapore MGO', 'prices', 1351.5, 'USD/MT', '2026-09-06', 'USD')]);
    render(<StoredMarketPanel today="2026-09-08" />);
    const region = await screen.findByRole('region', { name: 'Stored prices and index' });
    expect(within(region).getByText('6 Sep 2026')).toBeInTheDocument();
    expect(screen.getByText(/5 Sep – 6 Sep 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View recent values' }));
    expect(screen.getAllByText('6 Sep 2026').length).toBeGreaterThan(1);
  });

  it('omits the history chart when no supported series has multiple valid dates', async () => {
    const item = series('BRENT_CRUDE', 'Brent crude', 'prices', 120, 'USD/barrel', '2026-10-14');
    item.history = [{ date: '2026-10-14', value: 120 }, { date: '2026-10-14', value: 121 },
      { date: 'invalid', value: 122 }, { date: '2026-10-13', value: null }];
    serve([item]);
    render(<StoredMarketPanel />);
    await screen.findByRole('region', { name: 'Stored prices and index' });
    expect(screen.queryByRole('combobox', { name: 'Choose a series' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Stored observation history' })).not.toBeInTheDocument();
  });

});
