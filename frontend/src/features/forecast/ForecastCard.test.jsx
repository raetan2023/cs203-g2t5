import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ForecastCard from './ForecastCard';
import ForecastWidget from './ForecastWidget';
import { ForecastProvider } from './ForecastContext';
import { buildSeries } from './ForecastChart';
import { buildMockForecast } from './mockService';

vi.mock('./ForecastChart', async importOriginal => ({ ...await importOriginal(), default: () => null }));

describe('forecast interval presentation', () => {
  it('prominently identifies explicitly supplied preview data as synthetic', async () => {
    render(<ForecastProvider service={{ read: async () => buildMockForecast(7) }} scenarioDate="2026-10-05"><ForecastWidget /></ForecastProvider>);
    expect(await screen.findByText('Synthetic preview')).toBeVisible();
    expect(screen.getByText(/Illustrative data, not a live forecast/)).toBeVisible();
    expect(screen.getByText('Forecast details').closest('details')).not.toHaveAttribute('open');
  });

  it('distinguishes target coverage from unavailable observed coverage', () => {
    render(<ForecastCard data={buildMockForecast(7)} />);
    expect(screen.getByText('Target coverage: 80% prediction interval.')).toBeVisible();
    expect(screen.getByText('Observed coverage: unavailable. No measured coverage is provided.')).toBeVisible();
    expect(screen.getByText(/No measured coverage or model performance/)).toBeVisible();
    expect(screen.getByText('Illustrative point forecast. Accuracy has not been measured.')).toBeVisible();
  });

  it('shows measured coverage and counts independently of point skill', () => {
    const data = buildMockForecast(7);
    data.interval = { ...data.interval, empirical_coverage: 0.75, evaluation_rows: 40,
      baseline_coverage: 0.825, mean_width: 100, baseline_mean_width: 110,
      evaluation_scope: 'Holdout forecasts', limitations: 'Dependent observations.' };
    render(<ForecastCard data={data} />);
    expect(screen.getByText('Observed coverage: 75.0% across 40 chronological forecasts.')).toBeVisible();
    expect(screen.getByText('Persistence baseline coverage: 82.5% on the same forecasts.')).toBeVisible();
    expect(screen.getByText('Mean interval width: $100.00/MT; baseline $110.00/MT.')).toBeVisible();
  });

  it('uses anchor horizon for stale quotes and preserves an outside point estimate', () => {
    const data = { ...buildMockForecast(7), forecast: 1400, low: 1200, high: 1300 };
    const endpoint = buildSeries(data).at(-1);
    expect(endpoint.date).toBe('2026-10-12');
    expect(endpoint.forecast).toBe(1400);
    expect(endpoint.band).toEqual([1200, 1300]);
    render(<ForecastCard data={data} />);
    expect(screen.getByText('Target Oct 12, 2026 · 7-day horizon')).toBeVisible();
  });

  it('does not infer persistence fallback from no_edge evidence', () => {
    render(<ForecastCard data={{ ...buildMockForecast(30), synthetic: false, forecast: 1400 }} />);
    expect(screen.getByText('No measurable edge over carrying the last price forward at this horizon.')).toBeVisible();
    expect(screen.queryByText(/model carries the last price forward/)).toBeNull();
  });
});
