import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForecastProvider, useForecastContext } from './ForecastContext';
import { buildMockForecast } from './mockService';
import type { ForecastService, Forecast, ReadyForecast } from './apiService';
afterEach(() => { vi.useRealTimers(); });
function Consumer() {
  const value = useForecastContext();
  return <><button onClick={() => value.setHorizon(14)}>14 days</button><button onClick={() => value.setHorizon(7)}>7 days</button>
    <button onClick={value.retry}>Retry</button><output>{value.status}:{value.horizon}:{value.data?.status === 'unavailable' ? value.data.message : ''}</output></>;
}
const unavailable = (message: string): Forecast => ({ status: 'unavailable', reason: 'no_run', message });
describe('shared forecast state', () => {
  it('reuses the same per-horizon result across screens and clears it on application date refresh', async () => {
    const service: ForecastService = { read: vi.fn(async h => buildMockForecast(h) as ReadyForecast) };
    const { rerender } = render(<ForecastProvider service={service} scenarioDate="2026-10-26"><Consumer /></ForecastProvider>);
    expect(await screen.findByText('success:7:')).toBeVisible();
    rerender(<ForecastProvider service={service} scenarioDate="2026-10-26"><section><Consumer /></section></ForecastProvider>);
    expect(await screen.findByText('success:7:')).toBeVisible();
    expect(service.read).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('14 days'));
    expect(await screen.findByText('success:14:')).toBeVisible();
    fireEvent.click(screen.getByText('7 days'));
    expect(await screen.findByText('success:7:')).toBeVisible();
    expect(service.read).toHaveBeenCalledTimes(2);
    rerender(<ForecastProvider service={service} scenarioDate="2026-10-27"><Consumer /></ForecastProvider>);
    await waitFor(() => expect(service.read).toHaveBeenCalledTimes(3));
  });

  it('discards late responses from old horizons and old sessions, including retries', async () => {
    const resolvers: ((value: Forecast) => void)[] = [];
    const service: ForecastService = { read: vi.fn(() => new Promise<Forecast>(resolve => resolvers.push(resolve))) };
    const { rerender } = render(<ForecastProvider service={service} scenarioDate="2026-10-26"><Consumer /></ForecastProvider>);
    fireEvent.click(screen.getByText('14 days'));
    await act(async () => resolvers[0](unavailable('obsolete-seven')));
    expect(screen.queryByText(/obsolete-seven/)).toBeNull();
    await act(async () => resolvers[1](unavailable('current-fourteen')));
    expect(screen.getByText('success:14:current-fourteen')).toBeVisible();
    fireEvent.click(screen.getByText('Retry'));
    expect(screen.queryByText(/current-fourteen/)).toBeNull();
    const other: ForecastService = { read: vi.fn(async () => unavailable('other-user')) };
    rerender(<ForecastProvider service={other} scenarioDate="2026-10-26"><Consumer /></ForecastProvider>);
    expect(await screen.findByText('success:14:other-user')).toBeVisible();
    await act(async () => resolvers[2](unavailable('obsolete-retry')));
    expect(screen.queryByText(/obsolete-retry/)).toBeNull();
    expect(screen.getByText('success:14:other-user')).toBeVisible();
  });
});


it('invalidates previously visited horizons after seeing a new publication run', async () => {
  let run = 'first';
  const service: ForecastService = { read: vi.fn(async h => ({ ...buildMockForecast(h), run_id: run } as ReadyForecast)) };
  render(<ForecastProvider service={service} scenarioDate="2026-10-26"><Consumer /></ForecastProvider>);
  await waitFor(() => expect(screen.getByText('success:7:')).toBeVisible());
  run = 'replacement';
  fireEvent.click(screen.getByText('14 days'));
  await waitFor(() => expect(screen.getByText('success:14:')).toBeVisible());
  fireEvent.click(screen.getByText('7 days'));
  await waitFor(() => expect(service.read).toHaveBeenCalledTimes(3));
});


it('revalidates in the foreground every minute and suppresses a previously ready forecast on failure', async () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  let published = true;
  const service: ForecastService = { read: vi.fn(async h => published ? buildMockForecast(h) as ReadyForecast : unavailable('latest-run-failed')) };
  await act(async () => { render(<ForecastProvider service={service} scenarioDate="2026-10-26"><Consumer /></ForecastProvider>); });
  expect(screen.getByText('success:7:')).toBeVisible();
  published = false;
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(service.read).toHaveBeenCalledTimes(2);
  expect(screen.getByText('success:7:latest-run-failed')).toBeVisible();
  expect(screen.queryByText('success:7:')).toBeNull();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(service.read).toHaveBeenCalledTimes(2);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  published = true;
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(service.read).toHaveBeenCalledTimes(3);
  expect(screen.getByText('success:7:')).toBeVisible();
});

it('clears every visited horizon on refresh so a failed run cannot restore an old cached ready value', async () => {
  let published = true;
  const service: ForecastService = { read: vi.fn(async h => published ? buildMockForecast(h) as ReadyForecast : unavailable('current-unavailable')) };
  render(<ForecastProvider service={service} scenarioDate="2026-10-26"><Consumer /></ForecastProvider>);
  expect(await screen.findByText('success:7:')).toBeVisible();
  fireEvent.click(screen.getByText('14 days'));
  expect(await screen.findByText('success:14:')).toBeVisible();
  published = false;
  fireEvent.click(screen.getByText('Retry'));
  expect(await screen.findByText('success:14:current-unavailable')).toBeVisible();
  fireEvent.click(screen.getByText('7 days'));
  expect(await screen.findByText('success:7:current-unavailable')).toBeVisible();
  expect(service.read).toHaveBeenCalledTimes(4);
});

it('does not reuse an in-flight old horizon after another horizon reports an unavailable run', async () => {
  const resolves: ((value: Forecast) => void)[] = [];
  const service: ForecastService = { read: vi.fn(() => new Promise<Forecast>(resolve => resolves.push(resolve))) };
  render(<ForecastProvider service={service} scenarioDate="2026-10-26"><Consumer /></ForecastProvider>);
  fireEvent.click(screen.getByText('14 days'));
  await act(async () => resolves[1](unavailable('failed-publication')));
  await act(async () => resolves[0](buildMockForecast(7) as ReadyForecast));
  fireEvent.click(screen.getByText('7 days'));
  expect(service.read).toHaveBeenCalledTimes(3);
  expect(screen.queryByText('success:7:')).toBeNull();
  await act(async () => resolves[2](unavailable('failed-publication')));
  expect(screen.getByText('success:7:failed-publication')).toBeVisible();
});
