/**
 * components/map/useMapViewport.js
 *
 * Owns the pan/zoom state for a map stage and the screen↔image coordinate
 * conversion both the renderer (MapStage) and the editor interaction hook need.
 * Lifting it into a hook lets the editor share one viewport instance between
 * MapStage and useMapInteraction.
 *
 * Live values (scale/offset/imgSize) are mirrored into refs so event handlers
 * and `screenToPct` read current values without stale closures.
 */

import { useCallback, useRef, useState } from 'react';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

export function useMapViewport() {
  const areaRef = useRef(null);
  const viewportRef = useRef(null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState({ iw: 800, ih: 600 });
  const [loaded, setLoaded] = useState(false);

  // Mirror state into refs for live reads inside event handlers.
  const scaleRef = useRef(scale); scaleRef.current = scale;
  const offsetRef = useRef(offset); offsetRef.current = offset;
  const sizeRef = useRef(imgSize); sizeRef.current = imgSize;

  const fit = useCallback((iw, ih) => {
    const a = areaRef.current;
    if (!a || !iw || !ih) return;
    const s = Math.min(a.clientWidth / iw, a.clientHeight / ih, 1);
    setScale(s);
    setOffset({ x: (a.clientWidth - iw * s) / 2, y: (a.clientHeight - ih * s) / 2 });
  }, []);

  const onImageLoad = useCallback((e) => {
    const { naturalWidth: iw, naturalHeight: ih } = e.currentTarget;
    setImgSize({ iw, ih });
    setLoaded(true);
    fit(iw, ih);
  }, [fit]);

  const resetLoaded = useCallback(() => setLoaded(false), []);

  /** Zoom toward the center of the map area by factor f. */
  const zoomBy = useCallback((f) => {
    const a = areaRef.current;
    if (!a) return;
    const mx = a.clientWidth / 2;
    const my = a.clientHeight / 2;
    setOffset((o) => ({ x: mx - (mx - o.x) * f, y: my - (my - o.y) * f }));
    setScale((s) => clamp(s * f, MIN_SCALE, MAX_SCALE));
  }, []);

  /** Zoom toward a screen point (used for wheel zoom). */
  const zoomAt = useCallback((clientX, clientY, f) => {
    const a = areaRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const mx = clientX - r.left;
    const my = clientY - r.top;
    setOffset((o) => ({ x: mx - (mx - o.x) * f, y: my - (my - o.y) * f }));
    setScale((s) => clamp(s * f, MIN_SCALE, MAX_SCALE));
  }, []);

  const panTo = useCallback((x, y) => setOffset({ x, y }), []);

  /**
   * Center the viewport on an image-percentage point (0–100), e.g. a pin. Pans so
   * the point sits at the middle of the map area; zooms in to at least 1× when the
   * map is zoomed further out so the target is actually legible.
   */
  const centerOn = useCallback((pctX, pctY) => {
    const a = areaRef.current;
    if (a == null || pctX == null || pctY == null) return;
    const { iw, ih } = sizeRef.current;
    const s = clamp(Math.max(scaleRef.current, 1), MIN_SCALE, MAX_SCALE);
    const px = (pctX / 100) * iw;
    const py = (pctY / 100) * ih;
    setScale(s);
    setOffset({ x: a.clientWidth / 2 - px * s, y: a.clientHeight / 2 - py * s });
  }, []);

  /** Convert a screen point to image-percentage coordinates (0–100). */
  const screenToPct = useCallback((clientX, clientY) => {
    const vp = viewportRef.current;
    if (!vp) return { x: 0, y: 0 };
    const r = vp.getBoundingClientRect();
    const s = scaleRef.current;
    const { iw, ih } = sizeRef.current;
    const mx = (clientX - r.left) / s;
    const my = (clientY - r.top) / s;
    return { x: (mx / iw) * 100, y: (my / ih) * 100 };
  }, []);

  return {
    areaRef, viewportRef,
    scale, offset, imgSize, loaded,
    scaleRef, offsetRef,
    fit, onImageLoad, resetLoaded, zoomBy, zoomAt, panTo, centerOn, screenToPct,
  };
}
