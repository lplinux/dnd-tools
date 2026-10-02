/**
 * pages/Timeline/Sidebar.jsx
 *
 * Timeline sidebar (personal mode): profile bar, events list, the inline
 * new-event form, players, today marker, and locations (drag-reorder). Uses the
 * scoped legacy classes from timeline.css.
 */

import { useRef, useState } from 'react';
import {
  HARPTOS, monthOptions, formatDate, formatDuration, fromAbsDay,
} from '@/data/calendar';

/** Collapsible section wrapper. */
function Section({ title, badge, k, collapsed, onToggle, children }) {
  return (
    <div className="s-sec">
      <div className="s-ttl" onClick={() => onToggle(k)}>
        <span className={`s-arr${collapsed ? ' cl' : ''}`}>▾</span>
        {title}
        {badge != null && <span className="s-bdg">{badge}</span>}
      </div>
      <div className={`s-body${collapsed ? ' collapsed' : ''}`}>
        <div className="s-inner">{children}</div>
      </div>
    </div>
  );
}

/** Native colour-picker dot. */
function ColorDot({ color, onChange }) {
  const ref = useRef(null);
  return (
    <div className="p-dot" style={{ background: color, cursor: 'pointer', position: 'relative' }} title="Click to change colour" onClick={() => ref.current?.click()}>
      <input
        ref={ref}
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
      />
    </div>
  );
}

