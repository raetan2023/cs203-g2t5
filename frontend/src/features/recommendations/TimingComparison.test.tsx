import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ForecastService, Horizon, ReadyForecast } from '../forecast/apiService';
import { buildMockForecast } from '../forecast/mockService';
import { CompareBuyingDates, buildColumns, useHorizonComparison, type ColumnId } from './TimingComparison';

const entry = (h: Horizon, price: number) => ({ ...buildMockForecast(h),
  run_id: 'same-snapshot', anchor_quote_date: '2026-10-26', forecast_origin_date: '2026-10-26', anchor_price: 1000,
  target_date: new Date(Date.parse('2026-10-26') + h * 86400000).toISOString().slice(0, 10),
  forecast: price, low: price - 100, high: price + 100 } as ReadyForecast);
const prices: ForecastService = { read: async h => entry(h, h === 14 ? 980 : 1000) };

function Harness({ service = prices, deadline = '2026-12-01', selected, recommended = [], onSelect = () => {} }: {
  service?: ForecastService; deadline?: string; selected?: Horizon; recommended?: ColumnId[]; onSelect?(id: Horizon): void;
}) {
  const { entries } = useHorizonComparison(service, '2026-10-26');
  return <CompareBuyingDates entries={entries} quantity={10} today="2026-10-26" deadline={deadline} selected={selected} recommended={recommended} onSelect={onSelect} />;
}

it('shows today and all three ranges in totals or per MT and lets a forecast date be selected', async () => {
  const onSelect = vi.fn();
  render(<Harness onSelect={onSelect} recommended={['today']} />);
  expect(await screen.findByRole('button', { name: '14 days' })).toHaveAccessibleDescription(/Eligible.*USD 9,800.*Range 8,800–10,800/);
  expect(screen.getByRole('group', { name: 'Today' })).toHaveAccessibleDescription(/Recommended.*USD 10,000/);
  expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Per MT' }));
  expect(screen.getByRole('button', { name: '14 days' })).toHaveAccessibleDescription(/USD 980\/MT.*Range 880–1,080\/MT/);
  fireEvent.click(screen.getByRole('button', { name: '14 days' }));
  expect(onSelect).toHaveBeenCalledWith(14);
});

it('dates today’s card by the observed quote, not by the planning date', () => {
  render(<CompareBuyingDates entries={[7, 14, 30].map(h => ({ horizon: h as Horizon, forecast: entry(h as Horizon, 1000) }))}
    quantity={888} today="2026-10-28" deadline="2026-12-01" recommended={[]} onSelect={() => {}} />);
  const today = screen.getByRole('group', { name: 'Today' });
  expect(within(today).getByText('Quote from Mon 26 Oct')).toBeVisible();
  expect(within(today).getByText('888 MT × USD 1,000.00/MT')).toBeVisible();
});

it('puts each forecast on its real target date and marks a passed date as unavailable', () => {
  render(<CompareBuyingDates entries={[
    { horizon: 7, message: 'Forecast target date has passed.' },
    { horizon: 14, forecast: entry(14, 980) },
    { horizon: 30, forecast: entry(30, 1000) },
  ]} quantity={888} today="2026-11-06" deadline="2026-11-26" selected={14} recommended={[]} onSelect={() => {}} />);
  const passed = screen.getByRole('button', { name: '7 days' });
  expect(within(passed).getByText('Mon 02 Nov')).toBeVisible();
  expect(passed).toBeDisabled();
  expect(passed).toHaveAccessibleDescription(/Passed.*Unavailable/);
  expect(within(passed).getByText(/A newer quote is needed/)).toBeVisible();
  expect(within(passed).queryByText(/USD/)).not.toBeInTheDocument();
  const fourteen = screen.getByRole('button', { name: '14 days' });
  expect(within(fourteen).getByText('Mon 09 Nov')).toBeVisible();
  expect(fourteen).toBeEnabled();
  expect(fourteen).toHaveAccessibleDescription(/Selected/);
  const thirty = screen.getByRole('button', { name: '30 days' });
  expect(within(thirty).getByText(/Wed 25 Nov · 1 day before deadline/)).toBeVisible();
  expect(thirty).toHaveAccessibleDescription(/Eligible/);
  expect(screen.getByText(/Forecast dates count from the 26 Oct 2026 quote, not from today/)).toBeVisible();
});

