/**
 * pages/JourneyMap/DetailsPanel.jsx
 *
 * Right-hand details panel for the editor. Shows the selected location
 * (geometry, size, linked map, proximity-filtered distances) or the selected
 * path (route/derived movement, travel times, waypoints, notes).
 *
 * Edit affordances that need modals (distance edit, event linking) are wired
 * via optional callbacks so later phases can switch them on without changing
 * this component's shape.
 */

import { useEffect, useRef } from 'react';

import {
  isRegion, sameId, fmtTravelTime, SPEEDS, parseWaypoints,
  computePathDistance, roadDistance, distanceBetween, proximityVisibleLocations, waypointEvents,
} from '@/components/map/geometry';

const ROUTE_LABEL = { road: '🛣️ Road', flight: '✈️ Flight route', maritime: '⚓ Maritime route' };
import { InfoCard, InfoRow } from '@/components/ui';

function travelInline(mi) {
  return `🚶${fmtTravelTime(mi / SPEEDS.walk)} 🐎${fmtTravelTime(mi / SPEEDS.horse)} 🦅${fmtTravelTime(mi / SPEEDS.fly)}`;
}

/* A route/path section row: "from → to" with the location-pair distance. Editable
   on Routes (writes the shared matrix); read-only on Paths (derived). */
