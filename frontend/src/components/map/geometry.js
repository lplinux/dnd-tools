/**
 * components/map/geometry.js
 *
 * Pure helpers shared by the journey-map renderer (public viewer today, the
 * DM editor once it is migrated). No React — just coordinate math and the
 * small data-shape normalisers the SVG layers need.
 */

/** Travel speeds in miles/hour, used to derive travel-time estimates. */
export const SPEEDS = { walk: 3, horse: 8, fly: 25 };

/** Convert a percentage coordinate (0–100) to SVG/image-pixel space. */
export function pctToSvg(px, py, iw, ih) {
  return { x: (px * iw) / 100, y: (py * ih) / 100 };
}

/** A section's bend control points as an array (normalises the legacy single
 *  `{x,y}` form to `[{x,y}]`). Empty when the section is straight. */
export function curvePoints(wp) {
  const c = wp?.curve;
  if (!c) return [];
  if (Array.isArray(c)) return c.filter((p) => p && p.x != null && p.y != null);
  return c.x != null && c.y != null ? [c] : [];
}

/** Catmull-Rom spline commands through pixel points (smoothly passes through each).
 *  Returns the path commands AFTER the initial point (an `L` for a straight pair,
 *  else a chain of cubic `C` segments). */
function splineCommands(points) {
  if (points.length < 2) return '';
  if (points.length === 2) return `L ${points[1].x} ${points[1].y}`;
  let s = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    s += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return s.trim();
}

/**
 * Build the SVG path for a road/path. A section bends through any number of
 * `curve` control points (a smooth spline); with none it's a straight line. The
 * `curve` points are shape-only — they never affect distance or the graph.
 *
 * Returns { d, segs } where `d` is the full path and each `segs[i]` is
 * { index, d, labelAt:{x,y}, controls:[{ptIdx,x,y}] } in pixel space — `d` is that
 * section's own path (hit overlay), `labelAt` is the chord midpoint (distance label),
 * and `controls` are the draggable bend-handle positions.
 */
export function buildRoadPath(wpts, iw, ih) {
  const segs = [];
  if (!wpts || wpts.length < 2) {
    const p = wpts && wpts[0] ? pctToSvg(wpts[0].x, wpts[0].y, iw, ih) : { x: 0, y: 0 };
    return { d: `M ${p.x} ${p.y}`, segs };
  }
  const p0 = pctToSvg(wpts[0].x, wpts[0].y, iw, ih);
  let d = `M ${p0.x} ${p0.y}`;
  for (let i = 0; i < wpts.length - 1; i++) {
    const a = pctToSvg(wpts[i].x, wpts[i].y, iw, ih);
    const b = pctToSvg(wpts[i + 1].x, wpts[i + 1].y, iw, ih);
    const ctrlPct = curvePoints(wpts[i + 1]);
    const ctrl = ctrlPct.map((c, ptIdx) => ({ ptIdx, ...pctToSvg(c.x, c.y, iw, ih) }));
    const cmds = splineCommands([a, ...ctrl.map((c) => ({ x: c.x, y: c.y })), b]);
    d += ` ${cmds}`;
    segs.push({
      index: i,
      d: `M ${a.x} ${a.y} ${cmds}`,
      labelAt: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      controls: ctrl,
    });
  }
  return { d, segs };
}

/** Format a duration in hours as e.g. "45min", "6.5h", "2d3h". */
export function fmtTime(hrs) {
  if (hrs < 1) return Math.round(hrs * 60) + 'min';
  if (hrs < 24) return hrs.toFixed(1) + 'h';
  const d = Math.floor(hrs / 24);
  const h = Math.round(hrs % 24);
  return h > 0 ? `${d}d${h}h` : `${d}d`;
}

/** Walk/horse/fly travel times for a distance in miles. */
export function travelTimes(miles) {
  return {
    walk: fmtTime(miles / SPEEDS.walk),
    horse: fmtTime(miles / SPEEDS.horse),
    fly: fmtTime(miles / SPEEDS.fly),
  };
}

