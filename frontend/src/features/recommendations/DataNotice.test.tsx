import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ReadyForecast } from '../forecast/apiService';
import { buildMockForecast } from '../forecast/mockService';
import { DataNotice } from './DataNotice';

const base = buildMockForecast(14) as ReadyForecast;
const forecast = (overrides: Partial<ReadyForecast>) => ({ ...base, synthetic: false, anchor_quote_date: '2026-10-26',
  source_dates: { mgo: '2026-10-26' }, model_version: `ridge-14d-sha256-${'a'.repeat(64)}`,
  interval: { ...base.interval, method: 'experimental_gdelt_scaled_quantiles' }, ...overrides }) as ReadyForecast;
const note = () => screen.getByRole('note', { name: 'Data freshness' });

it('warns once about a stale quote, estimated news and the unmeasured range, and offers a refresh', () => {
  const onRefresh = vi.fn();
  render(<DataNotice forecast={forecast({ source_dates: { mgo: '2026-10-26', gdelt_estimated: '2026-11-05' } })} today="2026-11-06" onRefresh={onRefresh} />);
  expect(screen.getByRole('heading', { name: 'Get a current supplier quote before you buy' })).toBeVisible();
  expect(note()).toHaveTextContent('Prices use the MGO quote from Mon 26 Oct (11 days old).');
  expect(note()).toHaveTextContent('News inputs for 05 Nov 2026 include API-supplied estimates');
  expect(note()).toHaveTextContent('its coverage hasn’t been measured');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
  expect(onRefresh).toHaveBeenCalledOnce();
});

it('keeps older and estimated news dates separate when they differ', () => {
  render(<DataNotice forecast={forecast({ source_dates: { mgo: '2026-10-26', gdelt_fallback: '2026-11-01', gdelt_estimated: '2026-10-31' } })} today="2026-11-03" />);
  expect(note()).toHaveTextContent('news uses article count and tone from 01 Nov 2026');
  expect(note()).toHaveTextContent('News older than seven days is excluded.');
  expect(note()).toHaveTextContent('News inputs for 31 Oct 2026');
});

it('says so when the central price is only the last quote', () => {
  render(<DataNotice forecast={forecast({ model_version: 'last-quote' })} today="2026-10-27" />);
  expect(note()).toHaveTextContent('No current Ridge forecast is available');
});

it('says estimated news moves the price when the news-aware model produced it', () => {
  render(<DataNotice forecast={forecast({ model_version: `ridge-decision-gdelt-14d-sha256-${'a'.repeat(64)}`,
    source_dates: { mgo: '2026-10-26', gdelt_estimated: '2026-11-05' } })} today="2026-11-06" />);
  expect(note()).toHaveTextContent('which affect the model price and its range');
  expect(note()).not.toHaveTextContent('don’t move the central price');
});

it('is a quiet line, with no warning, when the data is current', () => {
  render(<DataNotice forecast={forecast({})} today="2026-10-27" onRefresh={() => {}} />);
  expect(note()).toHaveTextContent('Prices use the MGO quote from Mon 26 Oct (1 day old).');
  expect(note()).toHaveTextContent('Confirm a current supplier quote before you buy.');
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('shows nothing before a forecast has loaded', () => {
  const { container } = render(<DataNotice today="2026-11-06" />);
  expect(container).toBeEmptyDOMElement();
});
