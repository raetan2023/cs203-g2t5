import { getStored } from './storedApi';

/** One headline from the GDELT news pipeline, as stored by the backend. */
export interface NewsItem {
  title: string;
  url: string;
  /** Publisher domain, e.g. reuters.com. */
  source: string;
  /** ISO timestamp when GDELT first saw the article. */
  seenAt: string;
  /** Classifier category, or null when the headline was not classified. */
  topic: string | null;
}

export interface NewsFeed {
  /** Newest first. */
  items: NewsItem[];
  /** When the pipeline last collected headlines, or null when nothing is stored. */
  updatedAt: string | null;
}

export type ReadNews = () => Promise<NewsFeed>;

/** Plain names for the news classifier's categories (ridge-regression-model/news/classifier.py). */
const TOPICS: Record<string, string> = {
  sanctions: 'Sanctions',
  shipping_disruption: 'Shipping disruption',
  refinery_outage: 'Refinery outage',
  production_disruption: 'Supply disruption',
  production_decision: 'OPEC and supply',
  oil_infrastructure_conflict: 'Conflict and infrastructure',
  strategic_stock_release: 'Strategic reserves',
  demand_shock: 'Demand shock',
  other: 'General',
};

export function topicLabel(topic: string | null) {
  return topic ? TOPICS[topic] ?? 'General' : 'Unclassified';
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isTime = (value: unknown): value is string => isText(value) && !Number.isNaN(Date.parse(value));

function isWebLink(value: string) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** Throws when the response is malformed; drops individual headlines that cannot be shown or linked safely. */
export function parseNewsFeed(data: unknown): NewsFeed {
  const body = data as { storage?: unknown; items?: unknown; updatedAt?: unknown } | null;
  if (!body || body.storage !== 'supabase' || !Array.isArray(body.items)) throw new Error('The stored news response was invalid.');
  const items = (body.items as Record<string, unknown>[]).flatMap(item => {
    if (!item || !isText(item.title) || !isText(item.url) || !isWebLink(item.url) || !isTime(item.seenAt)) return [];
    return [{
      title: item.title.trim(), url: item.url, seenAt: item.seenAt,
      source: isText(item.source) ? item.source : new URL(item.url).hostname.replace(/^www\./, ''),
      topic: isText(item.topic) ? item.topic : null,
    }];
  });
  return { items, updatedAt: isTime(body.updatedAt) ? body.updatedAt : null };
}

export function createStoredNewsReader(): ReadNews {
  return async () => parseNewsFeed(await getStored('/api/v1/news/latest?limit=40', 'Could not read the latest news.'));
}
