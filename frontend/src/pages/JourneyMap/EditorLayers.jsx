/**
 * pages/JourneyMap/EditorLayers.jsx
 *
 * Editable SVG layers for the journey-map editor, drawn back-to-front:
 * paths → regions → pins. Each element reports mousedown to the interaction
 * hook (which decides select/drag/delete by the active tool).
 *
 * Phase 4: pins are draggable (drag handled in useMapInteraction via the area
 * move/up), regions/paths are selectable. Vertex/waypoint drag handles and
 * draw previews arrive in Phases 5–6.
 */

import { useMemo, useState } from 'react';

import {
  pctToSvg, parseWaypoints, resolveWaypoints, isRegion, sameId, computePathDistance, roadDistance, buildRoadPath, fmtTravelTime, SPEEDS,
} from '@/components/map/geometry';
import { PinIcon, pinSize, pinLabelStyle, effectivePinImage } from '@/components/map/pinIcons';
import { MapLabel } from '@/components/map/MapLabel';

// Road-network styling by type (solid road, dashed flight/sea).
const ROUTE_STYLE = {
  road:     { color: '#9a8c6a', dash: undefined },
  flight:   { color: '#6aa3d8', dash: '2 7' },
  maritime: { color: '#3f9e9e', dash: '7 5' },
};

// Road name ink on the parchment plate — a dark, readable tint per route type,
// so road names read differently from location names.
const ROUTE_INK = {
  road:     '#6b4e2a',
  flight:   '#2b5a7a',
  maritime: '#1f5e5e',
};

export function EditorPaths({ paths, iw, ih, selPath, selectedSection, distances, placedLocs, showRoutes = true, hiddenPaths, activeTool, onPathDown, onWaypointDown, onSectionClick, onCurveDown, onSectionAddCurve, onRemoveCurvePoint, onLabelDown }) {
  const editing = activeTool === 'select'; // section/bend handles only with Select/Move
  return paths.map((p) => {
    const isRoute = p.kind === 'route';
    if (isRoute && !showRoutes) return null;
    if (!isRoute && hiddenPaths?.has(p.id)) return null; // movement path hidden to declutter
    // Anchor waypoints follow their placed locations (so moving a pin moves the route).
    const wpts = resolveWaypoints(parseWaypoints(p), placedLocs);
    if (wpts.length < 2) return null;
    const style = ROUTE_STYLE[p.route_type] || ROUTE_STYLE.road;
    // Roads are a tracker-free network → typed colour, dashed for flight/sea, no
    // arrowhead. Paths are a tracker's movement → tracker colour, directional arrow.
    const color = isRoute ? style.color : (p.tracker_color || '#c9a84c');
    const sel = sameId(p.id, selPath);
    const road = buildRoadPath(wpts, iw, ih); // curved where a section has `curve`
    const mid = wpts[Math.floor(wpts.length / 2)];
    // Name/distance sit at the (draggable) label anchor — defaults to the midpoint.
    const la = pctToSvg(p.label_x ?? mid.x, p.label_y ?? mid.y, iw, ih);
    const dist = isRoute ? roadDistance(wpts) : computePathDistance(wpts, distances);
    const down = (e) => onPathDown(p, e);
    // Derived movement paths (Party / NPC) are read-only — no draggable label.
    const derived = p.id === 'party' || String(p.id).startsWith('npc_');
    const labelDraggable = sel && editing && !derived && typeof onLabelDown === 'function';

    return (
      <g key={p.id} style={{ color }}>
        {/* Fat transparent hit-line for easier clicking */}
        <path d={road.d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'pointer' }} onMouseDown={down} />
        <path
          d={road.d}
          fill="none"
          stroke={color}
          strokeWidth={sel ? 3.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={isRoute ? style.dash : undefined}
          opacity={isRoute ? (sel ? 1 : 0.85) : (sel ? 1 : 0.72)}
          markerEnd={isRoute ? undefined : 'url(#jm-arrowhead)'}
          style={{ cursor: 'pointer' }}
          onMouseDown={down}
        />
        {p.name && (
          <MapLabel
            x={la.x} y={la.y - 6} text={p.name}
            fontSize={9}
            fontWeight={isRoute ? 700 : 600}
            fontStyle={isRoute ? undefined : 'italic'}
            letterSpacing={isRoute ? '0.08em' : undefined}
            uppercase={isRoute}
            ink={isRoute ? (ROUTE_INK[p.route_type] || ROUTE_INK.road) : undefined}
            onMouseDown={labelDraggable ? (e) => onLabelDown(p, e) : undefined}
          />
        )}
        {dist.complete ? (
          <text className="jm-dist-label" x={la.x} y={la.y + 11}>
            {isRoute
              ? `${dist.miles}mi`
              : `${dist.miles}mi  🚶${fmtTravelTime(dist.miles / SPEEDS.walk)} 🐎${fmtTravelTime(dist.miles / SPEEDS.horse)} 🦅${fmtTravelTime(dist.miles / SPEEDS.fly)}`}
          </text>
        ) : (
          <text className="jm-dist-label" x={la.x} y={la.y + 11} style={{ fill: '#a09070' }}>??mi</text>
        )}

        {/* Per-section clickable segments + distance labels (selected road only) */}
        {isRoute && sel && editing && onSectionClick && road.segs.map((seg) => {
          const sec = dist.sections[seg.index];
          const active = !!selectedSection && sameId(selectedSection.pathId, p.id) && sameId(seg.index, selectedSection.index);
          return (
            <g key={`sec-${seg.index}`} style={{ cursor: 'pointer' }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onSectionClick(p.id, seg.index); }}
              onDoubleClick={(e) => { e.stopPropagation(); onSectionAddCurve?.(p, seg.index, e); }}
            >
              <path d={seg.d} fill="none" stroke="transparent" strokeWidth={16} />
              {active && <path d={seg.d} fill="none" stroke="#fff" strokeWidth={5} opacity={0.5} strokeLinecap="round" />}
              <text className="jm-dist-label" x={seg.labelAt.x} y={seg.labelAt.y - 8} textAnchor="middle"
                style={{ fill: sec?.miles == null ? '#a09070' : '#fff' }}>
                {sec?.miles == null ? '＋mi' : `${sec.miles}mi`}
              </text>
            </g>
          );
        })}

        {/* Bend handles — one diamond per control point. Drag to shape; double-click
            to remove. Double-click the section line (above) to add a new one. */}
        {isRoute && sel && editing && onCurveDown && road.segs.flatMap((seg) =>
          seg.controls.map((c) => (
            <rect
              key={`bend-${seg.index}-${c.ptIdx}`}
              x={c.x - 4}
              y={c.y - 4}
              width={8}
              height={8}
              transform={`rotate(45 ${c.x} ${c.y})`}
              fill="#fff"
              stroke={color}
              strokeWidth={1.5}
              style={{ cursor: 'grab' }}
              onMouseDown={(e) => onCurveDown(p, seg.index, c.ptIdx, e)}
              onDoubleClick={(e) => { e.stopPropagation(); onRemoveCurvePoint?.(p, seg.index, c.ptIdx); }}
            />
          )),
        )}

        {/* Draggable anchor handles for bare junctions only (selected path).
            Location-bound anchors move with their pin, so they get no handle. */}
        {sel && editing && wpts.map((w, i) => {
          if (w.locId != null) return null;
          const s = pctToSvg(w.x, w.y, iw, ih);
          return (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={6}
              fill={color}
              stroke="#fff"
              strokeWidth={2}
              style={{ cursor: 'move' }}
              onMouseDown={(e) => onWaypointDown(p, i, e)}
            />
          );
        })}
      </g>
    );
  });
}

