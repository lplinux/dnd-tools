/**
 * pages/Diary/GroupedEntries.jsx
 *
 * Renders entries grouped by a free-text field — `chapter` for the campaign
 * diary, `category` for a player's. Groups appear in the order their first
 * entry does, so the author's own ordering (session number, then date) decides
 * the arc rather than an alphabetical sort nobody asked for.
 *
 * Ungrouped entries collect at the end under a muted heading rather than being
 * hidden or forced into a fake group.
 */
import { useState } from 'react';
import EntryList from './EntryList';

const UNGROUPED = '\u0000ungrouped';

export function groupEntries(entries, field) {
  const groups = new Map();
  for (const e of entries) {
    const key = (e[field] || '').trim() || UNGROUPED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  // An all-ungrouped list is not really grouped at all — let the caller render
  // it flat rather than under a pointless heading.
  return [...groups.entries()].map(([key, items]) => ({
    key, items, label: key === UNGROUPED ? null : key,
  }));
}

export default function GroupedEntries({
  entries, field, ungroupedLabel = 'Unfiled', ...listProps
}) {
  // Collapsed, not expanded, is the state worth remembering — so this tracks
  // which groups are shut and everything else stays open by default. A group
  // created after a collapse therefore appears, rather than hiding silently.
  const [shut, setShut] = useState(() => new Set());
  const toggle = (key) => setShut((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const groups = groupEntries(entries, field);
  if (groups.length === 1 && groups[0].label === null) {
    return <EntryList entries={entries} {...listProps} />;
  }

  const allShut = groups.every((g) => shut.has(g.key));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end -mb-2">
        <button
          onClick={() => setShut(allShut ? new Set() : new Set(groups.map((g) => g.key)))}
          className="text-[0.6rem] font-display uppercase tracking-wider text-text-muted hover:text-gold"
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
