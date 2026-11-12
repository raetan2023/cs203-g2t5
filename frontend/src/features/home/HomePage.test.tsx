import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomePage, greetingFor, homeAction } from './HomePage';
import { parseMgoQuote, type MgoQuote } from './marketQuote';
import { parseNewsFeed, type NewsFeed, type NewsItem } from './newsFeed';
import { parseMarketAlerts, type NewsSpike, type PriceMove } from './newsAlerts';

const afternoon = new Date(2026, 9, 28, 15, 0);
const quote: MgoQuote = { value: 1351.5, unit: 'USD/MT', currency: 'USD', changeAbs: -4.5, changePct: -0.33, observedDate: '2026-10-26', history: [1356, 1351.5] };

describe('Home greeting', () => {
  it('greets by time of day with the full name and shows the operational date', () => {
    render(<HomePage displayName=" Jordan Lee " today="2026-10-28" now={afternoon} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good afternoon, Jordan Lee');
    expect(screen.getByText('Wednesday 28 Oct 2026')).toBeVisible();
    expect([5, 11, 12, 17, 18, 23].map(greetingFor)).toEqual(['Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening']);
  });

  it('keeps one accessible heading when a long name moves to a second line', () => {
    render(<HomePage displayName="Alexandrina Montgomery-Fitzwilliam" today="2026-10-28" now={afternoon} />);
    expect(screen.getByRole('heading', { name: 'Good afternoon, Alexandrina Montgomery-Fitzwilliam' })).toBeVisible();
    expect(screen.getByText('Alexandrina Montgomery-Fitzwilliam')).toHaveClass('bb-home-name');
  });
});

describe('Home primary action', () => {
  it('does not turn the whole page into a link', async () => {
    window.history.replaceState(null, '', '/home');
    const { container } = render(<HomePage displayName="Jordan" role="org:officer" marketAvailable now={afternoon} />);
    expect(container.querySelector('.bb-home-plan-link')).toBeNull();
    await userEvent.click(screen.getByRole('heading', { level: 1 }));
    expect(window.location.pathname).toBe('/home');
  });

  it.each([
    ['org:officer', 'Go to your plans', '/purchase-plans'],
    ['org:manager', 'Approval inbox', '/purchase-plans#approval-inbox'],
  ])('links %s to the matching page', (role, name, href) => {
    render(<HomePage displayName="Jordan" role={role} marketAvailable now={afternoon} />);
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
  });

  it('opens organisation settings for an admin, who has no plan access', async () => {
    const manage = vi.fn();
    render(<HomePage displayName="Jordan" role="org:admin" canReadPlans={false} onManageOrganisation={manage} now={afternoon} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage organisation' }));
    expect(manage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: 'Open purchase plans' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /plans/i })).not.toBeInTheDocument();
  });

  it('falls back when the target is not available', () => {
    expect(homeAction({ role: 'org:admin', canReadPlans: false })).toBeNull();
    expect(homeAction({ canReadPlans: false })).toBeNull();
  });
});