function SectionRow({ section, editable, active, onSet }) {
  const ref = useRef(null);
  useEffect(() => {
    if (active && ref.current) {
      ref.current.focus();
      ref.current.select?.();
      ref.current.scrollIntoView?.({ block: 'nearest' });
    }
  }, [active]);

  const canEdit = editable;

  return (
    <div className={`group relative flex items-start gap-1.5 py-[3px] text-[11px] ${active ? 'bg-surface3 -mx-1 px-1 rounded-sm' : ''}`}>
      <span className="flex-1 min-w-0 break-words leading-tight">
        {section.fromName} <span className="text-[var(--gold-dim)]">→</span> {section.toName}
      </span>
      {canEdit ? (
        <input
          ref={ref}
          type="number"
          min="0"
          step="0.1"
          key={`${section.index}-${section.miles ?? ''}`}
          defaultValue={section.miles ?? ''}
          placeholder="set"
          onBlur={(e) => onSet(section.index, e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="w-16 bg-surface2 border border-border2 text-text px-1 py-0.5 rounded-sm text-[11px] text-right focus:outline-none focus:border-[var(--gold-dim)]"
        />
      ) : (
        <span className={`w-16 text-right ${section.miles == null ? 'text-text-muted' : ''}`}>{section.miles == null ? '—' : section.miles}</span>
      )}
      <span className="text-text-muted mt-[1px]">mi</span>
      {section.miles != null && (
        <div className="pointer-events-none absolute right-0 bottom-full mb-1 z-20 hidden group-hover:block whitespace-nowrap rounded-sm border border-border2 bg-surface px-2 py-1 text-[10px] text-text shadow-card">
          <div className="text-[var(--gold-dim)] mb-0.5">{section.fromName} → {section.toName}</div>
          {travelInline(section.miles)}
        </div>
      )}
    </div>
  );
}

/* ── Location view ─────────────────────────────────────────── */
function LocationDetails({ loc, maps, mapId, placedLocs, distances, regionEditing, onToggleRegionEdit, onEditDistance, onSaveLinkedMap, onSetIconScale }) {
  const region = isRegion(loc);
  const { visible, hiddenCount } = proximityVisibleLocations(loc, placedLocs, distances);

  return (
    <>
      <InfoCard title={region ? '🗾 Region' : '📍 Location'}>
        <InfoRow label="Centroid">{loc.x.toFixed(1)}%, {loc.y.toFixed(1)}%</InfoRow>
        {loc.size_type && <InfoRow label="Size/Type"><span className="capitalize">{loc.size_type}</span></InfoRow>}
        {!region && (
          <InfoRow label="Pin size">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0.3"
                max="4"
                step="0.1"
                value={loc.icon_scale ?? 1}
                onChange={(e) => onSetIconScale?.(loc.id, parseFloat(e.target.value))}
                className="w-28 accent-[var(--gold)]"
              />
              <span className="text-text-muted tabular-nums">{(loc.icon_scale ?? 1).toFixed(1)}×</span>
            </div>
          </InfoRow>
        )}
        {region && <InfoRow label="Vertices">{loc.polygon.length} points</InfoRow>}
        {region && (
          <div className="pt-1.5">
            <button
              type="button"
              onClick={onToggleRegionEdit}
              className={`w-full text-[11px] px-2 py-1 rounded-sm border transition-colors ${
                regionEditing
                  ? 'bg-[var(--gold-dim)] border-gold text-bg'
                  : 'bg-surface2 border-border2 text-text-dim hover:text-text'
              }`}
            >
              {regionEditing ? '🔓 Editing — click to lock' : '✏️ Edit shape & position'}
            </button>
            {regionEditing && (
              <div className="text-[10px] text-text-muted pt-1">Drag vertices to reshape · drag interior to move</div>
            )}
          </div>
        )}
      </InfoCard>

      {region && (
        <InfoCard title="🗺 Linked Map">
          <div className="text-[11px] text-text-muted mb-1.5">Open a detail map when this region is selected.</div>
          <select
            value={loc.linked_map_id || ''}
            onChange={(e) => onSaveLinkedMap(loc.id, e.target.value)}
            className="w-full bg-surface3 border border-border2 text-text px-1.5 py-1 rounded-sm text-[12px] focus:outline-none focus:border-[var(--gold-dim)]"
          >
            <option value="">— no linked map —</option>
            {maps.filter((m) => !sameId(m.id, mapId)).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </InfoCard>
      )}

      <InfoCard title="📏 Distances">
        {visible.length === 0 && (
          <div className="text-text-muted italic text-[11px] text-center py-3">No nearby locations match proximity rules.</div>
        )}
        {visible.map((other) => {
          const mi = distanceBetween(loc.id, other.id, distances);
          const tag = other.size_type ? <span className="text-[9px] text-text-muted ml-1">({other.size_type})</span> : null;
          return (
            <InfoRow
              key={other.id}
              label={<>📍 {other.name}{tag}</>}
              onClick={onEditDistance ? () => onEditDistance(loc.id, other.id) : undefined}
              dim={mi === null}
            >
              {mi !== null
                ? <>{mi} mi <span className="text-text-muted text-[10px]">({travelInline(mi)})</span></>
                : <span className="text-text-muted">set distance →</span>}
            </InfoRow>
          );
        })}
        {hiddenCount > 0 && (
          <div className="group relative text-[10px] text-text-muted text-center pt-1">
            <span className="underline decoration-dotted cursor-help">
              {hiddenCount} location{hiddenCount > 1 ? 's' : ''} hidden by proximity filter
            </span>
            <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 z-20 hidden group-hover:block w-56 text-left rounded-sm border border-border2 bg-surface px-2 py-1.5 text-[10px] leading-snug text-text shadow-card">
              <div className="text-[var(--gold-dim)] mb-1">Proximity filter</div>
              Only road-connected locations within range are listed:
              <ul className="mt-1 space-y-0.5">
                <li>• <b>Big</b> (huge/big): all big cities · medium ≤150 mi · other ≤50 mi</li>
                <li>• <b>Medium</b> (medium/small): big ≤150 mi · medium ≤100 mi · other ≤50 mi</li>
                <li>• <b>Other</b> (inn, etc.): nearest big city · medium ≤80 mi · other ≤50 mi</li>
              </ul>
              <div className="mt-1 text-text-muted">Locations no road connects are always hidden.</div>
            </div>
          </div>
        )}
      </InfoCard>
    </>
  );
}

/* ── Route view (a road in the network; sections carry the road's distances) ── */
function RouteDetails({ path, placedLocs, selectedSection, onSetSectionDistance, onDeleteWaypoint, onRename }) {
  const wpts = parseWaypoints(path);
  const dist = roadDistance(wpts, placedLocs);

  return (
    <>
      <InfoCard title="Road Info">
        <label className="block text-[10px] text-text-muted mb-0.5">Name</label>
        <input
          key={path.id}
          defaultValue={path.name || ''}
          placeholder="Road name…"
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== path.name) onRename?.(path.id, 'name', v); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="w-full bg-surface2 border border-border2 text-text px-2 py-1 mb-2 rounded-sm text-[12px] focus:outline-none focus:border-[var(--gold-dim)]"
        />
        <InfoRow label="Type">{ROUTE_LABEL[path.route_type] || ROUTE_LABEL.road}</InfoRow>
        <InfoRow label="Sections">{dist.sections.length}</InfoRow>
        <InfoRow label="Total distance">
          {dist.complete ? `${dist.miles} mi` : <span className="text-text-muted">?? <span className="text-[10px] italic">(set section distances)</span></span>}
        </InfoRow>
      </InfoCard>

      {dist.sections.length > 0 && (
        <InfoCard title="📏 Sections">
          <div className="text-[10px] text-text-muted mb-1">
            Distance of each segment between points along this road.
          </div>
          {dist.sections.map((sec) => (
            <SectionRow
              key={sec.index}
              section={sec}
              editable
              active={!!selectedSection && sameId(selectedSection.pathId, path.id) && sameId(sec.index, selectedSection.index)}
              onSet={(idx, miles) => onSetSectionDistance?.(path, idx, miles)}
            />
          ))}
        </InfoCard>
      )}

      <InfoCard title="📍 Points">
        <div className="text-[10px] text-text-muted mb-1">
          Delete a point to remove it from the road (e.g. when rebuilding or adding a city between two others).
        </div>
        {wpts.map((wp, i) => {
          const loc = wp.locId != null ? placedLocs.find((l) => sameId(l.id, wp.locId)) : null;
          return (
            <div key={i} className="flex items-center gap-1.5 py-[3px] text-[11px]">
              <span className="text-[var(--gold-dim)]">{i === 0 ? '⊙' : '→'}</span>
              <span className="flex-1 truncate">{loc ? `📍 ${loc.name}` : `Point ${i + 1}`}</span>
              <button
                type="button"
                onClick={() => onDeleteWaypoint?.(path, i)}
                title="Delete this point"
                className="text-text-muted hover:text-[#e06c75] px-1"
              >
                ✕
              </button>
            </div>
          );
        })}
      </InfoCard>
    </>
  );
}

/* ── Path view (derived movement; distance derived, read-only) ── */
function PathDetails({ path, placedLocs, distances, selectedSection, onSaveNotes, onLinkEvent, onUnlinkEvent }) {
  const wpts = parseWaypoints(path);
  const dist = computePathDistance(wpts, distances, placedLocs);

  return (
    <>
      <InfoCard title="Path Info">
        <InfoRow label="Tracker"><span style={{ color: path.tracker_color || '#c9a84c' }}>{path.tracker_name || '—'}</span></InfoRow>
        <InfoRow label="Waypoints">{wpts.length}</InfoRow>
        <InfoRow label="Distance">
          {dist.complete ? `${dist.miles} mi` : <span className="text-text-muted">?? <span className="text-[10px] italic">(set location distances)</span></span>}
        </InfoRow>
      </InfoCard>

      {dist.complete && (
        <InfoCard title="⏱ Travel Times">
          <div className="grid grid-cols-3 gap-[5px] mt-1">
            {[['🚶', 'walk', 'Walking'], ['🐎', 'horse', 'Horse'], ['🦅', 'fly', 'Flying']].map(([icon, k, lbl]) => (
              <div key={k} className="bg-surface3 border border-border rounded-sm px-1 py-[5px] text-center">
                <span className="text-sm block">{icon}</span>
                <div className="text-[11px] text-gold font-semibold mt-0.5">{fmtTravelTime(dist.miles / SPEEDS[k])}</div>
                <div className="text-[10px] text-text-muted">{lbl}</div>
              </div>
            ))}
          </div>
        </InfoCard>
      )}

      {wpts.length > 0 && (
        <InfoCard title="📍 Waypoints">
          {wpts.map((wp, i) => {
            const loc = wp.locId ? placedLocs.find((l) => sameId(l.id, wp.locId)) : null;
            const evs = waypointEvents(wp);
            return (
              <div key={i} className="flex flex-wrap items-center gap-1.5 py-[3px] text-[11px]">
                <span className="text-[var(--gold-dim)]">{i === 0 ? '⊙' : '→'}</span>
                <span className="flex-1">{loc ? `📍 ${loc.name}` : `Point ${i + 1}`}</span>
                {onLinkEvent && (
                  <button
                    type="button"
                    onClick={() => onLinkEvent(path.id, i)}
                    className="border border-border2 text-[var(--gold-dim)] hover:text-gold rounded-sm text-[9px] px-1.5 py-px"
                  >
                    🗓 {evs.length ? 'Edit events' : 'Link event'}
                  </button>
                )}
                {evs.length > 0 && (
                  <div className="w-full pl-4 flex flex-wrap gap-1 mt-0.5">
                    {evs.map((e) => (
                      <span key={e.id} className="inline-flex items-center gap-1 bg-surface2 border border-border2 text-gold rounded-sm px-1.5 text-[10px]">
                        🗓 {e.title}
                        {onUnlinkEvent && (
                          <span className="text-text-muted hover:text-[#e06c75] cursor-pointer" onClick={() => onUnlinkEvent(path.id, i, e.id)}>✕</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </InfoCard>
      )}

      <InfoCard title="📝 Notes">
        <textarea
          defaultValue={path.notes || ''}
          placeholder="Encounters, events along the way…"
          onBlur={(e) => onSaveNotes(path.id, 'notes', e.target.value)}
          className="w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-[12px] resize-y min-h-[56px] focus:outline-none focus:border-[var(--gold-dim)]"
        />
      </InfoCard>
    </>
  );
}

export default function DetailsPanel({
  selectedLoc, selectedPath, placedLocs, paths, distances, maps, mapId,
  selectedSection, onSetSectionDistance, onDeleteWaypoint,
  regionEditing, onToggleRegionEdit,
  onEditDistance, onSaveLinkedMap, onSetIconScale, onSaveNotes, onLinkEvent, onUnlinkEvent,
}) {
  const loc = selectedLoc != null ? placedLocs.find((l) => sameId(l.id, selectedLoc)) : null;
  const path = selectedPath != null ? paths.find((p) => sameId(p.id, selectedPath)) : null;

  let head = 'Details';
  let body = <div className="text-text-muted italic text-[12px] text-center py-6">Select a location or path for details.</div>;

  if (loc) {
    head = `${isRegion(loc) ? '🗾' : '📍'} ${loc.name}`;
    body = (
      <LocationDetails
        loc={loc} maps={maps} mapId={mapId} placedLocs={placedLocs} distances={distances}
        regionEditing={regionEditing} onToggleRegionEdit={onToggleRegionEdit}
        onEditDistance={onEditDistance} onSaveLinkedMap={onSaveLinkedMap}
        onSetIconScale={onSetIconScale}
      />
    );
  } else if (path && path.kind === 'route') {
    head = `🛣️ ${path.name || 'Route'}`;
    body = (
      <RouteDetails
        path={path} placedLocs={placedLocs}
        selectedSection={selectedSection} onSetSectionDistance={onSetSectionDistance}
        onDeleteWaypoint={onDeleteWaypoint} onRename={onSaveNotes}
      />
    );
  } else if (path) {
    // Derived movement paths (Party / NPC) are read-only — no notes editing / event linking.
    const derived = path.id === 'party' || String(path.id).startsWith('npc_');
    head = `🛤️ ${path.name || 'Path'}`;
    body = (
      <PathDetails
        path={path} placedLocs={placedLocs} distances={distances}
        selectedSection={selectedSection}
        onSaveNotes={derived ? undefined : onSaveNotes}
        onLinkEvent={derived ? undefined : onLinkEvent}
        onUnlinkEvent={derived ? undefined : onUnlinkEvent}
      />
    );
  }

  return (
    <aside className="bg-surface border-l border-border flex flex-col overflow-hidden">
      <div className="bg-surface2 border-b border-border px-3.5 py-2.5 font-display text-[0.75rem] text-gold tracking-wider uppercase flex-shrink-0">
        {head}
      </div>
      <div className="flex-1 overflow-y-auto p-3">{body}</div>
    </aside>
  );
}
