/**
 * pages/JourneyMap/useMapInteraction.js
 *
 * Tool-driven mouse + keyboard interaction for the journey-map editor.
 *
 * Returns area handlers (onMouseDown/Move/Up/DoubleClick) for <MapStage>, the
 * element handlers (onPinDown/onPathDown/onRegionDown/onWaypointDown/
 * onVertexDown) for the SVG layers, and live drawing state (`draw`, `region`,
 * `cursor`) for the preview overlays.
 *
 * Phases: 4 — pan/place/select/drag-pin/delete + keyboard.
 *         5 — path draw/extend, waypoint drag.
 *         6 — region draw, region body drag, vertex reshape.
 */

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/contexts/ConfirmContext';
import { sameId, snapToPin, parseWaypoints, curvePoints, waypointLabel } from '@/components/map/geometry';
import { REGION_SIZE_TYPES } from './constants';

const clampPct = (v) => Math.max(0, Math.min(100, v));
const centroid = (pts) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});

const ROAD_LABEL = { road: 'Road', flight: 'Flight route', maritime: 'Maritime route' };

export function useMapInteraction(viewport, jm, { placeLocId, onOpenNaming, drawMode = 'path', roadType = 'road', editRegionId = null }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const {
    activeTool, setActiveTool, mapId, campaignLocs, placedLocs, setPlacedLocs,
    paths, setPaths,
    selectLocation, selectPath, clearSelection, deletePlacedLoc, deletePath,
    saveLocGeometry, saveWaypoints, saveLabelPos, selectedLoc, selectedPath,
  } = jm;

  const pan = useRef(null);
  const pinDrag = useRef(null);
  const wpDrag = useRef(null);
  const curveDrag = useRef(null);   // { pathId, secIdx, startCX, startCY, origX, origY }
  const labelDrag = useRef(null);   // { pathId, startCX, startCY, origX, origY }
  const regionDrag = useRef(null);  // { locId, origPts, startCX, startCY }
  const vertexDrag = useRef(null);  // { locId, vtxIdx, origPts, startCX, startCY }

  const [draw, setDraw] = useState(null);     // { pts, extendId } | null
  const [region, setRegion] = useState(null); // { pts, campLocId, name } | null
  const [cursor, setCursor] = useState(null);
  const [measurePts, setMeasurePts] = useState([]); // placed-loc ids, in order

  // Seed/clear transient drawing state on tool change.
  useEffect(() => {
    if (activeTool === 'draw') {
      if (!draw) {
        // Only stored ROUTES can be extended (derived movement paths are read-only).
        const p = selectedPath != null ? paths.find((x) => sameId(x.id, selectedPath) && x.kind === 'route') : null;
        const wpts = p ? parseWaypoints(p) : [];
        if (p && wpts.length) {
          setDraw({ pts: [{ ...wpts[wpts.length - 1] }], extendId: selectedPath });
          toast('Extending road — click to add points');
        }
      }
    } else if (draw) {
      setDraw(null); setCursor(null);
    }
    if (activeTool !== 'region' && region) { setRegion(null); setCursor(null); }
    if (activeTool !== 'measure' && measurePts.length) setMeasurePts([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool]);

  // ── Area-level handlers (empty map space) ──────────────────
  function onMouseDown(e) {
    if (e.button !== 0) return;
    const pct = viewport.screenToPct(e.clientX, e.clientY);

    if (activeTool === 'pan') {
      pan.current = { px: e.clientX, py: e.clientY, ox: viewport.offsetRef.current.x, oy: viewport.offsetRef.current.y };
      return;
    }

    if (activeTool === 'place') {
      if (!mapId) return;
      const id = parseInt(placeLocId);
      if (!id) { toast('Select a location from the dropdown first', 'error'); return; }
      if (placedLocs.some((l) => sameId(l.campaign_location_id, id))) { toast('This location is already on the map', 'error'); return; }
      const campLoc = campaignLocs.find((l) => sameId(l.id, id));
      if (campLoc) jm.placeLocation(id, campLoc.name, pct.x, pct.y);
      return;
    }

    if (activeTool === 'draw') {
      // Draw builds routes (roads) only — no tracker needed.
      if (!mapId) return;
      const snap = snapToPin(pct.x, pct.y, placedLocs);
      const pt = snap ? { x: snap.x, y: snap.y, locId: snap.locId } : { x: pct.x, y: pct.y };
      setDraw((d) => (d ? { ...d, pts: [...d.pts, pt] } : { pts: [pt], extendId: null }));
      return;
    }

    if (activeTool === 'region') {
      if (!mapId) return;
      const id = parseInt(placeLocId);
      if (!id) { toast('Select a region location from the dropdown first', 'error'); return; }
      const campLoc = campaignLocs.find((l) => sameId(l.id, id));
      if (!campLoc) return;
      if (!REGION_SIZE_TYPES.includes(campLoc.size_type)) {
        toast('Use the Place tool for non-region locations, or pick a region-type location', 'error');
        return;
      }
      if (placedLocs.some((l) => sameId(l.campaign_location_id, id))) { toast('This location is already on the map', 'error'); return; }
      setRegion((r) =>
        r ? { ...r, pts: [...r.pts, { x: pct.x, y: pct.y }] } : { pts: [{ x: pct.x, y: pct.y }], campLocId: id, name: campLoc.name });
      return;
    }

    if (activeTool === 'measure') {
      toast('Click a pinned location to measure');
      return;
    }

    if (activeTool === 'select') {
      clearSelection();
    }
  }

  function onMouseMove(e) {
    if (pan.current) {
      const { px, py, ox, oy } = pan.current;
      viewport.panTo(ox + (e.clientX - px), oy + (e.clientY - py));
      return;
    }
    const s = viewport.scaleRef.current;
    const { iw, ih } = viewport.imgSize;

    if (pinDrag.current) {
      const { locId, startCX, startCY, origX, origY } = pinDrag.current;
      const dx = (e.clientX - startCX) / s;
      const dy = (e.clientY - startCY) / s;
      setPlacedLocs((prev) => prev.map((l) =>
        sameId(l.id, locId) ? { ...l, x: clampPct(origX + (dx / iw) * 100), y: clampPct(origY + (dy / ih) * 100) } : l));
      return;
    }
    if (wpDrag.current) {
      const { pathId, wpIdx, startCX, startCY, origX, origY } = wpDrag.current;
      const dx = (e.clientX - startCX) / s;
      const dy = (e.clientY - startCY) / s;
      setPaths((prev) => prev.map((p) => {
        if (!sameId(p.id, pathId)) return p;
        const wpts = parseWaypoints(p).map((w, i) =>
          i === wpIdx ? { ...w, x: clampPct(origX + (dx / iw) * 100), y: clampPct(origY + (dy / ih) * 100) } : w);
        return { ...p, waypoints: wpts };
      }));
      return;
    }
    if (labelDrag.current) {
      const { pathId, startCX, startCY, origX, origY } = labelDrag.current;
      const dx = (e.clientX - startCX) / s;
      const dy = (e.clientY - startCY) / s;
      const nx = clampPct(origX + (dx / iw) * 100);
      const ny = clampPct(origY + (dy / ih) * 100);
      setPaths((prev) => prev.map((p) => (sameId(p.id, pathId) ? { ...p, label_x: nx, label_y: ny } : p)));
      return;
    }
    if (curveDrag.current) {
      const { pathId, secIdx, ptIdx, startCX, startCY, origX, origY } = curveDrag.current;
      const dx = (e.clientX - startCX) / s;
      const dy = (e.clientY - startCY) / s;
      const cx = clampPct(origX + (dx / iw) * 100);
      const cy = clampPct(origY + (dy / ih) * 100);
      setPaths((prev) => prev.map((p) => {
        if (!sameId(p.id, pathId)) return p;
        const wpts = parseWaypoints(p).map((w, i) => {
          if (i !== secIdx + 1) return w;
          const arr = curvePoints(w).map((c, j) => (j === ptIdx ? { x: cx, y: cy } : c));
          return { ...w, curve: arr };
        });
        return { ...p, waypoints: wpts };
      }));
      return;
    }
    if (vertexDrag.current) {
      const { locId, vtxIdx, origPts, startCX, startCY } = vertexDrag.current;
      const dx = (e.clientX - startCX) / s;
      const dy = (e.clientY - startCY) / s;
      setPlacedLocs((prev) => prev.map((l) => {
        if (!sameId(l.id, locId) || !l.polygon) return l;
        const polygon = origPts.map((p, i) =>
          i === vtxIdx ? { x: clampPct(p.x + (dx / iw) * 100), y: clampPct(p.y + (dy / ih) * 100) } : { ...p });
        return { ...l, polygon, ...centroid(polygon) };
      }));
      return;
    }
    if (regionDrag.current) {
      const { locId, origPts, startCX, startCY } = regionDrag.current;
      const dxPct = ((e.clientX - startCX) / s / iw) * 100;
      const dyPct = ((e.clientY - startCY) / s / ih) * 100;
      setPlacedLocs((prev) => prev.map((l) => {
        if (!sameId(l.id, locId) || !l.polygon) return l;
        const polygon = origPts.map((p) => ({ x: clampPct(p.x + dxPct), y: clampPct(p.y + dyPct) }));
        return { ...l, polygon, ...centroid(polygon) };
      }));
      return;
    }
    if (draw || region) setCursor(viewport.screenToPct(e.clientX, e.clientY));
  }

  function onMouseUp() {
    if (pan.current) { pan.current = null; return; }
    if (pinDrag.current) {
      const loc = placedLocs.find((l) => sameId(l.id, pinDrag.current.locId));
      if (loc) saveLocGeometry(loc);
      pinDrag.current = null;
      return;
    }
    if (wpDrag.current) {
      const { pathId, wpIdx } = wpDrag.current;
      const p = paths.find((x) => sameId(x.id, pathId));
      if (p) {
        const wpts = parseWaypoints(p).map((w) => ({ ...w }));
        const wp = wpts[wpIdx];
        const snap = snapToPin(wp.x, wp.y, placedLocs);
        wpts[wpIdx] = snap ? { ...wp, locId: snap.locId } : { x: wp.x, y: wp.y };
        saveWaypoints(p, wpts);
      }
      wpDrag.current = null;
      return;
    }
    if (labelDrag.current) {
      const { pathId } = labelDrag.current;
      const p = paths.find((x) => sameId(x.id, pathId));
      if (p) saveLabelPos(p, p.label_x, p.label_y);
      labelDrag.current = null;
      return;
    }
    if (curveDrag.current) {
      const { pathId } = curveDrag.current;
      const p = paths.find((x) => sameId(x.id, pathId));
      if (p) saveWaypoints(p, parseWaypoints(p));
      curveDrag.current = null;
      return;
    }
    if (vertexDrag.current || regionDrag.current) {
      const ref = vertexDrag.current || regionDrag.current;
      const loc = placedLocs.find((l) => sameId(l.id, ref.locId));
      if (loc) saveLocGeometry(loc);
      vertexDrag.current = null;
      regionDrag.current = null;
    }
  }

  async function finishPath() {
    const d = draw;
    setCursor(null);
    if (!d || d.pts.length < 2) { setDraw(null); return; }
    setDraw(null);
    try {
      // The Draw tool builds ROUTES (roads) only — movement paths are derived from
      // the timeline. Route points keep bare {x,y} junctions; a pin click adds a locId.
      const existing = d.extendId ? jm.paths.find((p) => sameId(p.id, d.extendId)) : null;
      const pts = d.pts.map((p) => (p.locId != null ? { x: p.x, y: p.y, locId: p.locId } : { x: p.x, y: p.y }));

      if (d.extendId && existing) {
        const merged = [...parseWaypoints(existing), ...pts.slice(1)];
        await jm.extendPath(d.extendId, merged, existing);
        selectPath(d.extendId);
        toast('Road extended');
      } else {
        // Default the road name to its endpoints ("Start City ⇄ End City") when both
        // ends snap to placed locations; otherwise fall back to the type label.
        const first = pts[0];
        const last  = pts[pts.length - 1];
        const name  = (first?.locId != null && last?.locId != null)
          ? `${waypointLabel(first, 0, placedLocs)} ⇄ ${waypointLabel(last, pts.length - 1, placedLocs)}`
          : (ROAD_LABEL[roadType] || 'Road');
        const p = await jm.createPath({ trackerId: null, name, waypoints: pts, kind: 'route', routeType: roadType });
        selectPath(p.id);
        toast('Road created — set section distances in the panel');
      }
    } catch (e) { toast(e.message, 'error'); }
  }

  async function finishRegion() {
    const r = region;
    setCursor(null);
    if (!r || r.pts.length < 3) { toast('Draw at least 3 points to define a region', 'error'); setRegion(null); return; }
    setRegion(null);
    try {
      await jm.finishRegion(r.campLocId, r.name, r.pts);
    } catch (e) { toast(e.message, 'error'); }
  }

  function onDoubleClick() {
    if (activeTool === 'draw' && draw) finishPath();
    if (activeTool === 'region' && region) finishRegion();
  }

  // ── Element-level handlers ─────────────────────────────────
  async function onPinDown(loc, e) {
    if (activeTool === 'pan') return;
    e.stopPropagation();
    if (activeTool === 'measure') {
      setMeasurePts((prev) => (prev.length && sameId(prev[prev.length - 1], loc.id) ? prev.slice(0, -1) : [...prev, loc.id]));
      return;
    }
    if (activeTool === 'delete') {
      if (await confirm('Remove this location from the map?', { title: 'Remove location', confirmLabel: 'Remove' })) deletePlacedLoc(loc.id);
      return;
    }
    // Clicking an existing location while drawing adds it as a waypoint (it carries
    // its locId, so route sections resolve to real location pairs). Pins paint above
    // the path layer, so this fires instead of the map-area handler.
    if (activeTool === 'draw') {
      if (!mapId) return;
      const pt = { x: loc.x, y: loc.y, locId: loc.id };
      setDraw((d) => (d ? { ...d, pts: [...d.pts, pt] } : { pts: [pt], extendId: null }));
      return;
    }
    selectLocation(loc.id);
    if (activeTool === 'select') {
      pinDrag.current = { locId: loc.id, startCX: e.clientX, startCY: e.clientY, origX: loc.x, origY: loc.y };
    }
  }

  async function onPathDown(path, e) {
    if (activeTool === 'pan') return;
    e.stopPropagation();
    // Derived movement paths (Party / NPC) are read-only — select only, never delete.
    const derived = path.id === 'party' || String(path.id).startsWith('npc_');
    if (activeTool === 'delete' && !derived) {
      if (await confirm('Delete this route?', { title: 'Delete route', confirmLabel: 'Delete' })) deletePath(path.id);
      return;
    }
    selectPath(path.id);
  }

  async function onWaypointDown(path, idx, e) {
    if (activeTool === 'pan') return;
    e.stopPropagation();
    if (activeTool === 'delete') {
      if (await confirm('Delete this path?', { title: 'Delete path', confirmLabel: 'Delete' })) deletePath(path.id);
      return;
    }
    const wpts = parseWaypoints(path);
    wpDrag.current = { pathId: path.id, wpIdx: idx, startCX: e.clientX, startCY: e.clientY, origX: wpts[idx].x, origY: wpts[idx].y };
  }

  // Drag a path/road's name-label plate to reposition it (percent coords).
  function onLabelDown(path, e) {
    if (activeTool !== 'select') return;
    e.stopPropagation();
    const wpts = parseWaypoints(path);
    const mid = wpts[Math.floor(wpts.length / 2)] || { x: 50, y: 50 };
    labelDrag.current = {
      pathId: path.id,
      startCX: e.clientX, startCY: e.clientY,
      origX: path.label_x ?? mid.x,
      origY: path.label_y ?? mid.y,
    };
  }

  // Drag one of a section's bend control points (render-only curve).
  function onCurveDown(path, secIdx, ptIdx, e) {
    if (activeTool === 'pan') return;
    e.stopPropagation();
    const c = curvePoints(parseWaypoints(path)[secIdx + 1])[ptIdx];
    if (!c) return;
    curveDrag.current = { pathId: path.id, secIdx, ptIdx, startCX: e.clientX, startCY: e.clientY, origX: c.x, origY: c.y };
  }

  // Double-click a selected road's section to add a bend point there.
  function onSectionAddCurve(path, secIdx, e) {
    e.stopPropagation();
    const pct = viewport.screenToPct(e.clientX, e.clientY);
    jm.addSectionCurvePoint(path, secIdx, pct);
  }

  async function onRegionDown(loc, e) {
    if (activeTool === 'pan') return;
    e.stopPropagation();
    if (activeTool === 'delete') {
      if (await confirm('Remove this region from the map?', { title: 'Remove region', confirmLabel: 'Remove' })) deletePlacedLoc(loc.id);
      return;
    }
    selectLocation(loc.id);
    // Regions are locked by default — only move the body when this region is in edit mode.
    if (activeTool === 'select' && loc.polygon && sameId(editRegionId, loc.id)) {
      regionDrag.current = { locId: loc.id, origPts: loc.polygon.map((p) => ({ ...p })), startCX: e.clientX, startCY: e.clientY };
    }
  }

  async function onVertexDown(loc, idx, e) {
    if (activeTool === 'pan') return;
    e.stopPropagation();
    if (activeTool === 'delete') {
      if (await confirm('Remove this region from the map?', { title: 'Remove region', confirmLabel: 'Remove' })) deletePlacedLoc(loc.id);
      return;
    }
    selectLocation(loc.id);
    if (activeTool === 'select' && loc.polygon && sameId(editRegionId, loc.id)) {
      vertexDrag.current = { locId: loc.id, vtxIdx: idx, origPts: loc.polygon.map((p) => ({ ...p })), startCX: e.clientX, startCY: e.clientY };
    }
  }

  // ── Keyboard (subscribe once; live state via refs) ─────────
  const toolRef = useRef(activeTool); toolRef.current = activeTool;
  const selLocRef = useRef(selectedLoc); selLocRef.current = selectedLoc;
  const selPathRef = useRef(selectedPath); selPathRef.current = selectedPath;
  const drawRef = useRef(draw); drawRef.current = draw;
  const regionRef = useRef(region); regionRef.current = region;
  const finishPathRef = useRef(finishPath); finishPathRef.current = finishPath;
  const finishRegionRef = useRef(finishRegion); finishRegionRef.current = finishRegion;
  const altPrev = useRef(null);

  useEffect(() => {
    const KEY_TOOL = { v: 'select', h: 'pan', p: 'place', r: 'region', d: 'draw', m: 'measure', x: 'delete' };
    function onKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.key === 'Alt' || e.key === 'Meta') && toolRef.current !== 'pan') {
        altPrev.current = toolRef.current; setActiveTool('pan'); return;
      }
      if (e.key === 'Escape') { setActiveTool('select'); return; }
      if (e.key === 'Enter') {
        if (toolRef.current === 'draw' && drawRef.current) { finishPathRef.current(); return; }
        if (toolRef.current === 'region' && regionRef.current) { finishRegionRef.current(); return; }
      }
      if (e.key === 'Delete') {
        if (selLocRef.current != null) deletePlacedLoc(selLocRef.current);
        else if (selPathRef.current != null) deletePath(selPathRef.current);
        return;
      }
      const t = KEY_TOOL[e.key.toLowerCase()];
      if (t) setActiveTool(t);
    }
    function onKeyUp(e) {
      if ((e.key === 'Alt' || e.key === 'Meta') && altPrev.current) {
        setActiveTool(altPrev.current); altPrev.current = null;
      }
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [setActiveTool, deletePlacedLoc, deletePath]);

  return {
    onMouseDown, onMouseMove, onMouseUp, onDoubleClick,
    onPinDown, onPathDown, onRegionDown, onWaypointDown, onVertexDown, onCurveDown, onSectionAddCurve, onLabelDown,
    draw, region, cursor,
    measurePts, clearMeasure: () => setMeasurePts([]),
  };
}
