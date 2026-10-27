import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Horizon, ReadyForecast } from '../forecast/apiService';
import { buildMockForecast } from '../forecast/mockService';
import { TimingComparison } from './TimingComparison';

const entry = (h: Horizon, price: number) => ({ horizon: h, forecast: { ...buildMockForecast(h),
  run_id: 'same-snapshot', anchor_quote_date: '2026-10-26', forecast_origin_date: '2026-10-26',
  target_date: new Date(Date.parse('2026-10-26') + h * 86400000).toISOString().slice(0, 10),
  forecast: price, low: price - 100, high: price + 100 } as ReadyForecast });

it('renders all three real ranges and lets a card select the detailed estimate', async () => {
  const select = vi.fn();
  render(<TimingComparison service={{ read: async h => entry(h, h === 14 ? 980 : 1000).forecast }} today="2026-10-26" deadline="2026-12-01" select={select} />);
  expect(await screen.findByRole('heading', { name: 'MGO price forecasts' })).toBeVisible();
  const chartToggle = screen.getByText('View price ranges chart');
  expect(chartToggle.closest('details')).not.toHaveAttribute('open');
  fireEvent.click(chartToggle);
  expect(screen.getByRole('img', { name: /Central MGO price/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /14 days/ }));
  expect(select).toHaveBeenCalledWith(14);
});

it('rejects a comparison assembled from different source snapshots', async () => {
  render(<TimingComparison service={{ read: async h => ({ ...entry(h, 1000).forecast, run_id: String(h) }) }} today="2026-10-26" deadline="2026-12-01" select={() => {}} />);
  expect(await screen.findByRole('heading', { name: 'MGO price forecasts' })).toBeVisible();
  expect(screen.getAllByText(/Source data changed. Refresh the comparison./)).toHaveLength(3);
});

it('distinguishes the selected horizon from the suggested one and disables late targets', async () => {
  const { rerender } = render(<TimingComparison service={{ read: async h => entry(h, h === 14 ? 980 : 1000).forecast }} today="2026-10-26" deadline="2026-11-15" selectedHorizon={7} select={() => {}} />);
  const selected = await screen.findByRole('button', { name: /7 days.*Selected/ });
  expect(selected).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /14 days/ })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: /30 days/ })).toBeDisabled();
  rerender(<TimingComparison service={{ read: async h => entry(h, h === 14 ? 980 : 1000).forecast }} today="2026-10-26" deadline="2026-11-15" selectedHorizon={14} select={() => {}} />);
  expect(await screen.findByRole('button', { name: /14 days.*Selected/ })).toHaveAttribute('aria-pressed', 'true');
});
