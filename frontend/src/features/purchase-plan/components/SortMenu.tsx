import { useEffect, useId, useRef, useState } from 'react';

export interface SortGroup<T extends string> { heading: string; options: { id: T; label: string }[] }

/** A dropdown in the same style as the officer filter, with sort choices grouped under headings. */
export function SortMenu<T extends string>({ groups, value, onChange }: {
  groups: SortGroup<T>[]; value: T; onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panelId = useId(), name = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const group = groups.find(g => g.options.some(option => option.id === value));
  const current = group?.options.find(option => option.id === value);
  return <div className="pp-officer-filter" ref={box}>
    <button type="button" className="pp-filter-trigger pp-sort-trigger" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(v => !v)}>
      <span className="pp-sr-only">Sort: </span><span className="pp-filter-label" title={`${group?.heading}: ${current?.label}`}>{group?.heading}: {current?.label}</span><span aria-hidden="true" className="pp-filter-caret">▾</span>
    </button>
    {open && <div className="pp-officer-panel pp-sort-panel" id={panelId} role="radiogroup" aria-label="Sort requests">
      {groups.map(group => <div key={group.heading} className="pp-sort-group">
        <p className="pp-sort-heading">{group.heading}</p>
        {group.options.map(option => <label key={option.id}>
          <input type="radio" name={name} aria-label={`${group.heading}: ${option.label}`} checked={option.id === value} onChange={() => { onChange(option.id); setOpen(false); }} />
          <span>{option.label}</span>
        </label>)}
      </div>)}
    </div>}
  </div>;
}