it('keeps both ends of a large range in one unit', () => {
  render(<CompareBuyingDates entries={[{ horizon: 14, forecast: { ...entry(14, 1351.5), low: 952.58, high: 1683.54 } }]}
    quantity={888} today="2026-10-26" deadline="2026-12-01" recommended={[]} onSelect={() => {}} />);
  expect(screen.getByText('Range 0.85m–1.49m')).toBeVisible();
});

it('counts a model from its own origin, so an old quote alone never marks a date as passed', () => {
  const fromToday = (h: Horizon) => ({ ...entry(h, 1000), forecast_origin_date: '2026-11-06', target_date: new Date(Date.parse('2026-11-06') + h * 86400000).toISOString().slice(0, 10) });
  render(<CompareBuyingDates entries={[{ horizon: 7, message: 'News missing.' }, { horizon: 14, forecast: fromToday(14) }, { horizon: 30, forecast: fromToday(30) }]}
    quantity={10} today="2026-11-06" deadline="2026-12-20" recommended={[]} onSelect={() => {}} />);
  const seven = screen.getByRole('button', { name: '7 days' });
  expect(within(seven).getByText('Fri 13 Nov')).toBeVisible();
  expect(seven).toHaveAccessibleDescription(/Unavailable/);
  expect(seven).not.toHaveAccessibleDescription(/Passed/);
  expect(within(screen.getByRole('button', { name: '14 days' })).getByText('Fri 20 Nov')).toBeVisible();
  expect(screen.getByText(/Forecast dates count from today\./)).toBeVisible();
});

it('treats a forecast whose target has arrived as passed, even if one is returned', () => {
  const columns = buildColumns([{ horizon: 7, forecast: entry(7, 980) }], '2026-11-02', '2026-11-26');
  expect(columns[1]).toMatchObject({ date: '2026-11-02', past: true, forecast: undefined });
});

it('shows Recommended and Selected together on the same date', () => {
  render(<CompareBuyingDates entries={[7, 14, 30].map(h => ({ horizon: h as Horizon, forecast: entry(h as Horizon, 1000) }))}
    quantity={10} today="2026-10-26" deadline="2026-12-01" selected={30} recommended={[30]} onSelect={() => {}} />);
  const card = screen.getByRole('button', { name: '30 days' });
  expect(within(card).getByText('Recommended')).toBeVisible();
  expect(within(card).getByText('Selected')).toBeVisible();
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
    quantity={10} today="2026-10-26" deadline="2026-12-01" recommended={[]} knownMessage="News missing." onSelect={() => {}} />);
  expect(screen.getByText(/No 7, 14 or 30-day forecast is available, for the reason shown above\./)).toBeVisible();
  expect(screen.queryByText(/News missing\./)).not.toBeInTheDocument();
  unmount();
  render(<Harness service={{ read: async h => h === 7 ? unavailable('Quote too old.') : entry(h, 1000) }} />);
  expect(await screen.findByRole('button', { name: '7 days' })).toBeDisabled();
  expect(screen.getByText('Model status: Quote too old.')).toBeVisible();
});

it('marks late targets after the deadline but still lets them be selected for comparison', async () => {
  const onSelect = vi.fn();
  render(<Harness deadline="2026-11-15" selected={7} onSelect={onSelect} />);
  expect(await screen.findByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '14 days' })).toHaveAttribute('aria-pressed', 'false');
  const late = screen.getByRole('button', { name: '30 days' });
  expect(late).toHaveAccessibleDescription(/After deadline/);
  expect(late).toBeEnabled();
  fireEvent.click(late);
  expect(onSelect).toHaveBeenCalledWith(30);
  expect(screen.getByLabelText('Purchase deadline 15 Nov 2026')).toBeVisible();
});
