/**
 * placeCard — where the inventory hover card goes.
 *
 * It used to go in the bottom-right corner, full stop, which on a long
 * equipment sheet put the card a screen away from the item it described. Now it
 * follows the pointer, and the interesting behaviour is what happens at the
 * edges: near the right-hand side the card has to FLIP to the other side of the
 * cursor rather than slide back under it, because sliding would cover the very
 * row being described.
 *
 * Pure maths, so this runs without a DOM. The measuring itself is a
 * getBoundingClientRect in a layout effect and is not covered here.
 */
import { describe, it, expect } from 'vitest';
import { placeCard, CARD_GAP } from './InventoryTab';

/** A roomy desktop window and a typical PlainDetails box. */
const VIEW = { vw: 1440, vh: 900 };
const CARD = { width: 320, height: 260 };
const at = (x, y, over = {}) => placeCard({ x, y, ...CARD, ...VIEW, ...over });

describe('with room on every side', () => {
  it('sits just below and to the right of the pointer', () => {
    expect(at(400, 300)).toEqual({ left: 400 + CARD_GAP, top: 300 + CARD_GAP });
  });
});

describe('near the right edge', () => {
  it('flips to the left of the pointer rather than sliding under it', () => {
    const { left } = at(1300, 300);
    expect(left).toBe(1300 - CARD.width - CARD_GAP);
    // The whole point: the card must not cover the cursor's own row.
    expect(left + CARD.width).toBeLessThan(1300);
  });

  it('stays fully on screen after flipping', () => {
    const { left } = at(1430, 300);
    expect(left).toBeGreaterThanOrEqual(CARD_GAP);
    expect(left + CARD.width).toBeLessThanOrEqual(VIEW.vw - CARD_GAP);
  });
});

describe('near the bottom edge', () => {
  it('flips above the pointer', () => {
    const { top } = at(400, 800);
    expect(top).toBe(800 - CARD.height - CARD_GAP);
  });

  it('flips on both axes at once in the bottom-right corner', () => {
    const { left, top } = at(1400, 880);
    expect(left).toBeLessThan(1400);
    expect(top).toBeLessThan(880);
  });
});

describe('near the top-left corner', () => {
  it('never goes off the top or the left', () => {
    const { left, top } = at(2, 2);
    expect(left).toBeGreaterThanOrEqual(CARD_GAP);
    expect(top).toBeGreaterThanOrEqual(CARD_GAP);
  });
});

describe('when the card simply does not fit', () => {
  it('clamps to the gap rather than flipping off-screen', () => {
    // A tall item card in a short window: there is no good side, so being
    // fully visible beats being out of the way.
    const p = placeCard({ x: 700, y: 300, width: 320, height: 1000, vw: 1440, vh: 600 });
    expect(p.top).toBe(CARD_GAP);
  });

  it('never returns a negative coordinate even when wider than the window', () => {
    const p = placeCard({ x: 200, y: 200, width: 900, height: 200, vw: 500, vh: 800 });
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top).toBeGreaterThanOrEqual(0);
  });
});

describe('on a phone-sized viewport', () => {
  it('keeps a card narrower than the screen fully visible', () => {
    // PlainDetails is max-w-[85vw], so at 390px wide it measures ~331.
    const p = placeCard({ x: 300, y: 500, width: 331, height: 300, vw: 390, vh: 844 });
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.left + 331).toBeLessThanOrEqual(390);
  });
});
