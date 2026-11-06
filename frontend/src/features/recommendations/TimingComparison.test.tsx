import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ForecastService, Horizon, ReadyForecast } from '../forecast/apiService';
import { buildMockForecast } from '../forecast/mockService';
import { CompareBuyingDates, ExploredDetail, buildColumns, useHorizonComparison, type ColumnId } from './TimingComparison';

const entry = (h: Horizon, price: number) => ({ ...buildMockForecast(h),
  run_id: 'same-snapshot', anchor_quote_date: '2026-10-26', forecast_origin_date: '2026-10-26', anchor_price: 1000,
  target_date: new Date(Date.parse('2026-10-26') + h * 86400000).toISOString().slice(0, 10),
  forecast: price, low: price - 100, high: price + 100 } as ReadyForecast);
const prices: ForecastService = { read: async h => entry(h, h === 14 ? 980 : 1000) };

function Harness({ service = prices, deadline = '2026-12-01', explored, recommended = [], onExplore = () => {} }: {
  service?: ForecastService; deadline?: string; explored?: ColumnId; recommended?: ColumnId[]; onExplore?(id: ColumnId): void;
}) {
  const { entries } = useHorizonComparison(service, '2026-10-26');
  return <CompareBuyingDates entries={entries} quantity={10} today="2026-10-26" deadline={deadline} explored={explored} recommended={recommended} onExplore={onExplore} />;
}

it('shows today and all three ranges in totals or per MT and lets a column be explored', async () => {
  const onExplore = vi.fn();
  render(<Harness onExplore={onExplore} recommended={['today']} />);
  expect(await screen.findByRole('button', { name: '14 days' })).toHaveAccessibleDescription(/Eligible.*USD 9,800.*Range 8,800–10,800/);
  expect(screen.getByRole('button', { name: 'Today' })).toHaveAccessibleDescription(/Recommended.*USD 10,000/);
  fireEvent.click(screen.getByRole('button', { name: 'Per MT' }));
  expect(screen.getByRole('button', { name: '14 days' })).toHaveAccessibleDescription(/USD 980\/MT.*Range 880–1,080\/MT/);
  fireEvent.click(screen.getByRole('button', { name: '14 days' }));
  expect(onExplore).toHaveBeenCalledWith(14);
});

it('dates today’s detail by the observed quote, not by the planning date', () => {
  const columns = buildColumns([7, 14, 30].map(h => ({ horizon: h as Horizon, forecast: entry(h as Horizon, 1000) })), '2026-10-28', '2026-12-01');
  render(<ExploredDetail column={columns[0]} quantity={10} today="2026-10-28" source="" experimental={false} />);
  expect(screen.getByText('MGO quote observed 26 Oct 2026 · 2 days old')).toBeVisible();
});

it('counts buying dates from today and never reuses an older forecast for a different target', () => {
  render(<CompareBuyingDates entries={[
    { horizon: 7, message: 'Forecast target date has passed.' },
    { horizon: 14, forecast: entry(14, 980) },
    { horizon: 30, forecast: entry(30, 1000) },
  ]} quantity={888} today="2026-11-06" deadline="2026-11-26" recommended={[]} onExplore={() => {}} />);
  for (const [horizon, date] of [[7, 'Fri 13 Nov'], [14, 'Fri 20 Nov'], [30, 'Sun 06 Dec']] as const) {
    const card = screen.getByRole('button', { name: `${horizon} days` });
    expect(within(card).getByText(date)).toBeVisible();
    expect(card).toBeDisabled();
    expect(card).toHaveAccessibleDescription(/Unavailable/);
    expect(within(card).queryByText(/USD/)).not.toBeInTheDocument();
  }
  expect(screen.getByRole('button', { name: '14 days' })).toHaveAccessibleDescription(/latest 14-day forecast targets 09 Nov 2026/);
  expect(screen.getByRole('button', { name: 'Today' })).toHaveAccessibleDescription(/Quote from Mon 26 Oct/);
  expect(screen.getByText(/Dates count from today, 06 Nov 2026/)).toBeVisible();
});

it('uses a forecast with the requested target even when its reference quote is older', () => {
  const forecast = { ...entry(14, 980), target_date: '2026-11-20' };
  const columns = buildColumns([{ horizon: 14, forecast }], '2026-11-06', '2026-11-19');
  expect(columns[1]).toMatchObject({ date: '2026-11-20', forecast, late: true, mid: 980 });
});

it('keeps calendar horizons correct across month and year boundaries', () => {
  const columns = buildColumns([7, 14, 30].map(horizon => ({ horizon: horizon as Horizon })), '2026-12-25', '2027-02-01');
  expect(columns.map(c => c.date)).toEqual(['2027-01-01', '2027-01-08', '2027-01-24']);
});

it('rejects a comparison assembled from different source snapshots', async () => {
  render(<Harness service={{ read: async h => ({ ...entry(h, 1000), run_id: String(h) }) }} />);
  // One shared reason is said once, not on three empty cards.
  expect(await screen.findAllByText(/Source data changed. Refresh the comparison./)).toHaveLength(1);
  expect(screen.queryByRole('button', { name: '7 days' })).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Show prices as' })).not.toBeInTheDocument();
});

it('does not repeat a forecast failure the page already shows, and keeps cards when reasons differ', async () => {
  const unavailable = (message: string) => ({ status: 'unavailable' as const, reason: 'missing_previous_day_news', message });
  const { unmount } = render(<CompareBuyingDates entries={[7, 14, 30].map(h => ({ horizon: h as Horizon, message: 'News missing.' }))}
    quantity={10} today="2026-10-26" deadline="2026-12-01" recommended={[]} knownMessage="News missing." onExplore={() => {}} />);
  expect(screen.getByText(/No 7, 14 or 30-day forecast is available, for the reason shown above\./)).toBeVisible();
  expect(screen.queryByText(/News missing\./)).not.toBeInTheDocument();
  unmount();
  render(<Harness service={{ read: async h => h === 7 ? unavailable('Quote too old.') : entry(h, 1000) }} />);
  expect(await screen.findByRole('button', { name: '7 days' })).toBeDisabled();
  expect(screen.getByText('Model status: Quote too old.')).toBeVisible();
});

it('marks late targets after the deadline but still lets them be explored for comparison', async () => {
  const onExplore = vi.fn();
  render(<Harness deadline="2026-11-15" explored={7} onExplore={onExplore} />);
  expect(await screen.findByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '14 days' })).toHaveAttribute('aria-pressed', 'false');
  const late = screen.getByRole('button', { name: '30 days' });
  expect(late).toHaveAccessibleDescription(/After deadline/);
  expect(late).toBeEnabled();
  fireEvent.click(late);
  expect(onExplore).toHaveBeenCalledWith(30);
  expect(screen.getByLabelText('Purchase deadline 15 Nov 2026')).toBeVisible();
});
