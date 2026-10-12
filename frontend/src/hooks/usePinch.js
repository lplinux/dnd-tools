/**
 * hooks/usePinch.js
 *
 * Two-finger pinch-to-zoom, shared by the three surfaces that zoom: the map
 * stage, the relationship graph and the character tree. Before this each had
 * its own hand-rolled wheel ratchet with a different constant (1.1, 1.1, 1.12)
 * and no touch path at all.
 *
 * It is a *composable*, not a wrapper: a surface calls `down`/`move`/`up` from
 * inside its own pointer handlers and asks `isPinching()` before running its
 * drag logic. That keeps pinch from fighting pan, and avoids rewriting three
 * different drag models to a common shape they do not share.
 *
 * The maths is exported separately and is pure, so it can be tested under the
 * existing `node` test environment — jsdom has no real PointerEvent support and
 * does not implement setPointerCapture, so a DOM-level test would prove less.
 */

import { useCallback, useRef } from 'react';

/**
 * Distance and midpoint between the first two active pointers, or null when
 * fewer than two are down.
 *
 * @param {Iterable<{x:number,y:number}>} points
 */
export function twoPointerMetrics(points) {
  const [a, b] = Array.from(points);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    dist: Math.hypot(dx, dy),
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
  };
}

/**
 * The zoom factor for a pinch, clamped so a jittery frame cannot slam the scale.
 * Returns 1 (no change) for a degenerate previous distance — two fingers landing
 * on the same pixel would otherwise divide by ~0 and produce Infinity.
 */
export function pinchFactor(prevDist, nextDist, maxStep = 4) {
  if (!(prevDist > 0.5) || !(nextDist > 0)) return 1;
  const f = nextDist / prevDist;
  return Math.max(1 / maxStep, Math.min(maxStep, f));
}

/**
 * @param {(clientX:number, clientY:number, factor:number) => void} onPinch
 *   Called with the gesture midpoint and the incremental factor — the same
 *   shape as the existing `zoomAt(clientX, clientY, f)`, so it drops straight in.
 */
export function usePinch(onPinch) {
  // Live pointer positions, keyed by pointerId. A ref, not state: these change
  // every frame and must be readable inside handlers without a re-render.
  const pts = useRef(new Map());
  const lastDist = useRef(0);

  const down = useCallback((e) => {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Reset the baseline whenever the pointer count changes, so lifting one
    // finger of three does not register as an enormous jump.
    lastDist.current = 0;
  }, []);

  const move = useCallback((e) => {
    if (!pts.current.has(e.pointerId)) return false;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const m = twoPointerMetrics(pts.current.values());
    if (!m) return false;
    if (lastDist.current) onPinch(m.cx, m.cy, pinchFactor(lastDist.current, m.dist));
    lastDist.current = m.dist;
    return true;              // handled — the caller must skip its pan
  }, [onPinch]);

  const up = useCallback((e) => {
    pts.current.delete(e.pointerId);
    lastDist.current = 0;
  }, []);

  /** True while two or more fingers are down, so callers can suppress panning. */
  const isPinching = useCallback(() => pts.current.size >= 2, []);

  /** Belt and braces for unmount / gesture interruption. */
  const reset = useCallback(() => { pts.current.clear(); lastDist.current = 0; }, []);

  return { down, move, up, isPinching, reset };
}
