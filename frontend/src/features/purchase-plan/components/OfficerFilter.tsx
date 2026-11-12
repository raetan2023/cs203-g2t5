import { useEffect, useId, useRef, useState } from 'react';

export interface OfficerOption { id: string; label: string; count: number }

/**
 * A dropdown of checkboxes for choosing any number of officers, with a "Select all" box on top and a
 * search box for long lists. `selected` is empty when every officer is chosen.
 */
export function OfficerFilter({ options, selected, onChange }: {
  options: OfficerOption[]; selected: string[]; onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Unticking "Select all" leaves nobody ticked; the filter keeps its last choice until someone is ticked.
  const [none, setNone] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) { setNone(false); return; }
    const outside = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const allIds = options.map(option => option.id);
  const ticked = none ? [] : selected.length === 0 ? allIds : selected;
  const everyone = ticked.length === allIds.length;
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = ticked.length > 0 && !everyone;
  });
  function choose(ids: string[]) {
    setNone(false);
    // Everyone ticked is the same as no officer filter.
    onChange(ids.length === allIds.length ? [] : ids);
  }
  function toggle(id: string) {
    const next = ticked.includes(id) ? ticked.filter(item => item !== id) : [...ticked, id];
    if (next.length === 0) setNone(true); else choose(next);
  }
  const shown = options.filter(option => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  const summary = selected.length === 0 ? 'All officers'
    : selected.length === 1 ? options.find(option => option.id === selected[0])?.label ?? '1 officer' : `${selected.length} officers`;
  return <div className="pp-officer-filter" ref={box}>
    <button type="button" className="pp-filter-trigger" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <span className="pp-sr-only">Officers: </span>{summary}<span aria-hidden="true" className="pp-filter-caret">▾</span>
    </button>
    {open && <div className="pp-officer-panel" id={panelId} role="group" aria-label="Choose officers">
      {options.length > 6 && <input type="search" className="pp-officer-search" placeholder="Search officers" aria-label="Search officers"
        value={query} onChange={event => setQuery(event.target.value)} />}
      <label className="pp-officer-all">
        <input ref={selectAll} type="checkbox" checked={everyone} onChange={() => { if (everyone) setNone(true); else choose(allIds); }} />
        <span>Select all</span><span className="pp-officer-count">{options.reduce((sum, option) => sum + option.count, 0)}</span>
      </label>
      <ul>
        {shown.map(option => <li key={option.id}><label>
          <input type="checkbox" checked={ticked.includes(option.id)} onChange={() => toggle(option.id)} />
          <span>{option.label}</span><span className="pp-officer-count">{option.count}</span>
        </label></li>)}
        {shown.length === 0 && <li className="pp-officer-none">No officers match.</li>}
      </ul>
      {none && <p className="pp-officer-hint" role="status">Tick at least one officer.</p>}
    </div>}
  </div>;
}
