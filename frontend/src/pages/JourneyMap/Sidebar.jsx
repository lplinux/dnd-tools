/**
 * pages/JourneyMap/Sidebar.jsx
 *
 * Left sidebar for the journey-map editor: tool palette, background-image
 * controls, the scoped location tree + place selector, routes list,
 * derived-movement list, and the distance-matrix launcher.
 *
 * Presentational — all state and actions are passed in from the page (which
 * owns `useJourneyMap`).
 */

import { useEffect, useRef, useState } from 'react';
import { sameId, isRegion } from '@/components/map/geometry';
import { TOOLS, TOOL_HINTS, REGION_SIZE_TYPES } from './constants';

const ROUTE_ICON = { road: '🛣️', flight: '✈️', maritime: '⚓' };

/* ── shared element styles ─────────────────────────────────── */
const toolBtn = (active) => [
  'flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-sm text-[13px] border transition-colors',
  active
    ? 'bg-[var(--gold-dim)] border-gold text-text'
    : 'bg-surface2 border-border text-text-dim hover:bg-surface3 hover:text-text hover:border-[var(--gold-dim)]',
].join(' ');

const listItem = (active) => [
  'group flex items-center gap-1.5 px-2 py-1.5 rounded-sm text-[12px] border cursor-pointer transition-colors',
  active ? 'bg-surface3 border-gold' : 'bg-surface2 border-border hover:border-[var(--gold-dim)]',
].join(' ');

const miniInput = 'flex-1 min-w-0 bg-surface2 border border-border2 text-text px-2 py-1 rounded-sm text-[12px] focus:outline-none focus:border-[var(--gold-dim)]';
const hint = 'text-[11px] text-text-muted leading-snug px-0.5 py-1';

function CollapsibleSection({ title, defaultOpen = false, forceOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  // Auto-expand when the active tool wants this section (fires on the false→true
  // transition, so a manual collapse while the tool stays active isn't undone).
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-surface2 hover:bg-surface3 px-3 py-2 font-display uppercase tracking-wider text-[0.68rem] text-gold transition-colors select-none"
      >
        {title}
        <span className={`text-[0.55rem] transition-transform ${open ? '' : '-rotate-90'}`}>▾</span>
      </button>
      {open && <div className="p-2 flex flex-col gap-1">{children}</div>}
    </div>
  );
}

function DeleteX({ onClick }) {
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="opacity-0 group-hover:opacity-100 text-[10px] text-text-muted hover:text-[var(--red-hover)] flex-shrink-0 cursor-pointer"
    >
      ✕
    </span>
  );
}

/* ── location tree helpers ─────────────────────────────────── */
function getScopedLocations(campaignLocs, scope) {
  if (scope.type === 'city' && scope.locationId) {
    const result = [];
    const queue = [scope.locationId];
    while (queue.length) {
      const pid = queue.shift();
      campaignLocs.filter((l) => sameId(l.parent_id, pid)).forEach((l) => { result.push(l); queue.push(l.id); });
    }
    return result;
  }
  return campaignLocs;
}

