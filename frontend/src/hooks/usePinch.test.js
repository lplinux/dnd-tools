/**
 * The pinch maths, tested where it can be: as pure functions under the existing
 * `node` environment.
 *
 * Deliberately NOT a component test. jsdom has no real PointerEvent support and
 * does not implement setPointerCapture, so a DOM-level test of the gesture
 * would prove less than this does while costing three dependencies.
 */
import { describe, it, expect } from 'vitest';
import { twoPointerMetrics, pinchFactor } from './usePinch';

describe('twoPointerMetrics', () => {
  it('is null below two pointers — one finger is a pan, not a pinch', () => {
    expect(twoPointerMetrics([])).toBeNull();
    expect(twoPointerMetrics([{ x: 1, y: 1 }])).toBeNull();
  });

  it('measures distance and midpoint', () => {
    const m = twoPointerMetrics([{ x: 0, y: 0 }, { x: 3, y: 4 }]);
    expect(m.dist).toBe(5);          // 3-4-5
    expect(m.cx).toBe(1.5);
    expect(m.cy).toBe(2);
  });

  it('uses the first two when a third finger lands', () => {
    const m = twoPointerMetrics([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 99, y: 99 }]);
    expect(m.dist).toBe(10);
  });
});

describe('pinchFactor', () => {
  it('spreading zooms in, pinching zooms out', () => {
    expect(pinchFactor(100, 200)).toBe(2);
    expect(pinchFactor(200, 100)).toBe(0.5);
  });

  it('is 1 when nothing moved, so a resting pinch does not drift', () => {
    expect(pinchFactor(140, 140)).toBe(1);
  });

  /**
   * Two fingers landing on nearly the same pixel gives a previous distance of
   * ~0. Without the guard the division produces Infinity and the scale is
   * destroyed in one frame — the map vanishes and cannot be recovered.
   */
  it('refuses to divide by a degenerate previous distance', () => {
    expect(pinchFactor(0, 50)).toBe(1);
    expect(pinchFactor(0.3, 50)).toBe(1);
  });

  it('clamps a wild frame rather than slamming the scale', () => {
    expect(pinchFactor(1, 1000)).toBe(4);
    expect(pinchFactor(1000, 1)).toBe(0.25);
  });

  it('treats a vanished second finger as no change', () => {
    expect(pinchFactor(100, 0)).toBe(1);
  });
});
