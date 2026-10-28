import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomePage, greetingFor, homeAction } from './HomePage';
import { parseMgoQuote, type MgoQuote } from './marketQuote';

const afternoon = new Date(2026, 9, 28, 15, 0);
const quote: MgoQuote = { value: 1351.5, unit: 'USD/MT', currency: 'USD', changeAbs: -4.5, changePct: -0.33, observedDate: '2026-10-26', history: [1356, 1351.5] };

describe('Home greeting', () => {
  it('greets by time of day with the full name and shows the operational date', () => {
    render(<HomePage displayName=" Jordan Lee " today="2026-10-28" now={afternoon} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good afternoon, Jordan Lee');
    expect(screen.getByText('Wednesday 28 October')).toBeVisible();
    expect([5, 11, 12, 17, 18, 23].map(greetingFor)).toEqual(['Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening']);
  });

  it('keeps one accessible heading when a long name moves to a second line', () => {
    render(<HomePage displayName="Alexandrina Montgomery-Fitzwilliam" today="2026-10-28" now={afternoon} />);
    expect(screen.getByRole('heading', { name: 'Good afternoon, Alexandrina Montgomery-Fitzwilliam' })).toBeVisible();
    expect(screen.getByText('Alexandrina Montgomery-Fitzwilliam')).toHaveClass('bb-home-name');
  });
});

describe('Home primary action', () => {
  it.each([
    ['org:buyer', 'Go to your plans', '/purchase-plans'],
    ['org:manager', 'Plans for approval', '/purchase-plans#approval-inbox'],
    ['org:analyst', 'Market dashboard', '/market-dashboard'],
  ])('links %s to the matching page', (role, name, href) => {
    render(<HomePage displayName="Jordan" role={role} marketAvailable now={afternoon} />);
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
  });

  it('opens organisation settings for an admin, who has no plan access', async () => {
    const manage = vi.fn();
    render(<HomePage displayName="Jordan" role="org:admin" canReadPlans={false} onManageOrganisation={manage} now={afternoon} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage organisation' }));
    expect(manage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: /plans/i })).not.toBeInTheDocument();
  });

  it('falls back when the target is not available', () => {
    expect(homeAction({ role: 'org:analyst', canReadPlans: true, marketAvailable: false })).toEqual({ label: 'View purchase plans', href: '/purchase-plans' });
    expect(homeAction({ role: 'org:admin', canReadPlans: false, marketAvailable: true })).toBeNull();
    expect(homeAction({ canReadPlans: false, marketAvailable: true })).toBeNull();
  });
});

describe('Home MGO price card', () => {
  it('shows the latest stored estimate with its own date and links to the market dashboard', async () => {
    render(<HomePage displayName="Jordan" marketAvailable readQuote={async () => quote} today="2026-10-28" now={afternoon} />);
    const card = await screen.findByRole('link', { name: 'Singapore MGO estimate USD 1,351.50 per tonne, 26 October, down 0.33%. Open market dashboard.' });
    expect(card).toHaveAttribute('href', '/market-dashboard');
    expect(card).toHaveTextContent('Singapore MGO est. · 26 Oct');
    expect(card).toHaveTextContent('▼ 0.33%');
  });

  it('reports loading, missing and failed prices without inventing a value', async () => {
    let resolve!: (value: MgoQuote | null) => void;
    const { unmount } = render(<HomePage displayName="Jordan" readQuote={() => new Promise(done => { resolve = done; })} now={afternoon} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading price…');
    resolve(null);
    expect(await screen.findByText('No price stored yet')).toBeVisible();
    unmount();
    render(<HomePage displayName="Jordan" readQuote={async () => { throw new Error('offline'); }} now={afternoon} />);
    expect(await screen.findByText('Price unavailable right now')).toBeVisible();
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });

  it('is hidden when no market source is connected', () => {
    render(<HomePage displayName="Jordan" now={afternoon} />);
    expect(screen.queryByText(/Singapore MGO/)).not.toBeInTheDocument();
  });
});

describe('parseMgoQuote', () => {
  const stored = (series: unknown[]) => ({ storage: 'supabase', missing: [], series });
  it('reads the observed MGO series and orders its history oldest first', () => {
    expect(parseMgoQuote(stored([
      { ticker: { seriesKey: 'BRENT_CRUDE', value: 80, observedDate: '2026-10-27' }, history: [] },
      { ticker: { seriesKey: 'SGP_MGO_OBSERVED', unit: 'USD/MT', currency: 'USD', value: 1351.5, changeAbs: null, changePct: null, observedDate: '2026-10-26' },
        history: [{ date: '2026-10-26', value: 1351.5 }, { date: '2026-10-20', value: 1340 }] },
    ]))).toEqual({ value: 1351.5, unit: 'USD/MT', currency: 'USD', changeAbs: null, changePct: null, observedDate: '2026-10-26', history: [1340, 1351.5] });
  });
  it('returns null when no MGO quote is stored and rejects malformed responses', () => {
    expect(parseMgoQuote(stored([]))).toBeNull();
    expect(() => parseMgoQuote({ series: [] })).toThrow();
    expect(() => parseMgoQuote(stored([{ ticker: { seriesKey: 'SGP_MGO_OBSERVED', value: '1351', observedDate: '2026-10-26' }, history: [] }]))).toThrow();
  });
});