/** Flattened, depth-tagged options for the place dropdown (pinned = disabled). */
function placeOptions(campaignLocs, placedLocs, scope) {
  const scoped = getScopedLocations(campaignLocs, scope);
  const pinned = new Set(placedLocs.map((l) => l.campaign_location_id).filter(Boolean).map(String));
  const root = scope.type === 'city' && scope.locationId ? scope.locationId : null;

  const childrenOf = (pid) =>
    scoped.filter((l) => sameId(l.parent_id, pid) || (pid === null && !l.parent_id));
  // A pinned location stays in the list only if it still has an unpinned
  // descendant (a region whose children aren't all placed yet); then it's shown
  // disabled, purely as a header so its unpinned children can nest under it.
  const hasUnpinnedDescendant = (l) =>
    childrenOf(l.id).some((c) => !pinned.has(String(c.id)) || hasUnpinnedDescendant(c));

  const out = [];
  const walk = (parentId, depth) => {
    childrenOf(parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((l) => {
        const isPinned = pinned.has(String(l.id));
        if (isPinned && !hasUnpinnedDescendant(l)) return; // already pinned, nothing left to pin under it
        out.push({ id: l.id, label: `${' '.repeat(depth * 4)}${depth ? '└ ' : ''}${l.name}${isPinned ? ' ✓' : ''}`, disabled: isPinned });
        walk(l.id, depth + 1);
      });
  };
  walk(root, 0);
  return out;
}

/** Placed locations rendered as a tree (campaign tree + unlinked pins). */
function PlacedTree({ campaignLocs, placedLocs, scope, selectedLoc, onSelect, onDelete }) {
  if (!placedLocs.length) return <div className={hint}>No locations placed yet.</div>;

  const placedByCampId = {};
  placedLocs.forEach((l) => { if (l.campaign_location_id) placedByCampId[l.campaign_location_id] = l; });
  const root = scope.type === 'city' && scope.locationId ? scope.locationId : null;

  const renderTree = (parentCampId, depth) =>
    campaignLocs
      .filter((cl) => (sameId(cl.parent_id, parentCampId) || (parentCampId === null && !cl.parent_id)) && placedByCampId[cl.id])
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((cl) => {
        const placed = placedByCampId[cl.id];
        return [
          <div
            key={placed.id}
            className={listItem(sameId(placed.id, selectedLoc))}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => onSelect(placed.id)}
          >
            {depth > 0 && <span className="text-text-muted text-[10px] mr-0.5">└</span>}
            <span className="flex-shrink-0">{isRegion(placed) ? '🗾' : '📍'}</span>
            <span className="flex-1 truncate">{placed.name}</span>
            <DeleteX onClick={() => onDelete(placed.id)} />
          </div>,
          ...renderTree(cl.id, depth + 1),
        ];
      });

  const unlinked = placedLocs
    .filter((l) => !l.campaign_location_id)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((l) => (
      <div key={l.id} className={listItem(sameId(l.id, selectedLoc))} onClick={() => onSelect(l.id)}>
        <span className="flex-shrink-0">📍</span>
        <span className="flex-1 truncate">{l.name}</span>
        <DeleteX onClick={() => onDelete(l.id)} />
      </div>
    ));

  return <>{renderTree(root, 0)}{unlinked}</>;
}

