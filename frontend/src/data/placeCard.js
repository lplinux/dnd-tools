/**
 * data/placeCard.js
 *
 * Where a pointer-anchored floating box goes.
 *
 * Lifted out of InventoryTab so the cross-link popover can use it too —
 * importing it from a page component would pull the whole equipment tab into
 * every bundle that wants to place a box.
 */

export const CARD_GAP = 14;

/**
 * Where to put the hover card, given the pointer and the card's measured box.
 *
 * Below-right of the pointer by default, **flipped** to the opposite side when
 * that would overhang. Flipping rather than clamping matters near the right
 * edge: clamping would slide the card back under the cursor and cover the row
 * it is describing, which is the one thing it must not do.
 *
 * The final min/max is still a clamp, for the case where the card is simply
 * taller or wider than the space on either side — a long item card on a short
 * window. Then being fully visible beats being out of the way.
 *
 * Pure, and exported, because the flip/clamp interaction is the part that is
 * easy to get subtly wrong and the tests run without a DOM.
 */
export function placeCard({ x, y, width, height, vw, vh, gap = CARD_GAP }) {
  let left = x + gap;
  if (left + width > vw - gap) left = x - width - gap;
  let top = y + gap;
  if (top + height > vh - gap) top = y - height - gap;
  return {
    left: Math.max(gap, Math.min(left, vw - width - gap)),
    top: Math.max(gap, Math.min(top, vh - height - gap)),
  };
}