describe('Home MGO price card', () => {
  it('shows the latest stored quote with its own date and links to the market dashboard', async () => {
    render(<HomePage displayName="Jordan" marketAvailable readQuote={async () => quote} today="2026-10-28" now={afternoon} />);
    const card = await screen.findByRole('link', { name: 'Singapore MGO price USD 1,351.50 per tonne, 26 October, down 0.33%. Open market dashboard.' });
    expect(card).toHaveAttribute('href', '/market-dashboard');
    expect(card).toHaveTextContent('Singapore MGO · 26 Oct');
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

const headline = (index: number, overrides: Partial<NewsItem> = {}): NewsItem => ({
  title: `Headline ${index}`, url: `https://example.com/${index}`, source: 'reuters.com',
  seenAt: '2026-11-01T22:30:00Z', topic: 'production_decision', ...overrides,
});
const morning = new Date('2026-11-02T01:00:00Z'); // 09:00 Monday in Singapore

describe('Home latest news', () => {
  it('lists headlines with Singapore date, source and plain topic, each linking to its source', async () => {
    const feed: NewsFeed = { updatedAt: '2026-11-02T00:00:00Z', items: [
      headline(1, { title: 'OPEC+ producers hold December oil output steady' }),
      headline(2, { topic: 'shipping_disruption', source: 'binance.com' }),
      headline(3, { topic: null }),
    ] };
    render(<HomePage displayName="Jordan" readNews={async () => feed} now={morning} />);
    const link = await screen.findByRole('link', { name: 'OPEC+ producers hold December oil output steady, opens in a new tab' });
    expect(link).toHaveAttribute('href', 'https://example.com/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Mon 02 Nov');
    expect(rows[0]).toHaveTextContent('reuters.com');
    expect(rows[0]).toHaveTextContent('OPEC and supply');
    expect(rows[1]).toHaveTextContent('Shipping disruption');
    expect(rows[2]).toHaveTextContent('Unclassified');
    expect(screen.getByText('Updated 08:00 today')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Latest news' })).toHaveAttribute('href', '#latest-news');
  });

  it('shows eight headlines at a time', async () => {
    const items = Array.from({ length: 11 }, (_, index) => headline(index));
    render(<HomePage displayName="Jordan" readNews={async () => ({ updatedAt: null, items })} now={morning} />);
    await screen.findByRole('link', { name: /Headline 0/ });
    expect(screen.getAllByRole('row')).toHaveLength(1 + 8);
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getAllByRole('row')).toHaveLength(1 + 11);
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('reports loading, empty and failed news without inventing headlines', async () => {
    let resolve!: (value: NewsFeed) => void;
    const { unmount } = render(<HomePage displayName="Jordan" readNews={() => new Promise(done => { resolve = done; })} now={morning} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading headlines…');
    resolve({ updatedAt: null, items: [] });
    expect(await screen.findByText('No headlines stored yet.')).toBeVisible();
    unmount();
    render(<HomePage displayName="Jordan" readNews={async () => { throw new Error('offline'); }} now={morning} />);
    expect(await screen.findByText('News is unavailable right now.')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('is hidden when no news source is connected', () => {
    render(<HomePage displayName="Jordan" now={afternoon} />);
    expect(screen.queryByRole('heading', { name: 'Latest news' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Latest news/ })).not.toBeInTheDocument();
  });
});

describe('parseNewsFeed', () => {
  it('keeps safe web links, fills a missing source from the URL and rejects malformed responses', () => {
    expect(parseNewsFeed({ storage: 'supabase', updatedAt: '2026-11-02T00:00:00Z', items: [
      { title: ' Kept ', url: 'https://www.reuters.com/a', seenAt: '2026-11-01T22:30:00Z', topic: 'sanctions' },
      { title: 'Script', url: 'javascript:alert(1)', seenAt: '2026-11-01T22:30:00Z' },
      { title: 'No time', url: 'https://example.com/b', seenAt: 'soon' },
      null,
    ] })).toEqual({ updatedAt: '2026-11-02T00:00:00Z', items: [
      { title: 'Kept', url: 'https://www.reuters.com/a', source: 'reuters.com', seenAt: '2026-11-01T22:30:00Z', topic: 'sanctions' },
    ] });
    expect(() => parseNewsFeed({ items: [] })).toThrow();
    expect(() => parseNewsFeed({ storage: 'supabase', items: null })).toThrow();
  });
});

const spike = (overrides: Partial<NewsSpike> = {}): NewsSpike => ({
  state: 'alert', articleCount: 150, baselineCount: 70, windowEnd: '2026-11-05T00:17:00Z',
  topTopics: [{ topic: 'shipping_disruption', count: 30 }, { topic: 'sanctions', count: 12 }], ...overrides,
});
const move = (overrides: Partial<PriceMove> = {}): PriceMove => ({
  state: 'normal', observedDate: '2026-11-04', changePct: 0.4, typicalChangePct: 0.8, ...overrides,
});
const tile = (name: string) => screen.getByRole('heading', { level: 3, name }).closest('li')!;

describe('Home market alerts', () => {
  it('raises a news spike with its size, window and leading topics, and names a calm price move as normal', async () => {
    render(<HomePage displayName="Jordan" readAlerts={async () => ({ news: spike(), price: move() })} now={morning} />);
    await screen.findByRole('heading', { level: 3, name: 'News spike' });
    expect(tile('News spike')).toHaveTextContent('Alert');
    expect(tile('News spike')).toHaveTextContent('150 headlines in the 24 hours to 08:17 Thu 05 Nov, 2.1 times the usual 70.');
    expect(tile('News spike')).toHaveTextContent('Most coverage: Shipping disruption, Sanctions.');
    expect(tile('Singapore MGO price move')).toHaveTextContent('Normal');
    expect(tile('Singapore MGO price move')).toHaveTextContent('Up 0.4% on 4 Nov, within a typical daily move of 0.8%.');
  });

  it('raises an unusual price move and keeps normal news volume calm', async () => {
    render(<HomePage displayName="Jordan" readAlerts={async () => ({ news: spike({ state: 'normal', articleCount: 72, topTopics: [] }), price: move({ state: 'alert', changePct: -4.25 }) })} now={morning} />);
    await screen.findByRole('heading', { level: 3, name: 'News spike' });
    expect(tile('News spike')).toHaveTextContent('72 headlines in the 24 hours to 08:17 Thu 05 Nov, in line with the usual 70.');
    expect(tile('News spike')).not.toHaveTextContent('Most coverage');
    expect(tile('Singapore MGO price move')).toHaveTextContent('Alert');
    expect(tile('Singapore MGO price move')).toHaveTextContent('Down 4.25% on 4 Nov, well outside a typical daily move of 0.8%.');
  });

  it('says when there is too little history or nothing stored, instead of reporting calm', async () => {
    const { unmount } = render(<HomePage displayName="Jordan" readAlerts={async () => ({
      news: spike({ state: 'insufficient', baselineCount: null }), price: move({ state: 'insufficient', typicalChangePct: null }) })} now={morning} />);
    await screen.findByRole('heading', { level: 3, name: 'News spike' });
    expect(tile('News spike')).toHaveTextContent('Not enough history');
    expect(tile('News spike')).toHaveTextContent('Too few earlier windows are stored to judge a spike.');
    expect(tile('Singapore MGO price move')).toHaveTextContent('Too few earlier prices are stored to judge the move.');
    expect(screen.queryByText('Normal')).not.toBeInTheDocument();
    unmount();
    render(<HomePage displayName="Jordan" readAlerts={async () => ({ news: null, price: null })} now={morning} />);
    await screen.findByText('No complete news window is stored yet.');
    expect(screen.getByText('No MGO price is stored yet.')).toBeVisible();
    expect(screen.getAllByText('No data')).toHaveLength(2);
  });

  it('reports loading and failure, and is hidden when no news source is connected', async () => {
    let fail!: (error: Error) => void;
    const { unmount } = render(<HomePage displayName="Jordan" readAlerts={() => new Promise((_, reject) => { fail = reject; })} now={morning} />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking for unusual activity…');
    fail(new Error('offline'));
    expect(await screen.findByText('Market alerts are unavailable right now.')).toBeVisible();
    expect(screen.queryByText('Normal')).not.toBeInTheDocument();
    unmount();
    render(<HomePage displayName="Jordan" now={afternoon} />);
    expect(screen.queryByRole('heading', { name: 'Market alerts' })).not.toBeInTheDocument();
  });
});

describe('parseMarketAlerts', () => {
  it('reads both signals, allows either to be missing and rejects malformed responses', () => {
    expect(parseMarketAlerts({ storage: 'supabase', news: {
      state: 'ALERT', articleCount: 150, baselineCount: 70, baselineWindows: 7, windowStart: '2026-11-04T00:17:00Z', windowEnd: '2026-11-05T00:17:00Z',
      topTopics: [{ topic: 'sanctions', count: 4 }, { topic: 7 }], query: 'oil',
    }, price: { state: 'NORMAL', seriesKey: 'SGP_MGO_OBSERVED', observedDate: '2026-11-04', value: 1300, changePct: 0.4, typicalChangePct: 0.8, returns: 20 } }))
      .toEqual({ news: spike({ topTopics: [{ topic: 'sanctions', count: 4 }] }), price: move() });
    expect(parseMarketAlerts({ storage: 'supabase', news: null, price: null })).toEqual({ news: null, price: null });
    expect(() => parseMarketAlerts({ news: null, price: null })).toThrow();
    expect(() => parseMarketAlerts({ storage: 'supabase', news: { state: 'SPIKE', articleCount: 1, windowEnd: '2026-11-05T00:17:00Z' } })).toThrow();
    expect(() => parseMarketAlerts({ storage: 'supabase', price: { state: 'NORMAL', observedDate: 'today' } })).toThrow();
  });
});
