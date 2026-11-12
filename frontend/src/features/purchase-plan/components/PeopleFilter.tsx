import { useEffect, useId, useRef, useState } from 'react';
import type { OfficerOption } from './OfficerFilter';

/** A PM (or "No PM assigned") and the officers who report to them. */
export interface PeopleGroup { id: string; label: string; officers: OfficerOption[] }

/**
 * One dropdown for choosing officers, grouped under their PM: ticking a PM chooses their whole team.
 * `selected` holds officer ids and is empty when everyone is chosen.
 */
export function PeopleFilter({ groups, selected, onChange }: {
  groups: PeopleGroup[]; selected: string[]; onChange: (officerIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Unticking "Select all" leaves nobody ticked; the filter keeps its last choice until someone is ticked.
  const [none, setNone] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) { setNone(false); return; }
    const outside = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const allIds = groups.flatMap(group => group.officers.map(officer => officer.id));
  const ticked = none ? [] : selected.length === 0 ? allIds : selected;
  const everyone = ticked.length === allIds.length;
  function choose(ids: string[]) {
    setNone(false);
    // Everyone ticked is the same as no people filter.
    onChange(ids.length === allIds.length ? [] : ids);
  }
  function set(ids: string[], on: boolean) {
    const next = on ? [...new Set([...ticked, ...ids])] : ticked.filter(id => !ids.includes(id));
    if (next.length === 0) setNone(true); else choose(next);
  }
  const words = query.trim().toLowerCase();
  // A PM's name matching keeps their whole team; otherwise only matching officers show.
  const shown = groups.map(group => group.label.toLowerCase().includes(words) ? group
    : { ...group, officers: group.officers.filter(officer => officer.label.toLowerCase().includes(words)) })
    .filter(group => group.officers.length > 0);
  const total = groups.reduce((sum, group) => sum + group.officers.reduce((n, officer) => n + officer.count, 0), 0);
  const team = groups.find(group => group.officers.length === selected.length && group.officers.every(officer => selected.includes(officer.id)));
  const summary = selected.length === 0 ? 'Everyone'
    : team ? (team.id === 'no-pm' ? 'No PM assigned' : `${team.label}’s team`)
    : selected.length === 1 ? groups.flatMap(group => group.officers).find(officer => officer.id === selected[0])?.label ?? '1 person'
    : `${selected.length} people`;
  return <div className="pp-officer-filter" ref={box}>
    <button type="button" className="pp-filter-trigger" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <span className="pp-sr-only">People: </span><span className="pp-filter-label" title={summary}>{summary}</span><span aria-hidden="true" className="pp-filter-caret">▾</span>
    </button>
    {open && <div className="pp-officer-panel pp-people-panel" id={panelId} role="group" aria-label="Choose people">
      {allIds.length > 6 && <input type="search" className="pp-officer-search" placeholder="Search PMs or officers" aria-label="Search PMs or officers"
        value={query} onChange={event => setQuery(event.target.value)} />}
      <label className="pp-officer-all">
        <input type="checkbox" checked={everyone} onChange={() => { if (everyone) setNone(true); else choose(allIds); }} />
        <span>Select all</span><span className="pp-officer-count">{total}</span>
      </label>
      <ul>
        {shown.map(group => {
          const ids = group.officers.map(officer => officer.id);
          const on = ids.filter(id => ticked.includes(id)).length;
          return <li key={group.id} className="pp-people-group">
            <label className="pp-people-pm">
              {/* Ticked only when the whole team is chosen; ticking it chooses the whole team. */}
              <input type="checkbox" checked={on === ids.length} onChange={() => set(ids, on < ids.length)} />
              <span>{group.label}{group.id !== 'no-pm' && <span className="pp-people-role"> · PM</span>}</span>
              <span className="pp-officer-count">{group.officers.reduce((n, officer) => n + officer.count, 0)}</span>
            </label>
            <ul>{group.officers.map(officer => <li key={officer.id}><label>
              <input type="checkbox" checked={ticked.includes(officer.id)} onChange={() => set([officer.id], !ticked.includes(officer.id))} />
              <span>{officer.label}</span><span className="pp-officer-count">{officer.count}</span>
            </label></li>)}</ul>
          </li>;
        })}
        {shown.length === 0 && <li className="pp-officer-none">{groups.length === 0 ? 'No officers yet.' : 'Nobody matches.'}</li>}
      </ul>
      {none && <p className="pp-officer-hint" role="status">Tick at least one person.</p>}
    </div>}
  </div>;
}
