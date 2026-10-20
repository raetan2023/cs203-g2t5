import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BrentMarketPanel from './BrentMarketPanel';

const data = {
  storage: 'supabase', fetchedAt: '2026-10-20T05:00:00Z',
  ticker: { value: 126.55, currency: 'USD', unit: 'USD/barrel', observedDate: '2026-10-14',
    source: 'FRED', valueType: 'OBSERVED', changeAbs: 0.77, changePct: 0.6122 },
  history: [{ date: '2026-10-14', value: 126.55 }],
};

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('stored Brent panel', () => {
  it('loads the database endpoint and displays the real date separately from fetch time', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => data });
    vi.stubGlobal('fetch', fetcher);
    render(<BrentMarketPanel />);
    expect(await screen.findByText('$126.55')).toBeInTheDocument();
    expect(screen.getByText('Prices may be older than today.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Observation date:').parentElement).toHaveTextContent('2026-10-14');
    expect(fetcher.mock.calls[0][0]).toMatch(/\/api\/v1\/market\/brent$/);
  });

  it('does not show an example price for an empty database', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    render(<BrentMarketPanel />);
    expect(await screen.findByText(/No observed Brent prices/)).toBeInTheDocument();
    expect(screen.queryByText('$78.45')).not.toBeInTheDocument();
  });

  it('does not fall back to the external provider when the database fails', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetcher);
    render(<BrentMarketPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the backend connection');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refreshes after a minute and retains clearly marked old data if refresh fails', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => data })
      .mockRejectedValueOnce(new Error('Offline'));
    vi.stubGlobal('fetch', fetcher);
    render(<BrentMarketPanel />);
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Showing the last successfully loaded records');
    expect(screen.getByText('$126.55')).toBeInTheDocument();
  });
});
