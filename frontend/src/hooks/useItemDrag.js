/**
 * hooks/useItemDrag.js
 *
 * Drag an inventory row from one category panel to another.
 *
 * Built on Pointer Events, NOT HTML5 drag-and-drop. That API does nothing at
 * all on iOS Safari or Android Chrome — it is the reason the Timeline sidebar's
 * reordering had to be replaced with buttons — and this app is meant to be
 * usable on a tablet at the table.
 *
 * The drop target is resolved with `elementFromPoint` rather than by tracking
 * enter/leave on each panel: with pointer capture every move event is delivered
 * to the dragged element, so the panels never see the pointer at all.
 *
 * A drag is only started once the pointer has moved past a threshold, so a tap
 * or click on the handle still behaves as a click.
 */
import { useCallback, useRef, useState } from 'react';

/** Below this, the gesture is a click, not a drag. Fingers wobble more than mice. */
const START_PX = 6;

export function useItemDrag(onDrop) {
  // { item, from } while dragging, else null. State because the ghost renders.
  const [drag, setDrag] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [over, setOver] = useState(null);
  const start = useRef(null);

  const categoryUnder = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el?.closest?.('[data-inv-category]')?.getAttribute('data-inv-category') ?? null;
  };

  const onPointerDown = useCallback((item, e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, item, moved: false };
  }, []);

  const onPointerMove = useCallback((e) => {
    const s = start.current;
    if (!s) return;
    if (!s.moved) {
      if (Math.abs(e.clientX - s.x) < START_PX && Math.abs(e.clientY - s.y) < START_PX) return;
      s.moved = true;
      setDrag({ item: s.item, from: s.item.category ?? 'inventory' });
    }
    setPos({ x: e.clientX, y: e.clientY });
    setOver(categoryUnder(e.clientX, e.clientY));
  }, []);

  const finish = useCallback((e, commit) => {
    const s = start.current;
    start.current = null;
    e.currentTarget?.releasePointerCapture?.(e.pointerId);
    const target = s?.moved ? categoryUnder(e.clientX, e.clientY) : null;
    setDrag(null); setOver(null);
    // Only a move to a DIFFERENT panel is a change; dropping where it started
    // is a no-op rather than a pointless round-trip.
    if (commit && s?.moved && target && target !== (s.item.category ?? 'inventory')) {
      onDrop(s.item, target);
    }
  }, [onDrop]);

  const onPointerUp = useCallback((e) => finish(e, true), [finish]);
  // Cancelled by the OS — drop the gesture, change nothing.
  const onPointerCancel = useCallback((e) => finish(e, false), [finish]);

  return {
    drag, pos, over,
    handleProps: (item) => ({
      onPointerDown: (e) => onPointerDown(item, e),
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      style: { touchAction: 'none', cursor: 'grab' },
    }),
  };
}
