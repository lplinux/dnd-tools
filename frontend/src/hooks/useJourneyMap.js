/**
 * hooks/useJourneyMap.js
 *
 * Data + API backbone for the journey-map DM editor. Owns campaign/map
 * selection, all map entities (placed locations, distances, paths,
 * background image), the active tool, and the current selection — plus
 * every API action that mutates them.
 *
 * Transient interaction state (drawing points, drag, measure) lives in
 * `useMapInteraction` (Phase 4); this hook exposes the persistence actions and
 * the entity setters that interaction needs for live updates.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { journeyMapsApi } from '@/api/journeyMaps';
import { campaignsApi } from '@/api/campaigns';
import { timelineApi } from '@/api/timeline';
import { locationTypeImagesApi } from '@/api/locationTypeImages';
import { useToast } from '@/hooks/useToast';
import { sameId, parseWaypoints, snapToPin, effectiveDistances, curvePoints } from '@/components/map/geometry';
import { derivePaths } from '@/components/map/derivePaths';
import { compressImage } from '@/components/map/compressImage';

export function useJourneyMap() {
  const { toast } = useToast();

  // ── Selectors / campaign context ───────────────────────────
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState(null);
  const [maps, setMaps] = useState([]);
  const [mapId, setMapId] = useState(null);
  const [campaignLocs, setCampaignLocs] = useState([]);
  const [campaignPlayers, setCampaignPlayers] = useState([]);
  const [campaignNpcs, setCampaignNpcs] = useState([]);   // { id, name }
  const [campaignEvents, setCampaignEvents] = useState([]); // all timeline rows (for derived paths)
  const [typeImages, setTypeImages] = useState({}); // global default pin images by size_type
  const [scope, setScope] = useState({ type: 'continent', locationId: null });

  // ── Map entities ───────────────────────────────────────────
  const [placedLocs, setPlacedLocs] = useState([]);
  const [distances, setDistances] = useState([]);
  const [paths, setPaths] = useState([]);
  const [mapImage, setMapImage] = useState(null);

  // Location distances derived from the drawn road network (shortest path over
  // routes), falling back to the stored matrix for pairs no road connects. This
  // is what paths, the measure tool, the matrix and proximity all consume.
  const routeDistances = useMemo(() => effectiveDistances(paths, distances), [paths, distances]);

  // Movement paths are DERIVED from timeline events (Party + per-NPC), never drawn/stored.
  // The renderer sees stored ROUTES + these derived paths (legacy stored kind='path' is ignored).
  const derivedPaths = useMemo(
    () => derivePaths({ events: campaignEvents, placedLocs, players: campaignPlayers, npcs: campaignNpcs }),
    [campaignEvents, placedLocs, campaignPlayers, campaignNpcs],
  );
  const allPaths = useMemo(
    () => [...paths.filter((p) => p.kind === 'route'), ...derivedPaths],
    [paths, derivedPaths],
  );

  // ── Selection / tool ───────────────────────────────────────
  const [selectedLoc, setSelectedLoc] = useState(null);
  const [selectedPath, setSelectedPath] = useState(null);
  const [activeTool, setActiveTool] = useState('select');

  // Keep the live `mapId` available to async closures without stale reads.
  const mapIdRef = useRef(null);
  mapIdRef.current = mapId;

  const fail = useCallback((e) => toast(e?.message || String(e), 'error'), [toast]);

  // ─────────────────────────────────────────────────────────────
  // Campaign / map loading
  // ─────────────────────────────────────────────────────────────
  const resetMapState = useCallback(() => {
    setPlacedLocs([]); setDistances([]); setPaths([]);
    setMapImage(null); setSelectedLoc(null); setSelectedPath(null);
  }, []);

  const selectMap = useCallback(async (id, mapList = maps) => {
    setMapId(id);
    resetMapState();
    if (!id) return;
    try {
      const [locs, dist, pth, imgData] = await Promise.all([
        journeyMapsApi.listLocations(id),
        journeyMapsApi.listDistances(id),
        journeyMapsApi.listPaths(id),
        journeyMapsApi.getImage(id),
      ]);
      setPlacedLocs(locs);
      setDistances(dist);
      setPaths(pth);
      const meta = mapList.find((m) => sameId(m.id, id));
      setScope({
        type: meta?.scope_type || 'continent',
        locationId: meta?.scope_location_id ? parseInt(meta.scope_location_id) : null,
      });
      setMapImage(imgData.image || null);
    } catch (e) { fail(e); }
  }, [maps, resetMapState, fail]);

  const selectCampaign = useCallback(async (id) => {
    setCampaignId(id);
    setMapId(null);
    resetMapState();
    setMaps([]);
    if (!id) return;
    try {
      const [locs, mapsData, players, npcs, events] = await Promise.all([
        campaignsApi.listLocations(id),
        journeyMapsApi.list(id),
        campaignsApi.listPlayers(id).catch(() => []),
        campaignsApi.listNpcs(id).catch(() => []),
        timelineApi.allForCampaign(id).catch(() => []),
      ]);
      setCampaignLocs(locs);
      setMaps(mapsData);
      setCampaignPlayers(players || []);
      setCampaignNpcs(npcs || []);
      setCampaignEvents(events || []);
      setScope({ type: 'continent', locationId: null });
      if (mapsData.length === 1) selectMap(mapsData[0].id, mapsData);
    } catch (e) { fail(e); }
  }, [resetMapState, selectMap, fail]);

  // Load campaigns + global default pin images once on mount.
  useEffect(() => {
    (async () => {
      try {
        const r = await campaignsApi.list();
        setCampaigns(r);
        if (r.length === 1) selectCampaign(r[0].id);
      } catch { toast('Could not load campaigns', 'error'); }
    })();
    locationTypeImagesApi.getAll().then(setTypeImages).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Map CRUD
  // ─────────────────────────────────────────────────────────────
  const createMap = useCallback(async ({ name, description, scopeType, scopeLocId }) => {
    const m = await journeyMapsApi.create(campaignId, {
      name,
      description,
      scope_type: scopeType,
      scope_location_id: scopeLocId ? parseInt(scopeLocId) : null,
    });
    const next = [...maps, m];
    setMaps(next);
    await selectMap(m.id, next);
    toast(`Map "${name}" created`);
    return m;
  }, [campaignId, maps, selectMap, toast]);

  const deleteMap = useCallback(async () => {
    if (!mapId) return;
    try {
      await journeyMapsApi.remove(mapId);
      setMaps((prev) => prev.filter((m) => !sameId(m.id, mapId)));
      setMapId(null);
      resetMapState();
      toast('Map deleted');
    } catch (e) { fail(e); }
  }, [mapId, resetMapState, toast, fail]);

  // ─────────────────────────────────────────────────────────────
  // Background image
  // ─────────────────────────────────────────────────────────────
  const uploadImage = useCallback(async (file) => {
    if (!mapId || !file) return;
    if (file.size > 20 * 1024 * 1024) { toast('File exceeds 20 MB — please use a smaller image', 'error'); return; }
    toast('Processing image…');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
      const compressed = await compressImage(dataUrl);
      setMapImage(compressed);
      await journeyMapsApi.saveImage(mapId, { image: compressed });
      const kb = Math.round((compressed.length * 3 / 4) / 1024);
      toast(`Map image saved (${kb} KB)`);
    } catch (e) { fail(e); }
  }, [mapId, toast, fail]);

  const clearImage = useCallback(async () => {
    setMapImage(null);
    try { await journeyMapsApi.saveImage(mapId, { image: null }); } catch (e) { fail(e); }
  }, [mapId, fail]);

  // ─────────────────────────────────────────────────────────────
  // Locations
  // ─────────────────────────────────────────────────────────────
  const placeLocation = useCallback(async (campLocId, name, x, y) => {
    try {
      const loc = await journeyMapsApi.addLocation(mapId, { campaign_location_id: campLocId, name, x, y });
      setPlacedLocs((prev) => [...prev, loc]);
      toast(`"${name}" placed`);
      return loc;
    } catch (e) { fail(e); }
  }, [mapId, toast, fail]);

  const deletePlacedLoc = useCallback(async (id) => {
    try {
      await journeyMapsApi.removeLocation(mapId, id);
      setPlacedLocs((prev) => prev.filter((l) => !sameId(l.id, id)));
      setDistances((prev) => prev.filter((d) => !sameId(d.from_loc_id, id) && !sameId(d.to_loc_id, id)));
      setSelectedLoc((cur) => (sameId(cur, id) ? null : cur));
    } catch (e) { fail(e); }
  }, [mapId, fail]);

  /** Persist a placed location's geometry (x/y, polygon, linked map, icon scale). */
  const saveLocGeometry = useCallback(async (loc) => {
    try {
      await journeyMapsApi.updateLocation(mapId, loc.id, {
        x: loc.x, y: loc.y, polygon: loc.polygon || null, linked_map_id: loc.linked_map_id || null,
        icon_scale: loc.icon_scale ?? 1,
      });
    } catch (e) { fail(e); }
  }, [mapId, fail]);

  /** Set a pin's icon scale — optimistic local update, then persist. */
  const setLocIconScale = useCallback(async (locId, scale) => {
    const s = Number(scale);
    const clamped = Number.isFinite(s) ? Math.max(0.3, Math.min(4, s)) : 1;
    let updated = null;
    setPlacedLocs((prev) => prev.map((l) => {
      if (!sameId(l.id, locId)) return l;
      updated = { ...l, icon_scale: clamped };
      return updated;
    }));
    // Persist via saveLocGeometry so x/y/polygon are sent too (the PUT sets them
    // positionally — a partial update would blank the coordinates).
    if (updated) await saveLocGeometry(updated);
  }, [saveLocGeometry]);

  const saveLocLinkedMap = useCallback(async (locId, linkedMapId) => {
    const newId = linkedMapId ? parseInt(linkedMapId) : null;
    const linkedMap = maps.find((m) => sameId(m.id, newId));
    setPlacedLocs((prev) => prev.map((l) =>
      sameId(l.id, locId)
        ? { ...l, linked_map_id: newId, linked_map_name: linkedMap ? linkedMap.name : null }
        : l));
    try {
      const loc = placedLocs.find((l) => sameId(l.id, locId));
      await journeyMapsApi.updateLocation(mapId, locId, {
        x: loc.x, y: loc.y, polygon: loc.polygon || null, linked_map_id: newId,
      });
    } catch (e) { fail(e); }
  }, [mapId, maps, placedLocs, fail]);

  const finishRegion = useCallback(async (campLocId, name, points) => {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    try {
      const loc = await journeyMapsApi.addLocation(mapId, {
        campaign_location_id: campLocId, name, x: cx, y: cy, polygon: points,
      });
      setPlacedLocs((prev) => [...prev, loc]);
      toast(`Region "${name}" drawn`);
      return loc;
    } catch (e) { fail(e); }
  }, [mapId, toast, fail]);

  // ─────────────────────────────────────────────────────────────
  // Paths
  // ─────────────────────────────────────────────────────────────
  const reloadPaths = useCallback(async () => {
    const pth = await journeyMapsApi.listPaths(mapIdRef.current);
    setPaths(pth);
    return pth;
  }, []);

  const createPath = useCallback(async ({ trackerId, name, waypoints, kind = 'path', routeType = 'road' }) => {
    const p = await journeyMapsApi.addPath(mapId, { tracker_id: trackerId || null, name, waypoints, kind, route_type: routeType });
    await reloadPaths();
    return p;
  }, [mapId, reloadPaths]);

  const extendPath = useCallback(async (pathId, mergedWaypoints, existing) => {
    await journeyMapsApi.updatePath(mapId, pathId, {
      waypoints: mergedWaypoints, name: existing.name, notes: existing.notes,
    });
    await reloadPaths();
  }, [mapId, reloadPaths]);

  /** Persist a path's waypoints (used after waypoint drag / event linking). */
  const saveWaypoints = useCallback(async (path, waypoints) => {
    setPaths((prev) => prev.map((p) => (sameId(p.id, path.id) ? { ...p, waypoints } : p)));
    try {
      await journeyMapsApi.updatePath(mapId, path.id, {
        waypoints, name: path.name, notes: path.notes, tracker_id: path.tracker_id,
      });
    } catch (e) { fail(e); }
  }, [mapId, fail]);

  /** Persist a path/road's name-label position (percent coords). */
  const saveLabelPos = useCallback(async (path, x, y) => {
    setPaths((prev) => prev.map((p) => (sameId(p.id, path.id) ? { ...p, label_x: x, label_y: y } : p)));
    try {
      await journeyMapsApi.updatePath(mapId, path.id, {
        name: path.name, waypoints: path.waypoints, notes: path.notes, label_x: x, label_y: y,
      });
    } catch (e) { fail(e); }
  }, [mapId, fail]);

  const savePathField = useCallback(async (pathId, field, value) => {
    const p = paths.find((x) => sameId(x.id, pathId));
    if (!p) return;
    try {
      const updated = await journeyMapsApi.updatePath(mapId, pathId, {
        waypoints: p.waypoints, notes: p.notes, name: p.name, [field]: value,
      });
      setPaths((prev) => prev.map((x) => (sameId(x.id, pathId) ? { ...x, ...updated } : x)));
    } catch (e) { fail(e); }
  }, [mapId, paths, fail]);

  const deletePath = useCallback(async (id) => {
    try {
      await journeyMapsApi.removePath(mapId, id);
      setPaths((prev) => prev.filter((p) => !sameId(p.id, id)));
      setSelectedPath((cur) => (sameId(cur, id) ? null : cur));
    } catch (e) { fail(e); }
  }, [mapId, fail]);

  /**
   * Remove a single waypoint from a road. The two sections it joined merge into
   * one whose distance is now unknown, so the merged section's `segMiles` is
   * cleared. A road left with <2 points is deleted entirely.
   */
  const deleteRouteWaypoint = useCallback(async (route, wpIdx) => {
    const wpts = parseWaypoints(route).map((w) => ({ ...w }));
    if (wpIdx < 0 || wpIdx >= wpts.length) return;
    wpts.splice(wpIdx, 1);
    if (wpts[wpIdx]) { delete wpts[wpIdx].segMiles; delete wpts[wpIdx].curve; } // merged section reset
    if (wpts.length < 2) { await deletePath(route.id); return; }
    await saveWaypoints(route, wpts);
  }, [saveWaypoints, deletePath]);

  /**
   * Resolve draw points to waypoints, creating campaign+map locations for any
   * point not on an existing pin. Returns { pts, newLocs } where newLocs need a
   * user-supplied name (via the naming modal).
   */
  const ensureWaypointLocations = useCallback(async (pts) => {
    const resolved = [];
    const newLocs = [];
    let counter = 1;
    let working = placedLocs;
    for (const pt of pts) {
      if (pt.locId) { resolved.push(pt); continue; }
      const snap = snapToPin(pt.x, pt.y, working);
      if (snap) { resolved.push({ ...pt, locId: snap.locId }); continue; }
      const placeholder = `Waypoint ${counter++}`;
      try {
        const campLoc = await campaignsApi.addLocation(campaignId, { name: placeholder, description: '' });
        const mapLoc = await journeyMapsApi.addLocation(mapId, {
          campaign_location_id: campLoc.id, name: placeholder, x: pt.x, y: pt.y,
        });
        working = [...working, mapLoc];
        setCampaignLocs((prev) => [...prev, campLoc]);
        setPlacedLocs((prev) => [...prev, mapLoc]);
        resolved.push({ ...pt, locId: mapLoc.id });
        newLocs.push({ campLocId: campLoc.id, mapLocId: mapLoc.id, placeholder });
      } catch {
        resolved.push(pt);
      }
    }
    return { pts: resolved, newLocs };
  }, [campaignId, mapId, placedLocs]);

  /** Rename a path and/or auto-created waypoint locations (naming modal save). */
  const saveNaming = useCallback(async ({ path, locs, pathName, locNames }) => {
    if (path && pathName && pathName !== path.name) {
      try {
        await journeyMapsApi.updatePath(mapId, path.id, {
          name: pathName, waypoints: path.waypoints, notes: path.notes,
        });
        setPaths((prev) => prev.map((p) => (sameId(p.id, path.id) ? { ...p, name: pathName } : p)));
      } catch (e) { toast(`Could not rename path: ${e.message}`, 'error'); }
    }
    for (let i = 0; i < locs.length; i++) {
      const { campLocId, mapLocId } = locs[i];
      const name = (locNames[i]?.name || '').trim() || `Waypoint ${i + 1}`;
      const desc = (locNames[i]?.desc || '').trim();
      try {
        await campaignsApi.updateLocation(campaignId, campLocId, { name, description: desc });
        setCampaignLocs((prev) => prev.map((l) => (sameId(l.id, campLocId) ? { ...l, name, description: desc } : l)));
        setPlacedLocs((prev) => prev.map((l) => (sameId(l.id, mapLocId) ? { ...l, name } : l)));
      } catch (e) { toast(`Could not rename location: ${e.message}`, 'error'); }
    }
  }, [campaignId, mapId, toast]);

  // ─────────────────────────────────────────────────────────────
  // Distances
  // ─────────────────────────────────────────────────────────────
  const saveDistance = useCallback(async (fromId, toId, miles) => {
    try {
      await journeyMapsApi.saveDistance(mapId, { from_loc_id: fromId, to_loc_id: toId, distance_miles: miles });
      setDistances((prev) => {
        const isPair = (d) =>
          (sameId(d.from_loc_id, fromId) && sameId(d.to_loc_id, toId)) ||
          (sameId(d.from_loc_id, toId) && sameId(d.to_loc_id, fromId));
        const rest = prev.filter((d) => !isPair(d));
        return [
          ...rest,
          { map_id: mapId, from_loc_id: fromId, to_loc_id: toId, distance_miles: miles },
          { map_id: mapId, from_loc_id: toId, to_loc_id: fromId, distance_miles: miles },
        ];
      });
      toast(`Distance saved: ${miles} mi`);
    } catch (e) { fail(e); }
  }, [mapId, toast, fail]);

  /**
   * Set a ROAD SECTION distance — the segment between waypoint `sectionIdx` and
   * the next. Stored as `segMiles` on the section's end waypoint (roads can pass
   * through bare junctions, so the distance lives on the road, not the matrix).
   * Pass blank/null to clear it. Persists via the normal waypoints save.
   */
  const setRouteSectionDistance = useCallback(async (route, sectionIdx, miles) => {
    const wpts = parseWaypoints(route).map((w) => ({ ...w }));
    const end = wpts[sectionIdx + 1];
    if (!end) return;
    const num = miles === '' || miles == null ? null : parseFloat(miles);
    if (num == null || Number.isNaN(num) || num < 0) delete end.segMiles;
    else end.segMiles = num;
    await saveWaypoints(route, wpts);
  }, [saveWaypoints]);

  /**
   * Add a bend control point to a ROAD SECTION at map-% `pt`. Inserted in order
   * along the section's chord so multiple bends stay sequenced. Render-only shape
   * data on the section's end waypoint — never affects distance or topology.
   */
  const addSectionCurvePoint = useCallback(async (route, sectionIdx, pt) => {
    const wpts = parseWaypoints(route).map((w) => ({ ...w }));
    const a = wpts[sectionIdx];
    const end = wpts[sectionIdx + 1];
    if (!a || !end || pt?.x == null) return;
    const dx = end.x - a.x;
    const dy = end.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const proj = (p) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2; // position along the chord
    end.curve = [...curvePoints(end), { x: pt.x, y: pt.y }].sort((p, q) => proj(p) - proj(q));
    await saveWaypoints(route, wpts);
  }, [saveWaypoints]);

  /** Remove one bend control point from a road section (clears the array when empty). */
  const removeSectionCurvePoint = useCallback(async (route, sectionIdx, ptIdx) => {
    const wpts = parseWaypoints(route).map((w) => ({ ...w }));
    const end = wpts[sectionIdx + 1];
    if (!end) return;
    const arr = curvePoints(end).filter((_, i) => i !== ptIdx);
    if (arr.length) end.curve = arr; else delete end.curve;
    await saveWaypoints(route, wpts);
  }, [saveWaypoints]);

  // ─────────────────────────────────────────────────────────────
  // Waypoint ↔ timeline-event linking
  // ─────────────────────────────────────────────────────────────
  const loadTimelineEvents = useCallback(async () => {
    try {
      const rows = await timelineApi.allForCampaign(campaignId);
      const seen = new Set();
      return rows
        .filter((r) => r.entry_id && !seen.has(r.entry_id) && seen.add(r.entry_id))
        .map((r) => ({
          id: r.entry_id, title: r.title, year: r.year, dayOfYear: r.day_of_year,
          timelineName: r.timeline_name, playerName: r.player_name,
        }));
    } catch { return []; }
  }, [campaignId]);

  const saveWaypointEvents = useCallback(async (pathId, wpIdx, ids, titles) => {
    const p = paths.find((x) => sameId(x.id, pathId));
    if (!p) return;
    const wpts = parseWaypoints(p);
    const { eventId, eventTitle, eventIds, eventTitles, ...rest } = wpts[wpIdx];
    wpts[wpIdx] = ids.length ? { ...rest, eventIds: ids, eventTitles: titles } : { ...rest };
    try {
      await journeyMapsApi.updatePath(mapId, pathId, { name: p.name, waypoints: wpts, notes: p.notes });
      setPaths((prev) => prev.map((x) => (sameId(x.id, pathId) ? { ...x, waypoints: wpts } : x)));
    } catch (e) { fail(e); }
  }, [mapId, paths, fail]);

  const unlinkWaypointEvent = useCallback(async (pathId, wpIdx, eventId) => {
    const p = paths.find((x) => sameId(x.id, pathId));
    if (!p) return;
    const wpts = parseWaypoints(p);
    const wp = wpts[wpIdx];
    const oldIds = wp.eventIds || [];
    const newIds = oldIds.filter((id) => !sameId(id, eventId));
    const newTitles = (wp.eventTitles || []).filter((_, i) => !sameId(oldIds[i], eventId));
    const { eventId: _a, eventTitle: _b, eventIds: _c, eventTitles: _d, ...rest } = wp;
    wpts[wpIdx] = newIds.length ? { ...rest, eventIds: newIds, eventTitles: newTitles } : { ...rest };
    try {
      await journeyMapsApi.updatePath(mapId, pathId, { name: p.name, waypoints: wpts, notes: p.notes });
      setPaths((prev) => prev.map((x) => (sameId(x.id, pathId) ? { ...x, waypoints: wpts } : x)));
    } catch (e) { fail(e); }
  }, [mapId, paths, fail]);

  // ─────────────────────────────────────────────────────────────
  // Share / export / import
  // ─────────────────────────────────────────────────────────────
  const shareMap = useCallback(async () => {
    const d = await journeyMapsApi.share(mapId);
    return `${window.location.origin}/journey-map-public/${d.token}`;
  }, [mapId]);

  const exportMap = useCallback(async () => {
    if (!mapId) return;
    const [locs, dists, pths, img] = await Promise.all([
      journeyMapsApi.listLocations(mapId),
      journeyMapsApi.listDistances(mapId),
      journeyMapsApi.listPaths(mapId),
      journeyMapsApi.getImage(mapId),
    ]);
    const meta = maps.find((m) => sameId(m.id, mapId)) || {};
    const bundle = {
      version: 1,
      type: 'journey-map',
      map: { name: meta.name || 'Map', description: meta.description || '' },
      map_image: img.image || null,
      locations: locs, distances: dists, paths: pths,
    };
    const slug = (meta.name || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    a.download = `journey-map-${slug}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [mapId, maps]);

  // Journey-map import now lives in the central Manage-Campaigns importer
  // (frontend/src/api/importJourneyMap.js).

  // ─────────────────────────────────────────────────────────────
  // Selection
  // ─────────────────────────────────────────────────────────────
  const selectLocation = useCallback((id) => { setSelectedLoc(id); setSelectedPath(null); }, []);
  const selectPath = useCallback((id) => { setSelectedPath(id); setSelectedLoc(null); }, []);
  const clearSelection = useCallback(() => { setSelectedLoc(null); setSelectedPath(null); }, []);

  return {
    // state
    campaigns, campaignId, maps, mapId, campaignLocs, campaignPlayers, scope,
    placedLocs, distances, mapImage, typeImages,
    // `paths` = stored routes + derived movement paths (Party + per-NPC).
    paths: allPaths,
    derivedPaths, campaignNpcs,
    selectedLoc, selectedPath, activeTool,
    // entity setters (for live interaction updates)
    setPlacedLocs, setPaths, setDistances,
    setActiveTool,
    // selection
    selectLocation, selectPath, clearSelection,
    // campaign/map
    selectCampaign, selectMap, createMap, deleteMap,
    // image
    uploadImage, clearImage,
    // locations
    placeLocation, deletePlacedLoc, saveLocGeometry, saveLocLinkedMap, setLocIconScale, finishRegion,
    // paths
    createPath, extendPath, saveWaypoints, savePathField, saveLabelPos, deletePath,
    ensureWaypointLocations, saveNaming, setRouteSectionDistance, deleteRouteWaypoint,
    addSectionCurvePoint, removeSectionCurvePoint,
    // distances
    saveDistance, routeDistances,
    // events
    loadTimelineEvents, saveWaypointEvents, unlinkWaypointEvent,
    // share/export/import
    shareMap, exportMap,
  };
}
