/** Page numbers are shown five at a time: pages 1–5, then 6–10, and so on. */
export const PAGE_WINDOW = 5;

export function pageNumbers(page: number, pageCount: number) {
  const first = Math.floor((page - 1) / PAGE_WINDOW) * PAGE_WINDOW + 1;
  return Array.from({ length: Math.min(PAGE_WINDOW, pageCount - first + 1) }, (_, i) => first + i);
}

/** Classic pager: first, previous, a block of page numbers, next and last. Hidden for a single page. */
export function Pagination({ page, pageCount, onChange, label }: {
  page: number; pageCount: number; onChange: (page: number) => void; label: string;
}) {
  if (pageCount <= 1) return null;
  const numbers = pageNumbers(page, pageCount);
  const go = (target: number) => onChange(Math.min(pageCount, Math.max(1, target)));
  const last = numbers[numbers.length - 1];
  return <nav className="pp-pagination" aria-label={label}>
    <button type="button" className="pp-page-edge" onClick={() => go(1)} disabled={page === 1} aria-label="First page"><span aria-hidden="true">«</span></button>
    <button type="button" className="pp-page-step" onClick={() => go(page - 1)} disabled={page === 1} aria-label="Previous page"><span aria-hidden="true">‹</span><span className="pp-page-step-text">Previous</span></button>
    <span className="pp-page-numbers">
      {numbers[0] > 1 && <button type="button" className="pp-page-more" onClick={() => go(numbers[0] - 1)} aria-label={`Pages ${numbers[0] - PAGE_WINDOW} to ${numbers[0] - 1}`}>…</button>}
      {numbers.map(n => <button type="button" key={n} className="pp-page-number" onClick={() => go(n)} aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`}>{n}</button>)}
      {last < pageCount && <button type="button" className="pp-page-more" onClick={() => go(last + 1)} aria-label={`Pages ${last + 1} to ${Math.min(pageCount, last + PAGE_WINDOW)}`}>…</button>}
    </span>
    <button type="button" className="pp-page-step" onClick={() => go(page + 1)} disabled={page === pageCount} aria-label="Next page"><span className="pp-page-step-text">Next</span><span aria-hidden="true">›</span></button>
    <button type="button" className="pp-page-edge" onClick={() => go(pageCount)} disabled={page === pageCount} aria-label="Last page"><span aria-hidden="true">»</span></button>
  </nav>;
}
