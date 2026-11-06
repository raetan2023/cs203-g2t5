import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ForecastProvider } from '../forecast/ForecastContext';
import type { Forecast, ForecastService, Horizon } from '../forecast/apiService';
import { marketForecast } from '../../preview/marketScenarios';
import { MarketForecast } from './MarketForecast';

const TODAY = '2026-11-06';
const reader = (read: (horizon: Horizon) => Promise<Forecast>): ForecastService => ({ read: vi.fn(read) });
const ready = reader(async horizon => marketForecast(horizon));
const show = (service?: ForecastService) => render(<ForecastProvider service={service} scenarioDate={TODAY}><MarketForecast today={TODAY} /></ForecastProvider>);

describe('market forecast', () => {
  it('shows the latest quote and all three horizons, without range bars', async () => {
    show(ready);
    const tiles = within(await screen.findByRole('list', { name: 'Forecast by horizon' })).getAllByRole('listitem');
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toHaveTextContent('Latest quote');
    expect(tiles[0]).toHaveTextContent('Mon 26 Oct');
    expect(tiles[0]).toHaveTextContent('11 days old');
    expect(tiles[1]).toHaveTextContent('$1,338.00');
    expect(tiles[1]).toHaveTextContent('↓ 1.0%');
    expect(tiles[1]).toHaveTextContent('Range $1,240 – 1,436');
    expect(tiles[3]).toHaveTextContent('Sun 06 Dec');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/Bars share one scale/)).not.toBeInTheDocument();
    expect(screen.getByText(/coverage not measured/)).toBeInTheDocument();
    expect(screen.queryByText(/today’s quote/i)).not.toBeInTheDocument();
  });

  it('explains the forecast in four steps, with no report or plan link', async () => {
    show(ready);
    const steps = await screen.findByRole('region', { name: 'How this forecast was made' });
    expect(within(steps).getAllByRole('listitem')).toHaveLength(4);
    expect(steps).toHaveTextContent('USD 1,351.50/MT');
    expect(steps).toHaveTextContent('Includes estimated news figures');
    expect(steps).toHaveTextContent('Ridge regression');
    expect(steps).toHaveTextContent('Experimental range');
    expect(screen.queryByRole('button', { name: 'Download report' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /purchase plan/i })).not.toBeInTheDocument();
  });

  it('refreshes every horizon from the header button and shows it is working', async () => {
    const pending: (() => void)[] = [];
    const service = reader(async horizon => marketForecast(horizon));
    show(service);
    const button = await screen.findByRole('button', { name: 'Refresh forecast' });
    const before = vi.mocked(service.read).mock.calls.length;
    vi.mocked(service.read).mockImplementation(horizon => new Promise(resolve => { pending.push(() => resolve(marketForecast(horizon))); }));
    await userEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => expect(vi.mocked(service.read).mock.calls.length).toBe(before + 3));
    pending.forEach(finish => finish());
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveAttribute('aria-busy', 'false');
  });

  it('keeps the other horizons when one is unavailable', async () => {
    show(reader(async horizon => horizon === 14 ? { status: 'unavailable', reason: 'ridge_unavailable', message: 'Ridge prediction unavailable.' } : marketForecast(horizon)));
    const tiles = within(await screen.findByRole('list', { name: 'Forecast by horizon' })).getAllByRole('listitem');
    expect(tiles[2]).toHaveTextContent('Unavailable');
    expect(tiles[2]).toHaveTextContent('Ridge prediction unavailable.');
    expect(tiles[1]).toHaveTextContent('$1,338.00');
  });

  it('says when no forecast is available, names the last run and offers a retry', async () => {
    const service = reader(async () => ({ status: 'unavailable', reason: 'stale_run', message: 'The previous run is stale.',
      last_successful_run: { run_id: 'r', origin_date: '2026-10-20', published_at: '2026-10-20T01:00:00Z', model_version: 'm' } }));
    show(service);
    const message = await screen.findByRole('status');
    expect(message).toHaveTextContent('The previous run is stale.');
    expect(message).toHaveTextContent('Last successful forecast: Tue 20 Oct 2026. It is not shown as a current forecast.');
    const before = vi.mocked(service.read).mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Retry forecast' }));
    await waitFor(() => expect(vi.mocked(service.read).mock.calls.length).toBeGreaterThan(before));
  });

  it('reports a failed read as an alert', async () => {
    show(reader(async () => { throw new Error('Could not reach the forecast.'); }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the forecast.');
  });

  it('says when the service is not connected', () => {
    show();
    expect(screen.getByRole('status')).toHaveTextContent('The forecast service is not connected.');
  });
});