/**
 * Editor travel-time formatter. Unlike `fmtTime` (used by the public read-only
 * view, which rolls into days at 24h), the DM editor counts only
 * `hoursPerDay` active travel hours per day and rounds up.
 */
export function fmtTravelTime(hrs, hoursPerDay = 8) {
  if (hrs < 1) return Math.round(hrs * 60) + 'min';
  if (hrs < hoursPerDay) return hrs.toFixed(1) + 'h';
  return Math.ceil(hrs / hoursPerDay) + 'd';
}

/** Find a placed location within `threshold` (% units) of (x,y) → {x,y,locId} | null. */
export function snapToPin(x, y, placedLocs, threshold = 3) {
  for (const loc of placedLocs) {
    if (Math.hypot(loc.x - x, loc.y - y) < threshold) {
      return { x: loc.x, y: loc.y, locId: loc.id };
    }
  }
  return null;
}

/** Stored distance (miles) between two placed-location ids, or null if unset. */
export function distanceBetween(aId, bId, distances) {
  const d = (distances || []).find(
    (row) =>
      (sameId(row.from_loc_id, aId) && sameId(row.to_loc_id, bId)) ||
      (sameId(row.from_loc_id, bId) && sameId(row.to_loc_id, aId)),
  );
  return d ? parseFloat(d.distance_miles) : null;
}

/** Display label for a waypoint: its placed-location name, else "Point N" (1-based). */
export function waypointLabel(w, idx, placedLocs = []) {
  if (w && w.locId != null) {
    const loc = (placedLocs || []).find((l) => sameId(l.id, w.locId));
    if (loc) return loc.name;
  }
  return `Point ${idx + 1}`;
}

/**
 * Distance along a waypoint chain, summed **per section** (the segment between
 * two consecutive points). Each section's distance is the stored location-pair
 * distance from the matrix (`distanceBetween`). Routes write those pair
 * distances; paths and the measure tool read them.
 *
 * Returns { miles, complete, sections } where each section is
 * { index, fromName, toName, fromLocId, toLocId, miles, source: 'matrix'|null }.
 * `complete` is false (miles null) when any section's pair has no stored distance.
 */
export function computePathDistance(wpts, distances, placedLocs = []) {
  const sections = [];
  if (!wpts || wpts.length < 2) return { miles: 0, complete: true, sections };
  let total = 0;
  let complete = true;
  for (let i = 0; i < wpts.length - 1; i++) {
    const a = wpts[i];
    const b = wpts[i + 1];
    const miles = a.locId && b.locId ? distanceBetween(a.locId, b.locId, distances) : null;
    if (miles === null) complete = false;
    else total += miles;
    sections.push({
      index: i,
      fromName: waypointLabel(a, i, placedLocs),
      toName: waypointLabel(b, i + 1, placedLocs),
      fromLocId: a.locId ?? null,
      toLocId: b.locId ?? null,
      miles,
      source: miles === null ? null : 'matrix',
    });
  }
  return { miles: complete ? +total.toFixed(2) : null, complete, sections };
}

/**
 * Tie a route/path's anchor waypoints to their placed locations: any waypoint
 * with a `locId` takes that location's CURRENT x/y (the stored copy can be stale
 * after the pin was moved), so routes follow their locations. Bare junctions and
 * all other fields are untouched. Used only for rendering — distances key off
 * `locId`, so they're unaffected.
 */
export function resolveWaypoints(wpts, placedLocs) {
  if (!placedLocs || !placedLocs.length) return wpts;
  return (wpts || []).map((w) => {
    if (w.locId == null) return w;
    const loc = placedLocs.find((l) => sameId(l.id, w.locId));
    return loc ? { ...w, x: loc.x, y: loc.y } : w;
  });
}

/** A finite per-section miles value (`segMiles`) or null. 0 is valid; ''/undefined are not. */
export function segMilesOf(w) {
  if (w == null || w.segMiles == null || w.segMiles === '') return null;
  const n = parseFloat(w.segMiles);
  return Number.isFinite(n) ? n : null;
}

