import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiForecastService, parseForecast } from './apiService';
import { buildMockForecast } from './mockService';

afterEach(() => vi.unstubAllGlobals());
const payload = () => ({ ...buildMockForecast(7), synthetic: undefined });

describe('live forecast adapter', () => {
  it('uses authenticated no-store GET with the selected horizon, never a mock fallback', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'unavailable', reason: 'no_run', message: 'No complete run.' })));
    vi.stubGlobal('fetch', fetcher);
    const service = createApiForecastService({ baseUrl: 'https://api.example/', getToken: () => 'session' });
    expect(await service.read(14)).toMatchObject({ status: 'unavailable', reason: 'no_run' });
    expect(fetcher).toHaveBeenCalledWith('https://api.example/api/v1/forecast?horizon_days=14', {
      headers: { Authorization: 'Bearer session' }, cache: 'no-store',
    });
  });

  it('allows a Ridge estimate outside ordered CQR bounds and preserves run metadata', () => {
    const body = payload(); body.forecast = body.high + 100;
    const parsed = parseForecast(body, 7);
    expect(parsed).toMatchObject({ status: 'ready', forecast: body.forecast, low: body.low, high: body.high, run_id: body.run_id });
    expect(parsed).not.toHaveProperty('synthetic');
  });

  it.each([
    (v: any) => { v.low = v.high + 1; },
    (v: any) => { v.forecast = Infinity; },
    (v: any) => { v.low = 0; },
    (v: any) => { v.horizon_days = 30; },
    (v: any) => { v.unit = 'USD/barrel'; },
    (v: any) => { v.source_dates.mgo = '2099-01-01'; },
    (v: any) => { v.interval.empirical_coverage = 0.8; },
    (v: any) => { v.target_date = '2026-02-30'; },
    (v: any) => { v.news_window_end = '2099-01-01T00:00:00Z'; },
    (v: any) => { v.history[0].date = '2099-01-01'; },
  ])('rejects malformed or incompatible ready values %#', mutate => {
    const body = structuredClone(payload()); mutate(body);
    expect(() => parseForecast(body, 7)).toThrow('invalid');
  });

  it('accepts a rolling or older complete window without requiring yesterday', () => {
    const body = payload();
    body.news_window_start = '2026-10-02T00:30:00Z';
    body.news_window_end = '2026-10-03T00:30:00Z';
    expect(parseForecast(body, 7)).toMatchObject({ status: 'ready', news_window_end: body.news_window_end });
  });

  it('retains only validated last-success metadata while a forecast is unavailable', () => {
    expect(parseForecast({ status: 'unavailable', reason: 'stale', message: 'No current run.', last_successful_run: {
      run_id: 'old', origin_date: '2026-10-03', published_at: '2026-10-03T01:00:00Z', model_version: 'v1',
    } }, 7)).toMatchObject({ status: 'unavailable', last_successful_run: { run_id: 'old' } });
  });

  it('does not issue a request without authentication or replace network failures with preview data', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    await expect(createApiForecastService().read(7)).rejects.toThrow('sign in');
    expect(fetcher).not.toHaveBeenCalled();
    await expect(createApiForecastService({ getToken: () => 'session' }).read(7)).rejects.toThrow('reach');
  });
});
