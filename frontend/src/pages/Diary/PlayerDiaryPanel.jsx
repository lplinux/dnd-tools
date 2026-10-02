/**
 * pages/Diary/PlayerDiaryPanel.jsx
 *
 * DM: one tab per player, read-only. Stacking every player's diary in one
 * scroll made it impossible to read any single one — and the DM may read these
 * but never rewrite them, which is what "private to the player" has to mean to
 * be worth the name.
 *
 * Player: their own entries, editable. (Reached from the PC Sheet's Diary tab;
 * this component is shared so both views stay identical.)
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import GroupedEntries from './GroupedEntries';

export default function PlayerDiaryPanel({ isDM, entries, myPlayerId, onNew, onEdit, onDelete }) {
  const byPlayer = new Map();
  if (isDM) {
    for (const e of entries) {
      const name = e.player_name || 'Unassigned';
      if (!byPlayer.has(name)) byPlayer.set(name, []);
      byPlayer.get(name).push(e);
    }
  }
  const names = [...byPlayer.keys()].sort((a, b) => a.localeCompare(b));
  const [active, setActive] = useState(null);

  // Settle on a tab once the data arrives, and recover if the selected player
  // disappears (campaign switched, player deleted).
  useEffect(() => {
    if (!isDM) return;
    if (names.length && (active === null || !byPlayer.has(active))) setActive(names[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDM, names.join('|')]);

  if (isDM) {
    if (!names.length) {
      return <p className="text-text-dim text-sm italic text-center py-8">No player has written a diary entry yet.</p>;
    }
    const list = byPlayer.get(active) ?? [];
    return (
      <div className="flex flex-col gap-3">
        <div className="flex overflow-x-auto border-b border-border">
          {names.map((n) => (
            <button
              key={n}
              onClick={() => setActive(n)}
              className={[
                'px-3 py-2 font-display uppercase tracking-wider text-[0.62rem] whitespace-nowrap',
                'border-r border-border transition-colors flex-shrink-0',
                n === active
                  ? 'text-gold border-b-2 border-b-gold bg-surface2 -mb-px'
                  : 'text-text-dim hover:text-gold hover:bg-surface2',
              ].join(' ')}
            >
              {n}
              <span className="ml-1.5 text-text-muted">{byPlayer.get(n).length}</span>
            </button>
          ))}
        </div>
        <p className="text-[0.7rem] text-text-muted italic">
          {active}&apos;s diary, read-only — you can read it, but only they can edit or delete their own entries.
        </p>
        <GroupedEntries entries={list} field="category" ungroupedLabel="Uncategorised" readOnly />
      </div>
    );
  }

  if (!myPlayerId) {
    return (
      <p className="text-text-dim text-sm italic text-center py-8">
        You have no character in this campaign yet — ask your DM to assign one.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="text-[0.7rem] text-text-muted italic flex-1">
          Private to you. Your DM can read these; no other player can.
        </p>
        <Button variant="accent" onClick={onNew}>＋ New entry</Button>
      </div>
      <GroupedEntries
        entries={entries}
        field="category"
        ungroupedLabel="Uncategorised"
        onEdit={onEdit}
        onDelete={onDelete}
        emptyText="Your diary is empty. Write up a session and it stays yours."
      />
    </div>
  );
}