function NewEventForm({ tl }) {
  const { calType, sortedPlayers, addEvent, isDM } = tl;
  const sortedLocs = [...tl.db.locations].sort((a, b) => a.localeCompare(b));
  const months = monthOptions(calType);

  const [title, setTitle] = useState('');
  const [party, setParty] = useState(false);
  const [playerIds, setPlayerIds] = useState([]);
  const [playerFilter, setPlayerFilter] = useState('');
  const [location, setLocation] = useState('');
  const [year, setYear] = useState(1492);
  const [midx, setMidx] = useState(0);
  const [day, setDay] = useState(1);
  const [description, setDescription] = useState('');
  const [durRaw, setDurRaw] = useState('1d');

  const shownPlayers = sortedPlayers.filter((p) => p.name.toLowerCase().includes(playerFilter.trim().toLowerCase()));

  const special = calType === 'harptos' && HARPTOS[midx]?.sp;

  function togglePlayer(id) {
    setPlayerIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function submit() {
    if (!title.trim()) { window.alert('Enter a title.'); return; }
    if (!party && !location) { window.alert('Select a location.'); return; }
    if (!party && !playerIds.length) { window.alert('Select at least one player.'); return; }
    if (!year) { window.alert('Enter a year.'); return; }
    addEvent({ title: title.trim(), location, year: +year, midx, day: +day, description: description.trim(), durRaw, playerIds, party });
    setTitle(''); setDescription(''); setDurRaw('1d'); setPlayerIds([]); setParty(false);
  }

  return (
    <>
      <div className="fr"><label>Title</label>
        <input type="text" placeholder="Event name…" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      {isDM && (
        <div className="fr">
          <label className="pcl" style={{ cursor: 'pointer', padding: 0 }}>
            <input type="checkbox" checked={party} onChange={(e) => setParty(e.target.checked)} />
            🌍 Party event <span style={{ color: 'var(--text-muted)', fontSize: '.65rem' }}>(whole group)</span>
          </label>
        </div>
      )}
      {!party && <div className="fr"><label>Players</label>
        <div className="pchks-wrap">
          {sortedPlayers.length > 3 && (
            <input className="pl-search" style={{ marginBottom: 4 }} placeholder="Filter players…"
              value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)} />
          )}
          <div className="pchks" id="ev-pchks">
            {sortedPlayers.length === 0
              ? <div style={{ padding: '5px 8px', fontSize: '.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Add players first</div>
              : shownPlayers.length === 0
                ? <div style={{ padding: '5px 8px', fontSize: '.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No matches.</div>
                : shownPlayers.map((p) => (
                  <label key={p.id} className="pcl">
                    <input type="checkbox" checked={playerIds.includes(p.id)} onChange={() => togglePlayer(p.id)} />
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                    {p.name}
                  </label>
                ))}
          </div>
        </div>
      </div>}
      <div className="fr"><label>Location</label>
        <select value={location} onChange={(e) => setLocation(e.target.value)}>
          {sortedLocs.length === 0
            ? <option value="">— add a location first —</option>
            : <><option value="">— select —</option>{sortedLocs.map((l) => <option key={l} value={l}>{l}</option>)}</>}
        </select>
      </div>
      <div className="fg">
        <div className="fr"><label>Year</label><input type="number" min={1} value={year} onChange={(e) => setYear(e.target.value)} /></div>
        <div className="fr"><label>Day</label><input type="number" min={1} max={30} value={special ? 1 : day} disabled={special} onChange={(e) => setDay(e.target.value)} /></div>
      </div>
      <div className="fr"><label>{calType === 'harptos' ? 'Month / Festival' : 'Month'}</label>
        <select value={midx} onChange={(e) => setMidx(+e.target.value)}>
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      <div className="fr"><label>Description</label><textarea rows={2} placeholder="Notes…" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="fr"><label>Duration <span style={{ color: 'var(--text-muted)', fontSize: '.65rem' }}>(1d, 3m, 2y)</span></label>
        <input type="text" value={durRaw} onChange={(e) => setDurRaw(e.target.value)} /></div>
      <button className="btn gld" style={{ width: '100%' }} onClick={submit}>＋ Add Event</button>
    </>
  );
}

export default function Sidebar({ tl, onOpenModal, onScrollToEvent, hideProfileBar = false, readOnlyActors = false, readOnlyToday = false }) {
  const { db, calType, profiles, activeId, ui, toggleSection, sortedPlayers, sortedEvents, displayedLocs } = tl;
  const dragIdx = useRef(null);
  const [playerQuery, setPlayerQuery] = useState('');
  const [locQuery, setLocQuery] = useState('');

  const visPlayers = sortedPlayers.filter((p) => p.name.toLowerCase().includes(playerQuery.trim().toLowerCase()));

  // Locations that still hold an event once EVERY other filter has been applied
  // — the date range (already reflected in db.events here) plus the per-player
  // eye toggles and solo. Listing a location whose events are all filtered out
  // is just a dead row: it cannot be reordered meaningfully and hiding it
  // changes nothing on screen.
  const [showAllLocs, setShowAllLocs] = useState(false);
  const effHiddenPlayers = tl.soloPlayerId != null
    ? new Set(sortedPlayers.filter((p) => p.id !== tl.soloPlayerId).map((p) => p.id))
    : tl.hiddenPlayers;
  const locsWithEvents = new Set(
    db.events
      .filter((e) => {
        const ids = e.playerIds || [];
        // A party event belongs to everyone, so it keeps its location alive
        // regardless of who is hidden.
        if (!ids.length) return true;
        return ids.some((id) => !effHiddenPlayers.has(id));
      })
      .map((e) => e.location),
  );
  const populatedLocs = displayedLocs.filter((l) => locsWithEvents.has(l));
  const emptyLocCount = displayedLocs.length - populatedLocs.length;
  const baseLocs = showAllLocs ? displayedLocs : populatedLocs;

  const locFiltering = locQuery.trim().length > 0;
  const visLocs = locFiltering
    ? baseLocs.filter((l) => l.toLowerCase().includes(locQuery.trim().toLowerCase()))
    : baseLocs;

  const today = db.todayAbs != null ? fromAbsDay(db.todayAbs, calType) : null;

  function onDrop(targetIdx) {
    const from = dragIdx.current;
    dragIdx.current = null;
    if (from == null || from === targetIdx) return;
    const order = [...displayedLocs];
    const [moved] = order.splice(from, 1);
    order.splice(targetIdx, 0, moved);
    tl.reorderLocations(order);
  }

  return (
    <div className="sidebar" id="sidebar">
      {/* Profile bar (personal mode only) */}
      {!hideProfileBar && (
        <div className="prof-bar">
          <select value={activeId} onChange={(e) => tl.switchProfile(e.target.value)}>
            {profiles.length === 0 && <option value="">— no timelines —</option>}
            {[...profiles].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn sm gld" title="New timeline" onClick={() => onOpenModal('new-profile')}>＋</button>
          <button className="btn sm dn" title="Delete timeline" onClick={() => tl.deleteProfile()}>🗑</button>
        </div>
      )}

      {/* Today */}
      <Section title="Today Marker" k="today" collapsed={ui.collapsed.today} onToggle={toggleSection}>
        <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          {today ? <span style={{ color: 'var(--text)' }}>{formatDate(today.year, today.dayOfYear, calType)}</span> : <span style={{ fontStyle: 'italic' }}>No marker set</span>}
        </div>
        {readOnlyToday
          ? <div className="hint">Set in Manage Campaigns.</div>
          : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn sm gld" style={{ flex: 1 }} onClick={() => onOpenModal('set-today')}>📅 Set date</button>
              {today && <button className="btn sm dn" onClick={() => tl.clearToday()}>Clear</button>}
            </div>
          )}
      </Section>

      {/* Events */}
      <Section title="Events" badge={db.events.length} k="events" collapsed={ui.collapsed.events} onToggle={toggleSection}>
        {sortedEvents.length === 0
          ? <div className="empty-m">No events yet.</div>
          : sortedEvents.map((ev) => {
            const pls = (ev.playerIds || []).map((id) => db.players.find((p) => p.id === id)).filter(Boolean);
            return (
              // Dimmed only where the flag means something. Personal-mode events
              // carry no visibility field at all, and testing it there would grey
              // out every row in a timeline that has no players to hide from.
              <div key={ev.id} className={`ev-li${tl.toggleEventVisibility && !ev.visibleToPlayers ? ' item-hidden' : ''}`}>
                <div className="ev-li-body" onClick={() => onScrollToEvent?.(ev.id)}>
                  <div className="ev-li-date">
                    {formatDate(ev.year, ev.dayOfYear, calType)}
                    {ev.durationDays > 1 && <span style={{ color: 'var(--gold-dim)', fontSize: '.68rem', marginLeft: 4 }}>{formatDuration(ev.durationDays)}</span>}
                  </div>
                  <div className="ev-li-title">{ev.title}</div>
                  <div className="ev-li-meta">
                    {pls.map((p) => <span key={p.id} style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />)}
                    <span>📍 {ev.location}</span>
                  </div>
                </div>
                {/* DM-only reveal control. New DM-authored events start hidden,
                    so this is how the party learns anything happened. Absent in
                    personal mode, which has no players to hide from. */}
                {tl.isDM && tl.toggleEventVisibility && (
                  <button
                    className={`eye-btn${ev.visibleToPlayers ? '' : ' hidden-item'}`}
                    style={{ flexShrink: 0, marginTop: 2 }}
                    title={ev.visibleToPlayers ? 'Visible to players — click to hide' : 'Hidden from players — click to reveal'}
                    onClick={() => tl.toggleEventVisibility(ev.id, !ev.visibleToPlayers)}
                  >
                    {ev.visibleToPlayers ? '👁' : '👁‍🗨'}
                  </button>
                )}
                <button className="btn sm dn" style={{ flexShrink: 0, marginTop: 2 }} onClick={() => tl.deleteEvent(ev.id)}>✕</button>
              </div>
            );
          })}
      </Section>

      {/* New event */}
      <Section title="New Event" k="newev" collapsed={ui.collapsed.newev} onToggle={toggleSection}>
        <NewEventForm tl={tl} />
      </Section>

      {/* Players */}
      <Section title="Players" badge={db.players.length} k="players" collapsed={ui.collapsed.players} onToggle={toggleSection}>
        {sortedPlayers.length > 3 && (
          <input className="pl-search" style={{ marginBottom: 6 }} placeholder="Search players…"
            value={playerQuery} onChange={(e) => setPlayerQuery(e.target.value)} />
        )}
        {sortedPlayers.length === 0
          ? <div className="empty-m">No players yet.</div>
          : visPlayers.length === 0
            ? <div className="empty-m">No matches.</div>
            : visPlayers.map((p) => {
            const hidden = tl.hiddenPlayers.has(p.id);
            const soloed = tl.soloPlayerId === p.id;
            return (
              <div key={p.id} className={`p-it${hidden ? ' item-hidden' : ''}${soloed ? ' p-solo' : ''}`}>
                {readOnlyActors
                  ? <div className="p-dot" style={{ background: p.color }} />
                  : <ColorDot color={p.color} onChange={(c) => tl.setPlayerColor(p.id, c)} />}
                <div className="p-nm" style={{ cursor: 'pointer' }} title={soloed ? 'Showing only this player — click to clear' : 'Click to show only this player'} onClick={() => tl.setSoloPlayer(p.id)}>{p.name}</div>
                <button className={`eye-btn${hidden ? ' hidden-item' : ''}`} title={hidden ? 'Show' : 'Hide'} onClick={() => tl.togglePlayerVis(p.id)}>{hidden ? '👁‍🗨' : '👁'}</button>
                {!readOnlyActors && <button className="btn sm dn" onClick={() => { if (window.confirm('Remove this player? Events with no other players will also be deleted.')) tl.removePlayer(p.id); }}>✕</button>}
              </div>
            );
          })}
        {!readOnlyActors && <button className="btn sm" style={{ width: '100%', marginTop: 4 }} onClick={() => onOpenModal('add-player')}>＋ Add Player</button>}
        {readOnlyActors && <div className="hint" style={{ marginTop: 4 }}>Actors come from character relationships &amp; NPCs.</div>}
      </Section>

      {/* Locations */}
      <Section title="Locations" badge={baseLocs.length} k="locs" collapsed={ui.collapsed.locs} onToggle={toggleSection}>
        {baseLocs.length > 3 && (
          <input className="pl-search" style={{ marginBottom: 6 }} placeholder="Search locations…"
            value={locQuery} onChange={(e) => setLocQuery(e.target.value)} />
        )}
        {displayedLocs.length === 0
          ? <div className="empty-m">No locations yet.</div>
          : baseLocs.length === 0
            ? <div className="empty-m">No locations have events in view.</div>
            : visLocs.length === 0
              ? <div className="empty-m">No matches.</div>
              : visLocs.map((l, i) => {
            const hidden = tl.hiddenLocs.has(l);
            // Drag reorder writes positions back into the full ordered list, so
            // the rendered indices must be that list — any subset breaks them.
            const canDrag = !readOnlyActors && !locFiltering && baseLocs.length === displayedLocs.length;
            return (
              <div
                key={l}
                className={`l-it${hidden ? ' item-hidden' : ''}`}
                draggable={canDrag}
                onDragStart={canDrag ? () => { dragIdx.current = i; } : undefined}
                onDragOver={canDrag ? (e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); } : undefined}
                onDragLeave={canDrag ? (e) => e.currentTarget.classList.remove('drag-over') : undefined}
                onDrop={canDrag ? (e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); onDrop(i); } : undefined}
              >
                {canDrag && <span className="drag-handle" title="Drag to reorder">⠿</span>}
                <span style={{ flex: 1 }}>{l}</span>
                <button className={`eye-btn${hidden ? ' hidden-item' : ''}`} title={hidden ? 'Show' : 'Hide'} onClick={() => tl.toggleLocVis(l)}>{hidden ? '👁‍🗨' : '👁'}</button>
                {!readOnlyActors && <button className="btn sm dn" onClick={() => { const n = db.events.filter((e) => e.location === l).length; if (!n || window.confirm(`"${l}" has ${n} event${n === 1 ? '' : 's'}. Delete them all?`)) tl.removeLocation(l); }}>✕</button>}
              </div>
            );
          })}
        {/* An escape hatch, so an empty location can still be reordered or
            deleted — hiding it outright would strand it in the data with no way
            to reach it from here. */}
        {emptyLocCount > 0 && (
          <button
            className="btn sm"
            style={{ width: '100%', marginTop: 4 }}
            onClick={() => setShowAllLocs((v) => !v)}
            title={showAllLocs ? 'List only locations with events in view' : 'Also list locations with no events in view'}
          >
            {showAllLocs
              ? `Hide ${emptyLocCount} without events`
              : `Show ${emptyLocCount} without events`}
          </button>
        )}
        {!readOnlyActors && <button className="btn sm" style={{ width: '100%', marginTop: 4 }} onClick={() => onOpenModal('add-location')}>＋ Add Location</button>}
      </Section>
    </div>
  );
}
