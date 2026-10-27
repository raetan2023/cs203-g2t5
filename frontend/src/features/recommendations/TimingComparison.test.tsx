import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Horizon, ReadyForecast } from '../forecast/apiService';
import { buildMockForecast } from '../forecast/mockService';
import { TimingComparison, timingChoice } from './TimingComparison';

const entry = (h: Horizon, price: number) => ({ horizon: h, forecast: { ...buildMockForecast(h),
  run_id: 'same-snapshot', anchor_quote_date: '2026-10-26', forecast_origin_date: '2026-10-26',
  target_date: new Date(Date.parse('2026-10-26') + h * 86400000).toISOString().slice(0, 10),
  forecast: price, low: price - 100, high: price + 100 } as ReadyForecast });

it('chooses the cheapest central price within the saved deadline and explains overlap', () => {
  const rows = [entry(7, 1000), entry(14, 980), entry(30, 900)];
  expect(timingChoice(rows, '2026-10-26', '2026-11-15')).toMatchObject({ title: 'Buy in 14 days', horizon: 14 });
  expect(timingChoice(rows, '2026-10-26', '2026-11-15').reason).toContain('ranges overlap');
  rows[0].forecast.anchor_quote_date = '2026-10-01';
  expect(timingChoice(rows, '2026-10-26', '2026-11-15')).not.toHaveProperty('horizon');
  expect(timingChoice([rows[1]], '2026-10-26', '2026-11-15')).not.toHaveProperty('horizon');
});

it('renders all three real ranges and lets a card select the detailed estimate', async () => {
  const select = vi.fn();
  render(<TimingComparison service={{ read: async h => entry(h, h === 14 ? 980 : 1000).forecast }} today="2026-10-26" deadline="2026-12-01" select={select} />);
  expect(await screen.findByRole('heading', { name: 'Lowest central estimate · 14 days' })).toBeVisible();
  const chartToggle = screen.getByText('View price ranges chart');
  expect(chartToggle.closest('details')).not.toHaveAttribute('open');
  fireEvent.click(chartToggle);
  expect(screen.getByRole('img', { name: /Central MGO price/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /14 days · Suggested/ }));
  expect(select).toHaveBeenCalledWith(14);
});

it('rejects a comparison assembled from different source snapshots', async () => {
  render(<TimingComparison service={{ read: async h => ({ ...entry(h, 1000).forecast, run_id: String(h) }) }} today="2026-10-26" deadline="2026-12-01" select={() => {}} />);
  expect(await screen.findByRole('heading', { name: 'Not enough forecasts to choose a buying date' })).toBeVisible();
  expect(screen.getAllByText(/Source data changed. Refresh the comparison./)).toHaveLength(3);
});

it('recommends the saved purchase window when all three horizons miss the deadline', () => {
  expect(timingChoice([entry(7, 1000), entry(14, 980), entry(30, 900)], '2026-10-26', '2026-10-31')).toMatchObject({ title: 'Buy within 5 days' });
});

it('distinguishes the selected horizon from the suggested one and disables late targets', async () => {
  const { rerender } = render(<TimingComparison service={{ read: async h => entry(h, h === 14 ? 980 : 1000).forecast }} today="2026-10-26" deadline="2026-11-15" selectedHorizon={7} select={() => {}} />);
  const selected = await screen.findByRole('button', { name: /7 days.*Selected/ });
  expect(selected).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /14 days · Suggested/ })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: /30 days/ })).toBeDisabled();
  rerender(<TimingComparison service={{ read: async h => entry(h, h === 14 ? 980 : 1000).forecast }} today="2026-10-26" deadline="2026-11-15" selectedHorizon={14} select={() => {}} />);
  expect(await screen.findByRole('button', { name: /14 days · Suggested.*Selected/ })).toHaveAttribute('aria-pressed', 'true');
});
