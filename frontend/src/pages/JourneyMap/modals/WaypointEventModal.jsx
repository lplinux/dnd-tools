/**
 * pages/JourneyMap/modals/WaypointEventModal.jsx
 *
 * Link timeline events to a path waypoint. Loads all campaign timeline events
 * (filtered to the path's player when its tracker is a player), supports search
 * and multi-select, pre-populated from the waypoint's existing links.
 *
 * @param {object|null} ctx  { pathId, wpIdx } | null
 */

import { useEffect, useMemo, useState } from 'react';
import { Modal, Button } from '@/components/ui';
import { sameId, parseWaypoints } from '@/components/map/geometry';

export default function WaypointEventModal({ ctx, jm, onClose }) {
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [query, setQuery] = useState('');
  const [filterName, setFilterName] = useState(null);
  const [title, setTitle] = useState('Link events');

  useEffect(() => {
    if (!ctx) return;
    const p = jm.paths.find((x) => sameId(x.id, ctx.pathId));
    const wp = (p ? parseWaypoints(p) : [])[ctx.wpIdx] || {};
    setSelected(new Set(wp.eventIds || (wp.eventId ? [wp.eventId] : [])));
    const loc = wp.locId ? jm.placedLocs.find((l) => sameId(l.id, wp.locId)) : null;
    setTitle(`Link events — ${loc ? loc.name : `Point ${ctx.wpIdx + 1}`}`);

    setFilterName(null);
    setQuery('');
    jm.loadTimelineEvents().then((rows) => setEntries(rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  const groups = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = q
      ? entries.filter((e) =>
        e.title.toLowerCase().includes(q) ||
        (e.playerName || '').toLowerCase().includes(q) ||
        (e.timelineName || '').toLowerCase().includes(q))
      : entries;
    const g = {};
    filtered.forEach((e) => { const k = `${e.playerName} — ${e.timelineName}`; (g[k] || (g[k] = [])).push(e); });
    return g;
  }, [query, entries]);

  function toggle(id) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function save() {
    const ids = [...selected];
    const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
    await jm.saveWaypointEvents(ctx.pathId, ctx.wpIdx, ids, ids.map((id) => byId[id]?.title || ''));
    onClose();
  }

  const groupKeys = Object.keys(groups);

  return (
    <Modal open={!!ctx} onClose={onClose} onSubmit={save} title={title} className="max-w-lg">
      {filterName && (
        <div className="text-[11px] text-[var(--gold-dim)] mb-2 px-1.5 py-1 bg-surface3 rounded-sm">Showing events for: {filterName}</div>
      )}
      <input
        className="w-full bg-surface3 border border-border2 text-text px-2 py-1.5 rounded-sm text-[12px] mb-2 focus:outline-none focus:border-[var(--gold-dim)]"
        placeholder="Search events, players, timelines…"
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="text-[10px] text-text-muted px-0.5 pb-1.5">
        Click to toggle. {selected.size ? <strong className="text-gold">{selected.size} selected</strong> : 'None selected.'}
      </div>
      <div className="max-h-[320px] overflow-y-auto pr-0.5">
        {groupKeys.length === 0 && (
          <div className="text-[11px] text-text-muted text-center p-2">{entries.length ? 'No matching events.' : 'No timeline events found.'}</div>
        )}
        {groupKeys.map((k) => (
          <div key={k} className="mb-2.5">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 px-0.5">{k}</div>
            {groups[k].map((e) => {
              const on = selected.has(e.id);
              return (
                <div
                  key={e.id}
                  onClick={() => toggle(e.id)}
                  className={`flex items-start gap-1.5 px-1.5 py-1 rounded-sm cursor-pointer text-[11px] ${on ? 'bg-surface2 outline outline-1 outline-[var(--gold-dim)]' : 'hover:bg-surface3'}`}
                >
                  <span className="text-sm leading-none">{on ? '☑' : '☐'}</span>
                  <div>
                    <div className="font-semibold">{e.title}</div>
                    <div className="text-[10px] text-text-muted">Year {e.year ?? '?'}, Day {e.dayOfYear ?? '?'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="accent" onClick={save}>Save Links</Button>
      </div>
    </Modal>
  );
}
