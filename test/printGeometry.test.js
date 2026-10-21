/**
 * test/printGeometry.test.js
 *
 * Where the cards land on the sheet.
 *
 * This is the one thing in the app whose correctness lives outside the
 * browser — it is only wrong once it is on paper, and by then it has been
 * cut. The numbers were measured out of a headless-Chrome PDF: with the
 * old `@page { margin: 6mm }` and `align-content: start`, the 3×3 block sat
 * 11.7mm off centre horizontally and 27.1mm vertically, and the second
 * sheet's rows spilled across a page break because the real printable area
 * is smaller than the 285mm that assumed.
 *
 * With the page box set to the sheet, both sides measured 7.4mm at the
 * sides and 13.5mm top and bottom, matching front to back within 0.15mm —
 * which is the whole point, because the backs have to fall on the fronts.
 *
 * So the arithmetic is pinned here: if a card size or the gap changes, the
 * clearances change with it, and somebody has to look at the sheet again.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { CARD } from '../frontend/src/pages/ItemCards/constants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(root, 'frontend/src/pages/ItemCards/ItemCardPrint.jsx'), 'utf8');

const A4 = { w: 210, h: 297 };
const GAP = 3;
const COLS = 3;
const ROWS = 3;

describe('the 3×3 sheet fits A4 with room to spare', () => {
  const gridW = COLS * CARD.widthMM + (COLS - 1) * GAP;
  const gridH = ROWS * CARD.heightMM + (ROWS - 1) * GAP;

  it('is 195 × 270 mm', () => {
    expect(gridW).toBe(195);
    expect(gridH).toBe(270);
  });

  it('and leaves 7.5mm at the sides, 13.5mm top and bottom', () => {
    expect((A4.w - gridW) / 2).toBeCloseTo(7.5, 2);
    expect((A4.h - gridH) / 2).toBeCloseTo(13.5, 2);
  });

  it('clear of any printer\'s unprintable edge', () => {
    /*
     * The reason "Margins: None" is safe to recommend. Consumer printers
     * reserve roughly 3-5mm; the tightest clearance here is the 7.5mm at
     * the sides, so nothing is clipped even with no margin at all.
     */
    const tightest = Math.min((A4.w - gridW) / 2, (A4.h - gridH) / 2);
    expect(tightest).toBeGreaterThan(5);
  });
});

describe('the page box is the sheet, not whatever the dialog leaves', () => {
  it('the margin is zero, so Default and None agree', () => {
    // Chrome's "Default" resolves to the CSS margin. At 6mm they disagreed
    // with "None", and the sheet moved depending on the dropdown.
    expect(src).toMatch(/@page \{ size: A4 portrait; margin: 0; \}/);
    expect(src).not.toMatch(/@page \{ size: A4 portrait; margin: 6mm; \}/);
  });

  it('and the page is exactly A4', () => {
    expect(src).toMatch(/\.ic-print-page \{\s*\n\s*width: 210mm; height: 297mm; box-sizing: border-box; overflow: hidden;/);
  });

  it('with the grid centred on BOTH axes', () => {
    // `start` was the vertical bug: 6mm of clearance above, 21mm below,
    // and rows pushed past the bottom of the printable area.
    expect(src).toMatch(/justifyContent: 'center'/);
    expect(src).toMatch(/alignContent: 'center'/);
    expect(src).not.toMatch(/alignContent: 'start'/);
  });
});

describe('the backs can land on the fronts', () => {
  it('each row of backs is reversed, for a long-edge flip', () => {
    expect(src).toMatch(/function mirrorRows\(cells, cols\)/);
    expect(src).toMatch(/\.reverse\(\)/);
  });

  it('and every page is padded to a full grid, so the mirror is exact', () => {
    /*
     * A short last page would otherwise centre three cards instead of
     * mirroring nine positions, and the backs would miss. The empties are
     * what keep the geometry identical on every sheet.
     */
    expect(src).toMatch(/for \(let k = 0; k < perPage; k\+\+\)/);
    expect(src).toMatch(/className="ic-empty"/);
  });
});

describe('the dialog settings are spelled out where the button is', () => {
  const ui = readFileSync(path.join(root, 'frontend/src/pages/ItemCards/index.jsx'), 'utf8');

  it('names the margin options that work, and the one that does not', () => {
    expect(ui).toMatch(/Margins → Default or None/);
    // `<em>` sits between the words in the markup.
    expect(ui).toMatch(/<em>not<\/em> Minimum/);
  });

  it('and says 100%, not fit-to-page', () => {
    expect(ui).toMatch(/Scale → 100%/);
    expect(ui).toMatch(/Fit to printable area/);
  });

  it('and still says long-edge, which the mirroring assumes', () => {
    expect(ui).toMatch(/flip on the long edge/);
  });
});