/** Dashed rubber-band preview while drawing a path. */
export function DrawPreview({ draw, cursor, iw, ih }) {
  if (!draw || !draw.pts.length) return null;
  const all = cursor ? [...draw.pts, cursor] : draw.pts;
  if (all.length < 2) return null;
  const points = all.map((p) => { const s = pctToSvg(p.x, p.y, iw, ih); return `${s.x},${s.y}`; }).join(' ');
  return (
    <polyline
      points={points}
      fill="none"
      stroke="var(--gold)"
      strokeWidth={1.5}
      strokeDasharray="6 3"
      opacity={0.7}
      pointerEvents="none"
    />
  );
}

export function EditorRegions({ locations, iw, ih, selLoc, editId, onRegionDown, onVertexDown }) {
  return locations.filter(isRegion).map((loc) => {
    const sel = sameId(loc.id, selLoc);
    const editing = sel && sameId(editId, loc.id); // locked unless explicitly editing
    const points = loc.polygon.map((p) => { const s = pctToSvg(p.x, p.y, iw, ih); return `${s.x},${s.y}`; }).join(' ');
    const c = pctToSvg(loc.x, loc.y, iw, ih);
    return (
      <g key={loc.id} className={`jm-region${sel ? ' sel' : ''}`} style={editing ? { cursor: 'move' } : undefined} onMouseDown={(e) => onRegionDown(loc, e)}>
        <polygon className="jm-region-poly" points={points} />
        <MapLabel x={c.x} y={c.y} text={loc.name} fontSize={11} />
        {loc.linked_map_id && <text className="jm-label" x={c.x} y={c.y - 16} style={{ fontSize: 10, fill: '#e8c96a' }}>🗺</text>}
        {/* Draggable vertex handles — only while this region is in edit mode */}
        {editing && loc.polygon.map((p, i) => {
          const s = pctToSvg(p.x, p.y, iw, ih);
          return (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={5}
              fill="#c9a84c"
              stroke="#fff"
              strokeWidth={1.5}
              opacity={0.85}
              style={{ cursor: 'move' }}
              onMouseDown={(e) => onVertexDown(loc, i, e)}
            />
          );
        })}
      </g>
    );
  });
}