/**
 * Distance along a ROAD (route), summed from the per-section distances stored on
 * the road itself (`segMiles` on each section's end waypoint) — roads can pass
 * through bare junctions that aren't locations, so they don't use the matrix.
 *
 * Returns { miles, complete, sections } with each section
 * { index, fromName, toName, miles, source: 'route'|null }.
 */
export function roadDistance(wpts, placedLocs = []) {
  const sections = [];
  if (!wpts || wpts.length < 2) return { miles: 0, complete: true, sections };
  let total = 0;
  let complete = true;
  for (let i = 0; i < wpts.length - 1; i++) {
    const miles = segMilesOf(wpts[i + 1]);
    if (miles === null) complete = false;
    else total += miles;
    sections.push({
      index: i,
      fromName: waypointLabel(wpts[i], i, placedLocs),
      toName: waypointLabel(wpts[i + 1], i + 1, placedLocs),
      miles,
      source: miles === null ? null : 'route',
    });
  }
  return { miles: complete ? +total.toFixed(2) : null, complete, sections };
}

// ── Road-network distances ────────────────────────────────────────────────
// All location distances derive from the drawn roads: build a weighted graph
// from every route's sections (segMiles) and take the shortest path between two
// locations. Roads connect to each other at shared locations; bare junctions are
// road-local pass-through nodes. A section with no distance is not a usable edge.

/** Node id for a road waypoint: shared `L<locId>` for locations, else road-local. */
function roadNodeId(w, pathId, idx) {
  return w.locId != null ? `L${w.locId}` : `R${pathId}#${idx}`;
}

/** Weighted adjacency map built from all `kind:'route'` roads. */
function buildRoadGraph(paths) {
  const adj = new Map();
  const link = (a, b, w) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push({ to: b, w });
  };
  for (const p of paths || []) {
    if (p.kind !== 'route') continue;
    const wps = parseWaypoints(p);
    for (let i = 0; i < wps.length - 1; i++) {
      const miles = segMilesOf(wps[i + 1]);
      if (miles === null) continue; // section distance not set → no usable edge
      const a = roadNodeId(wps[i], p.id, i);
      const b = roadNodeId(wps[i + 1], p.id, i + 1);
      link(a, b, miles);
      link(b, a, miles);
    }
  }
  return adj;
}

/** Dijkstra shortest distances from `start` over the adjacency map. */
function dijkstra(adj, start) {
  const dist = new Map([[start, 0]]);
  const visited = new Set();
  while (visited.size < dist.size) {
    let cur = null;
    let best = Infinity;
    for (const [node, d] of dist) {
      if (!visited.has(node) && d < best) { best = d; cur = node; }
    }
    if (cur === null) break;
    visited.add(cur);
    for (const { to, w } of adj.get(cur) || []) {
      const nd = best + w;
      if (nd < (dist.get(to) ?? Infinity)) dist.set(to, nd);
    }
  }
  return dist;
}

/**
 * Distances between every pair of locations reachable over the road network,
 * as `{ from_loc_id, to_loc_id, distance_miles }` rows (both directions) — the
 * same shape as the stored matrix, so all consumers of `distanceBetween` work
 * unchanged.
 */
export function networkDistances(paths) {
  const adj = buildRoadGraph(paths);
  const locNodes = [...adj.keys()].filter((k) => k[0] === 'L');
  const rows = [];
  for (const s of locNodes) {
    const dist = dijkstra(adj, s);
    for (const [node, d] of dist) {
      if (node !== s && node[0] === 'L') {
        rows.push({ from_loc_id: +s.slice(1), to_loc_id: +node.slice(1), distance_miles: +d.toFixed(2) });
      }
    }
  }
  return rows;
}

/** Road-network distances first, falling back to stored matrix rows for pairs
 *  no road connects. Pass the result anywhere a `distances` array is expected. */
export function effectiveDistances(paths, stored) {
  const rows = networkDistances(paths);
  const seen = new Set(rows.map((r) => `${r.from_loc_id}|${r.to_loc_id}`));
  for (const r of stored || []) {
    if (!seen.has(`${r.from_loc_id}|${r.to_loc_id}`)) rows.push(r);
  }
  return rows;
}