export default function Sidebar({
  activeTool, onSetTool, drawMode, onSetDrawMode, roadType, onSetRoadType,
  showRoutes, onToggleRoutes,
  mapId, mapImage, onUploadImage, onClearImage,
  campaignLocs, placedLocs, scope,
  placeLocId, onPlaceLocChange, onPlaceSelected,
  selectedLoc, onSelectLocation, onDeletePlacedLoc,
  paths, selectedPath, onSelectPath, onDeletePath,
  hiddenPaths, onToggleHidePath,
  onOpenMatrix,
}) {
  const fileRef = useRef(null);

  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
  const options = placeOptions(campaignLocs, placedLocs, scope);
  const routes = paths.filter((p) => p.kind === 'route').sort(byName);
  const movePaths = paths.filter((p) => p.kind !== 'route').sort(byName);

  return (
    <div className="bg-surface border-r border-border flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">

        {/* TOOLS */}
        <CollapsibleSection title="Tools" forceOpen={activeTool === 'draw'}>
          {TOOLS.map((t) => (
            <button key={t.id} type="button" className={toolBtn(activeTool === t.id)} onClick={() => onSetTool(t.id)} title={t.label}>
              <span className="flex-shrink-0">{t.icon}</span>
              <span className="flex-1">{t.label}</span>
              <kbd className="text-[9px] text-text-muted border border-border2 rounded-sm px-1">{t.key}</kbd>
            </button>
          ))}
          {activeTool === 'draw' && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-[10px] text-text-muted mr-1">Type:</span>
              {[['road', '🛣️ Road'], ['flight', '✈️ Flight'], ['maritime', '⚓ Sea']].map(([t, lbl]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onSetRoadType(t)}
                  className={`flex-1 text-[11px] px-1.5 py-1 rounded-sm border transition-colors ${
                    roadType === t
                      ? 'bg-[var(--gold-dim)] border-gold text-bg'
                      : 'bg-surface2 border-border2 text-text-dim hover:text-text'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          )}
          <div className={hint}>
            {activeTool === 'draw'
              ? 'Draw builds roads (routes) only — points are map-only and set section distances. Movement paths are derived from the timeline.'
              : TOOL_HINTS[activeTool]}
          </div>
        </CollapsibleSection>

        {/* MAP BACKGROUND */}
        <CollapsibleSection title="Map Background">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onUploadImage(f); }}
          />
          <button type="button" className={toolBtn(false)} disabled={!mapId} onClick={() => fileRef.current?.click()}>
            <span>🖼️</span> Upload Image
          </button>
          {mapImage && (
            <button type="button" className={toolBtn(false)} onClick={onClearImage}>
              <span>🗑️</span> Remove Image
            </button>
          )}
          <div className={hint}>Supports PNG/JPG/WebP. Stored in DB.</div>
        </CollapsibleSection>

        {/* LOCATIONS */}
        <CollapsibleSection title="Locations" forceOpen={['place', 'region', 'measure'].includes(activeTool)}>
          <div className="flex gap-1 mb-1.5">
            <select className={miniInput} value={placeLocId} onChange={(e) => onPlaceLocChange(e.target.value)}>
              <option value="">— Pick location —</option>
              {options.map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.label}</option>)}
            </select>
            <button type="button" className="bg-[var(--gold-dim)] hover:bg-gold hover:text-bg text-text px-2 rounded-sm text-[13px]" title="Pin selected location" onClick={onPlaceSelected}>📍</button>
          </div>
          <PlacedTree
            campaignLocs={campaignLocs}
            placedLocs={placedLocs}
            scope={scope}
            selectedLoc={selectedLoc}
            onSelect={onSelectLocation}
            onDelete={onDeletePlacedLoc}
          />
        </CollapsibleSection>

        {/* ROUTES (tracker-free road network; define location distances) */}
        <CollapsibleSection title="Routes">
          <button
            type="button"
            onClick={onToggleRoutes}
            className="flex items-center gap-1.5 w-full text-left px-2 py-1 mb-1 rounded-sm text-[11px] border border-border2 bg-surface2 text-text-dim hover:text-text"
            title="Show or hide all road lines on the map"
          >
            {showRoutes ? '🙈 Hide roads on map' : '👁 Show roads on map'}
          </button>
          {routes.length === 0 && <div className={hint}>No routes yet. Use Draw in Route mode to connect locations and set distances.</div>}
          {routes.map((p) => (
            <div key={p.id} className={listItem(sameId(p.id, selectedPath))} onClick={() => onSelectPath(p.id)}>
              <span className="flex-shrink-0">{ROUTE_ICON[p.route_type] || ROUTE_ICON.road}</span>
              <span className="flex-1 truncate">{p.name || 'Road'}</span>
              <DeleteX onClick={() => onDeletePath(p.id)} />
            </div>
          ))}
        </CollapsibleSection>

        {/* MOVEMENT (derived from the timeline — Party + per-NPC; read-only) */}
        <CollapsibleSection title="Movement (from Timeline)">
          {movePaths.length === 0 && <div className={hint}>No movement yet. Party, player & NPC paths are built from timeline events placed at pinned locations.</div>}
          {movePaths.map((p) => {
            const isHidden = hiddenPaths?.has(p.id);
            return (
              <div key={p.id} className={listItem(sameId(p.id, selectedPath))} onClick={() => onSelectPath(p.id)}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.tracker_color || '#c9a84c', opacity: isHidden ? 0.3 : 1 }} />
                <span className={`flex-1 truncate${isHidden ? ' opacity-40 line-through' : ''}`}>{p.name}</span>
                <button
                  type="button"
                  title={isHidden ? 'Hidden on the map — click to show' : 'Shown on the map — click to hide'}
                  onClick={(e) => { e.stopPropagation(); onToggleHidePath?.(p.id); }}
                  className="text-[11px] px-1 rounded-sm border border-border2 text-text-muted hover:text-gold flex-shrink-0"
                >
                  {isHidden ? '🙈' : '👁'}
                </button>
              </div>
            );
          })}
          <div className={hint}>Derived from timeline events (Party = 3+ players; fewer belong to each player). NPC paths are DM-only (never shared). On the public map, a logged-in player sees the Party path + their own. 👁 hides a path on your map to declutter (view-only, resets on reload).</div>
        </CollapsibleSection>

        {/* DISTANCE MATRIX */}
        <CollapsibleSection title="📏 Distance Matrix">
          <button type="button" className={toolBtn(false)} disabled={!mapId} onClick={onOpenMatrix}>
            Open Distance Matrix
          </button>
        </CollapsibleSection>
      </div>
    </div>
  );
}