/** Measure-tool overlay: dashed line + numbered markers through the picked pins. */
export function MeasureOverlay({ measurePts, placedLocs, iw, ih }) {
  const locs = measurePts.map((id) => placedLocs.find((l) => sameId(l.id, id))).filter(Boolean);
  if (!locs.length) return null;
  const line = locs.length >= 2
    ? locs.map((l) => { const s = pctToSvg(l.x, l.y, iw, ih); return `${s.x},${s.y}`; }).join(' ')
    : null;
  return (
    <g pointerEvents="none">
      {line && <polyline points={line} fill="none" stroke="#70e0a0" strokeWidth={2.5} strokeDasharray="8 4" opacity={0.9} />}
      {locs.map((l, i) => {
        const s = pctToSvg(l.x, l.y, iw, ih);
        return (
          <g key={l.id}>
            <circle cx={s.x} cy={s.y} r={7} fill={i === 0 ? '#70e0a0' : '#a0f0c0'} stroke="#fff" strokeWidth={1.5} opacity={0.85} />
            <text className="jm-dist-label" x={s.x} y={s.y - 12} style={{ fill: '#70e0a0' }}>{i + 1}</text>
          </g>
        );
      })}
    </g>
  );
}

/** Dashed rubber-band preview while drawing a region polygon. */
export function RegionPreview({ region, cursor, iw, ih }) {
  if (!region || !region.pts.length) return null;
  const all = cursor ? [...region.pts, cursor] : region.pts;
  const points = all.map((p) => { const s = pctToSvg(p.x, p.y, iw, ih); return `${s.x},${s.y}`; }).join(' ');
  return (
    <polygon
      points={points}
      fill="rgba(201,168,76,0.12)"
      stroke="var(--gold)"
      strokeWidth={1.5}
      strokeDasharray="6 3"
      opacity={0.8}
      pointerEvents="none"
    />
  );
}

export function EditorPins({ locations, iw, ih, selLoc, onPinDown, typeImages }) {
  const [hoverId, setHoverId] = useState(null); // labels hidden except big/huge → show on hover
  // Lay the labels out once per data/size change: each keeps its pin's x, but we
  // nudge y so labels that share horizontal space don't overlap (auto-declutter).
  const pins = useMemo(() => {
    const arr = locations.filter((l) => !isRegion(l)).map((loc) => {
      const { x, y } = pctToSvg(loc.x, loc.y, iw, ih);
      const fmt = pinLabelStyle(loc.size_type);
      const text = fmt.upper ? (loc.name || '').toUpperCase() : (loc.name || '');
      // Label box ≈ the parchment plate, so de-cluttering keeps plates from overlapping.
      const w = text.length * fmt.fontSize * (fmt.upper ? 0.82 : 0.62) + fmt.fontSize;
      const h = fmt.fontSize * 1.7;
      const labelBase = y + pinSize(loc.icon_scale) / 2 + 6 + fmt.fontSize; // baseline just below the icon
      return { loc, x, y, fmt, text, w, h, labelBase, labelY: labelBase };
    });
    // Vertical separation pass (x fixed → labels stay under their pins).
    for (let iter = 0; iter < 80; iter++) {
      let moved = false;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i], b = arr[j];
          if (Math.abs(a.x - b.x) >= (a.w + b.w) / 2) continue; // no horizontal overlap
          const dy = b.labelY - a.labelY;
          const minGap = (a.h + b.h) / 2 + 2;
          if (Math.abs(dy) >= minGap) continue;
          const push = (minGap - Math.abs(dy)) / 2 + 0.1;
          if (dy >= 0) { a.labelY -= push; b.labelY += push; }
          else { a.labelY += push; b.labelY -= push; }
          moved = true;
        }
      }
      if (!moved) break;
    }
    return arr;
  }, [locations, iw, ih]);

  return pins.map(({ loc, x, y, fmt, labelBase, labelY }) => {
    const sel = sameId(loc.id, selLoc);
    const shifted = Math.abs(labelY - labelBase) > 6; // pulled away → draw a leader line
    // Only big/huge names stay on the map; the rest reveal on hover.
    const showLabel = !!fmt.upper || sameId(hoverId, loc.id);
    return (
      <g
        key={loc.id}
        className={`jm-pin${sel ? ' sel' : ''}`}
        onMouseDown={(e) => onPinDown(loc, e)}
        onMouseEnter={() => setHoverId(loc.id)}
        onMouseLeave={() => setHoverId((h) => (sameId(h, loc.id) ? null : h))}
      >
        {shifted && showLabel && (
          <line x1={x} y1={y + pinSize(loc.icon_scale) / 2} x2={x} y2={labelY - fmt.fontSize} stroke="var(--border2)" strokeWidth={0.75} opacity={0.55} />
        )}
        <PinIcon x={x} y={y} sizeType={loc.size_type} scale={loc.icon_scale} selected={sel} imageUrl={effectivePinImage(loc, typeImages)} />
        {showLabel && (
          <MapLabel
            x={x} y={labelY} text={loc.name}
            fontSize={fmt.fontSize} fontWeight={fmt.fontWeight}
            fontStyle={fmt.fontStyle} letterSpacing={fmt.letterSpacing}
            uppercase={!!fmt.upper}
          />
        )}
      </g>
    );
  });
}