/** Size tier used by the right-panel proximity distance filter. */
export function locTier(sizeType) {
  const s = (sizeType || '').toLowerCase();
  if (s === 'huge' || s === 'big') return 'big';
  if (s === 'medium' || s === 'small') return 'med';
  return 'other';
}

/**
 * The set of other placed locations to show in a location's distance card,
 * filtered by size-tier proximity rules and sorted nearest-first. Faithful port
 * of the legacy `shouldShow`/`visibleLocs` logic.
 *
 * @returns {{ visible: object[], hiddenCount: number }}
 */
export function proximityVisibleLocations(src, placedLocs, distances) {
  const srcTier = locTier(src.size_type);
  const dist = (a, b) => distanceBetween(a, b, distances);

  // Distances come from the road network: a location is "near" only if a road
  // actually connects it within range. Unknown (unconnected) → not shown. The one
  // exception is the spec rule that Big cities always list other Big cities.
  const within = (mi, max) => mi !== null && mi <= max;

  function shouldShow(other) {
    const dstTier = locTier(other.size_type);
    const mi = dist(src.id, other.id);
    if (srcTier === 'big') {
      if (dstTier === 'big') return true;
      if (dstTier === 'med') return within(mi, 150);
      return within(mi, 50);
    }
    if (srcTier === 'med') {
      if (dstTier === 'big') return within(mi, 150);
      if (dstTier === 'med') return within(mi, 100);
      return within(mi, 50);
    }
    // srcTier === 'other'
    if (dstTier === 'big') {
      const closestBig = placedLocs
        .filter((l) => l.id !== src.id && locTier(l.size_type) === 'big')
        .map((l) => ({ l, mi: dist(src.id, l.id) }))
        .filter((x) => x.mi !== null)
        .sort((a, b) => a.mi - b.mi)[0];
      return closestBig ? other.id === closestBig.l.id : false;
    }
    if (dstTier === 'med') return within(mi, 80);
    return within(mi, 50);
  }

  const visible = placedLocs
    .filter((l) => l.id !== src.id && shouldShow(l))
    .sort((a, b) => (dist(src.id, a.id) ?? Infinity) - (dist(src.id, b.id) ?? Infinity));
  const hiddenCount = placedLocs.filter((l) => l.id !== src.id).length - visible.length;
  return { visible, hiddenCount };
}

/** Loose id comparison — ids arrive as numbers or strings across waypoints/rows. */
export const sameId = (a, b) => String(a) === String(b);

/** Waypoints may be stored as a JSON string or a parsed array. */
export function parseWaypoints(path) {
  if (!path) return [];
  return Array.isArray(path.waypoints) ? path.waypoints : JSON.parse(path.waypoints || '[]');
}

/** A location is a region (polygon) when it has 3+ polygon points; otherwise a pin. */
export function isRegion(loc) {
  return !!(loc.polygon && Array.isArray(loc.polygon) && loc.polygon.length >= 3);
}

/** Normalise a waypoint's event references (supports legacy single + array forms). */
export function waypointEvents(w) {
  const ids = w.eventIds || (w.eventId ? [w.eventId] : []);
  const titles = w.eventTitles || (w.eventTitle ? [w.eventTitle] : []);
  return ids.map((id, i) => ({ id, title: titles[i] || 'Event' }));
}

/**
 * Collect the unique timeline events linked to a location, across every path's
 * waypoints. Each entry carries the originating path name for display.
 */
export function linkedEventsForLoc(locId, paths) {
  const out = [];
  (paths || []).forEach((p) => {
    parseWaypoints(p).forEach((w) => {
      if (!sameId(w.locId, locId)) return;
      waypointEvents(w).forEach((e) => {
        if (!out.some((x) => sameId(x.id, e.id))) {
          out.push({ ...e, pathName: p.name || 'Path' });
        }
      });
    });
  });
  return out;
}
