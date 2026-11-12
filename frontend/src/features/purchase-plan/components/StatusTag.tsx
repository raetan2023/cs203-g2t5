import { Icon } from './Primitives';

export type TagKind = 'to-buy' | 'overdue' | 'purchased' | 'rejected' | 'withdrawn' | 'closed';

/** Each status has its own symbol, so the tags differ by shape as well as colour. */
const TAGS: Record<TagKind, { label: string; icon: Parameters<typeof Icon>[0]['name'] }> = {
  'to-buy': { label: 'to buy', icon: 'clock' },
  overdue: { label: 'overdue', icon: 'alert' },
  purchased: { label: 'purchased', icon: 'check-circle' },
  rejected: { label: 'rejected', icon: 'cross-circle' },
  withdrawn: { label: 'withdrawn', icon: 'minus-circle' },
  closed: { label: 'closed', icon: 'slash-circle' },
};

/** A card's status, shown in its top-right corner. */
export function StatusTag({ kind }: { kind: TagKind }) {
  return <span className={`pp-tag pp-tag--${kind}`}><Icon name={TAGS[kind].icon} />{TAGS[kind].label}</span>;
}

/** The card's top line: quantity and deadline on the left, the status tag (if any) on the right. */
export function CardTop({ quantity, deadline, due, tag }: { quantity: string; deadline: string; due: string; tag?: TagKind }) {
  return <div className="pp-card-top">
    <h3 className="pp-summary-title">
      <span className="pp-summary-qty">
        <span className="pp-sr-only">{quantity} MT</span>
        <span aria-hidden="true">{quantity}<span className="pp-summary-unit">MT</span></span>
      </span>{' '}
      <span className="pp-summary-due">Due <time dateTime={deadline}>{due}</time></span>
    </h3>
    {tag && <StatusTag kind={tag} />}
  </div>;
}
