/**
 * pages/Diary/GroupedEntries.jsx
 *
 * Renders entries grouped by a field — `chapter` for the campaign diary,
 * `category` for a player's, and whatever the Campaign Journal's group-by
 * selector is set to. Groups appear in the order their first entry does, so
 * the author's own ordering (session number, then date) decides the arc rather
 * than an alphabetical sort nobody asked for. `sortGroups` turns that off for
 * the groupings where first-appearance order is noise — grouping a journal by
 * owner wants the same five names in the same places every time.
 *
 * Ungrouped entries collect at the end under a muted heading rather than being
 * hidden or forced into a fake group.
 *
 * It also owns the search box, because filtering has to happen before grouping
 * for the group counts and the collapse state to mean anything.
 */
import { useEffect, useMemo, useState } from 'react';
import EntryList from './EntryList';
import { searchEntries } from './searchEntries';

const UNGROUPED = '\u0000ungrouped';

export function groupEntries(entries, field, { sortGroups = false } = {}) {
  // A field may be a key or a function of the entry: the journal's "owner" is
  // a character name falling back to a username, which is not a column.
  const keyOf = typeof field === 'function' ? field : (e) => e?.[field];

  const groups = new Map();
  for (const e of entries) {
    const key = (keyOf(e) || '').trim() || UNGROUPED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  let keys = [...groups.keys()].filter((k) => k !== UNGROUPED);
  if (sortGroups) keys.sort((a, b) => a.localeCompare(b));
  // The unfiled pile always goes last, whatever order it was first seen in.
  // Groups otherwise keep first-appearance order so the author's own sequence
  // decides the arc, but a heap of things nobody filed should never lead it.
  if (groups.has(UNGROUPED)) keys.push(UNGROUPED);

  // An all-ungrouped list is not really grouped at all — let the caller render
  // it flat rather than under a pointless heading.
  return keys.map((key) => ({
    key, items: groups.get(key), label: key === UNGROUPED ? null : key,
  }));
}

/** The search box. Its own component only so the two branches below share it. */
function SearchBox({ value, onChange, placeholder, matched, total }) {
  return (
    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[12rem]">
      <div className="relative flex-1 min-w-[10rem]">
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full bg-surface2 border border-border2 text-text pl-7 pr-2 py-1.5
                     rounded-sm text-sm font-body
                     focus:outline-none focus:border-[var(--gold-dim)] transition-colors"
        />
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-xs
                         pointer-events-none">🔍</span>
      </div>
      {/* Only once it is filtering — a permanent "12 of 12" is noise. */}
      {value.trim() && (
        <span className="text-[0.7rem] font-display uppercase tracking-wider text-text-muted">
          {matched} of {total}
        </span>
      )}
    </div>
  );
}

export default function GroupedEntries({
  entries, field, ungroupedLabel = 'Unfiled', sortGroups = false,
  searchable = false, searchFields, searchPlaceholder = 'Search notes…',
  toolbar = null,
  ...listProps
}) {
  // Collapsed, not expanded, is the state worth remembering — so this tracks
  // which groups are shut and everything else stays open by default. A group
  // created after a collapse therefore appears, rather than hiding silently.
  const [shut, setShut] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const toggle = (key) => setShut((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Regrouping by something else makes the old collapsed keys meaningless —
  // and worse, a key that happens to collide ("Documents" the category,
  // "Documents" the location) would arrive already shut for no visible reason.
  useEffect(() => { setShut(new Set()); }, [field]);

  const fields = useMemo(
    () => searchFields ?? ['title', 'body', typeof field === 'string' ? field : 'category'],
    [searchFields, field],
  );
  const shown = useMemo(
    () => (searchable ? searchEntries(entries, query, fields) : entries),
    [searchable, entries, query, fields],
  );

  const groups = groupEntries(shown, field, { sortGroups });
  const searching = searchable && !!query.trim();

  // `toolbar` may be a render function. Printing has to send exactly what is
  // on screen, and the filtering happens in here — so a Print button outside
  // this component can only see the unfiltered list and would print a
  // different set from the one you are looking at. A plain node still works;
  // only the callers that need the filtered view pass a function.
  const head = (searchable || toolbar) && (
    <div className="flex items-center gap-2 flex-wrap">
      {searchable && (
        <SearchBox
          value={query} onChange={setQuery} placeholder={searchPlaceholder}
          matched={shown.length} total={entries.length}
        />
      )}
      {typeof toolbar === 'function'
        ? toolbar({ shown, groups, query: query.trim() })
        : toolbar}
    </div>
  );

  // Nothing to group, or nothing worth grouping — in both cases the flat list
  // is the right answer, and it is the only thing that renders `emptyText`.
  if (!groups.length || (groups.length === 1 && groups[0].label === null)) {
    return (
      <div className="flex flex-col gap-3">
        {head}
        <EntryList
          {...listProps}
          entries={shown}
          emptyText={searching
            ? `Nothing matches “${query.trim()}”.`
            : listProps.emptyText}
        />
      </div>
    );
  }

  const allShut = groups.every((g) => shut.has(g.key));

  return (
    <div className="flex flex-col gap-4">
      {head}

      <div className="flex justify-end -mb-2">
        <button
          onClick={() => setShut(allShut ? new Set() : new Set(groups.map((g) => g.key)))}
          className="text-[0.7rem] font-display uppercase tracking-wider text-text-muted hover:text-gold"
        >
          {allShut ? 'Expand all' : 'Collapse all'}
        </button>
      </div>

      {groups.map((g) => {
        const open = !shut.has(g.key);
        return (
          <section key={g.key}>
            <button
              onClick={() => toggle(g.key)}
              aria-expanded={open}
              className={[
                'w-full flex items-center gap-2 text-left',
                'font-display uppercase tracking-widest text-[0.65rem] mb-2 pb-1 border-b transition-colors',
                g.label ? 'text-gold border-[var(--gold-dim)]' : 'text-text-muted border-border',
              ].join(' ')}
            >
              <span className={`inline-block transition-transform ${open ? '' : '-rotate-90'}`}>▾</span>
              <span className="flex-1">{g.label || ungroupedLabel}</span>
              <span className="text-text-muted normal-case tracking-normal">({g.items.length})</span>
            </button>
            {open && <EntryList entries={g.items} {...listProps} />}
          </section>
        );
      })}
    </div>
  );
}
