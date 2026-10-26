import { describe, it, expect } from 'vitest';
import { buildMockForecast } from './mockService';
import { deriveDirection, driverLabel, evidenceMeta, addDays } from './utils';

describe('buildMockForecast', () => {
  it('returns the real PredictResponse fields for a 7-day horizon', () => {
    const f = buildMockForecast(7);
    expect(f.horizon_days).toBe(7);
    expect(f.unit).toBe('USD/metric tonne');
    expect(typeof f.anchor_price).toBe('number');
    expect(typeof f.forecast).toBe('number');
    expect(f.low).toBeLessThanOrEqual(f.high);
    expect(['supported', 'weak', 'no_edge']).toContain(f.evidence);
    expect(Array.isArray(f.top_drivers)).toBe(true);
    expect(Array.isArray(f.history)).toBe(true);
    expect(f.history.length).toBeGreaterThan(0);
  });

  it('history ends at the actual anchor quote, before the request date', () => {
    const f = buildMockForecast(7);
    const last = f.history[f.history.length - 1];
    expect(last.date).toBe(f.anchor_quote_date);
    expect(last.date).not.toBe(f.as_of_date);
    expect(f.target_date).toBe(addDays(f.forecast_origin_date, 7));
    expect(last.price).toBe(f.anchor_price);
  });

  it('30-day horizon is the honest no_edge / carried-forward case', () => {
    const f = buildMockForecast(30);
    expect(f.evidence).toBe('no_edge');
    expect(f.forecast).toBe(f.anchor_price); // carried forward, flat
  });

  it('falls back to 7 days for an unknown horizon', () => {
    expect(buildMockForecast(99).horizon_days).toBe(7);
  });
});

describe('deriveDirection', () => {
  it('classifies up, down, and flat', () => {
    expect(deriveDirection(1300, 1290)).toBe('up');
    expect(deriveDirection(1280, 1297)).toBe('down');
    expect(deriveDirection(1297, 1297)).toBe('flat');
  });
  it('is flat when inputs are missing', () => {
    expect(deriveDirection(null, 1297)).toBe('flat');
  });
});

describe('driverLabel', () => {
  it('maps known feature names to readable labels', () => {
    expect(driverLabel('brent_fred_lag1')).toBe('Brent crude (prev day)');
  });
  it('tidies unknown feature names instead of crashing', () => {
    expect(driverLabel('some_new_signal_lag1')).toBe('Some New Signal');
  });
});

describe('evidenceMeta', () => {
  it('maps no_edge to a readable label and tone', () => {
    expect(evidenceMeta('no_edge')).toEqual({ text: 'no edge', tone: 'no_edge' });
  });
  it('degrades gracefully for an unknown value', () => {
    expect(evidenceMeta('mystery').tone).toBe('weak');
  });
});

describe('addDays', () => {
  it('advances a date by the given number of days', () => {
    expect(addDays('2026-10-05', 7)).toBe('2026-10-12');
  });
});


describe('interval preview provenance', () => {
  it('does not invent measured calibration results', () => {
    const f = buildMockForecast(7);
    expect(f.synthetic).toBe(true);
    expect(f.interval.nominal_coverage).toBe(0.8);
    expect(f.interval.empirical_coverage).toBeNull();
    expect(f.interval.baseline_coverage).toBeNull();
    expect(f.interval.evaluation_rows).toBe(0);
  });
});
