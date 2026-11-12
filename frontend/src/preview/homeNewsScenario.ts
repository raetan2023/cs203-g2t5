// Preview-only fixture: Home with the GDELT news feed and market alerts, which the preview otherwise leaves out.
// Long headlines and sources are deliberate so phone layouts are checked against real-world lengths.
import type { NewsFeed } from '../features/home/newsFeed';
import type { MarketAlerts } from '../features/home/newsAlerts';

const seen = (hoursAgo: number) => new Date(Date.UTC(2025, 9, 24, 6) - hoursAgo * 3_600_000).toISOString();

export const PREVIEW_NEWS: NewsFeed = {
  updatedAt: seen(1),
  items: [
    { title: 'OPEC+ producers agree to hold December oil output steady as demand outlook weakens across Asia', url: 'https://example.com/opec', source: 'reuters.com', seenAt: seen(2), topic: 'production_decision' },
    { title: 'Red Sea diversions keep tanker rates elevated for a third straight week', url: 'https://example.com/red-sea', source: 'lloydslist.maritimeintelligence.informa.com', seenAt: seen(5), topic: 'shipping_disruption' },
    { title: 'Singapore bunker sales edge higher in September on stronger marine gasoil demand', url: 'https://example.com/sg-bunkers', source: 'businesstimes.com.sg', seenAt: seen(9), topic: null },
    { title: 'New sanctions target shadow-fleet tankers carrying Russian crude', url: 'https://example.com/sanctions', source: 'ft.com', seenAt: seen(14), topic: 'sanctions' },
    { title: 'Refinery outage in the US Gulf Coast tightens diesel supply', url: 'https://example.com/refinery', source: 'bloomberg.com', seenAt: seen(20), topic: 'refinery_outage' },
  ],
};

export const PREVIEW_ALERTS: MarketAlerts = {
  news: { state: 'alert', articleCount: 150, baselineCount: 70, windowEnd: seen(1), topTopics: [{ topic: 'shipping_disruption', count: 30 }, { topic: 'sanctions', count: 12 }] },
  price: { state: 'normal', observedDate: '2025-10-22', changePct: 0.33, typicalChangePct: 0.8 },
};
