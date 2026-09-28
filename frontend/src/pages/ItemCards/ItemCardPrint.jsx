/**
 * pages/ItemCards/ItemCardPrint.jsx
 *
 * Print-ready rendering of item cards as fixed-size, two-sided cards laid out in a
 * grid on the page, ready for **double-sided** printing.
 *
 *   • Each card has exactly two faces: FRONT (name / type / rarity / stats / flavor)
 *     and BACK (special abilities). Each face auto-fits its font to the card.
 *   • Cards are packed `cols × rows` per sheet (1×1 for a single card, 3×3 = up to 9
 *     on A4 for a set).
 *   • For every sheet a FRONT page is emitted, then a BACK page whose cells are
 *     **column-mirrored per row** so that flipping the paper on the LONG edge lands
 *     each card's back directly behind its front.
 *
 * Kept always-mounted but offscreen; `@media print` reveals only these pages.
 * `window.print()` (from the page) does the rest.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { RARITIES, CARD, MM_TO_PX } from './constants';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/** FRONT face HTML: identity + stats + flavor. */
function frontHtml(form) {
  const r = RARITIES.find((x) => x.id === form.rarity);
  const rarityLabel = r?.label ?? form.rarity;
  const attune = form.attunement ? ' — Requires Attunement' : '';
  let h = `<div class="pc-name">${esc(form.name || 'Item Name')}</div>`
        + `<div class="pc-type">${esc(form.type || 'Item')} (Rarity: ${esc(rarityLabel)}${attune})</div>`;
  const stats = [];
  if (form.type === 'Weapon') {
    if (form.damage) stats.push(`Damage: ${esc(form.damage)}`);
    if (form.damageType) stats.push(`Type: ${esc(form.damageType)}`);
    if (form.properties) stats.push(`Properties: ${esc(form.properties)}`);
  } else if (form.type === 'Armor') {
    if (form.acBonus) stats.push(`AC: ${esc(form.acBonus)}`);
    if (form.armorType) stats.push(`Armor Type: ${esc(form.armorType)}`);
  } else if ((form.type === 'Consumable' || form.type === 'Potion') && parseInt(form.uses) > 0) {
    stats.push(`Uses: ${'◯ '.repeat(parseInt(form.uses)).trim()}`);
  }
  if (stats.length) h += `<div class="pc-stats">${stats.map((s) => `<div class="pc-stat">${s}</div>`).join('')}</div>`;
  const flavor = (form.flavor || '').trim();
  if (flavor) h += `<div class="pc-flavor">${flavor.split('\n').map((l) => esc(l.trim())).filter(Boolean).join('<br>')}</div>`;
  return h;
}

/** BACK face HTML: special abilities (may be empty → a blank back). */
function backHtml(form) {
  return (form.abilities && form.abilities.trim()) ? `<div class="pc-abilities">${form.abilities}</div>` : '';
}

/** Reverse each row of `cols` cells (long-edge duplex mirroring). */
function mirrorRows(cells, cols) {
  const out = [];
  for (let i = 0; i < cells.length; i += cols) out.push(...cells.slice(i, i + cols).reverse());
  return out;
}

export default function ItemCardPrint({ cards, cols = 1, perPage = 1 }) {
  const list = (cards || []).filter(Boolean);
  const measurerRef = useRef(null);
  const [pages, setPages] = useState([]); // [{ side, cells: (cell|null)[] }]
  const cardsKey = JSON.stringify(list);

  useLayoutEffect(() => {
    const m = measurerRef.current;
    if (!m) return;
    const contentW = (CARD.widthMM - CARD.paddingMM * 2) * MM_TO_PX;
    const contentH = (CARD.heightMM - CARD.paddingMM * 2) * MM_TO_PX - 5 * MM_TO_PX; // minus footer
    m.style.width = `${contentW}px`;

    const fitFont = (html) => {
      if (!html) return CARD.maxFontPx;
      for (let f = CARD.maxFontPx; f > CARD.minFontPx; f--) {
        m.style.fontSize = `${f}px`;
        m.innerHTML = html;
        if (m.offsetHeight <= contentH) return f;
      }
      return CARD.minFontPx;
    };

    // Build both faces for every card.
    const faces = list.map((form) => {
      const fh = frontHtml(form);
      const bh = backHtml(form);
      const rarityColor = (RARITIES.find((r) => r.id === form.rarity)?.color) || '#999';
      const name = form.name || 'Item Card';
      return {
        rarityColor, name,
        front: { html: fh, role: 'Front', fontPx: fitFont(fh), rarityColor, cardName: name },
        back: { html: bh, role: 'Back', fontPx: fitFont(bh), rarityColor, cardName: name },
      };
    });
    m.innerHTML = '';

    // Pack into sheets; each sheet → a FRONT page then a mirrored BACK page.
    const out = [];
    for (let i = 0; i < faces.length; i += perPage) {
      const group = faces.slice(i, i + perPage);
      const frontCells = [];
      const backCells = [];
      for (let k = 0; k < perPage; k++) {
        frontCells.push(group[k] ? group[k].front : null);
        backCells.push(group[k] ? group[k].back : null);
      }
      out.push({ side: 'front', cells: frontCells });
      out.push({ side: 'back', cells: mirrorRows(backCells, cols) });
    }
    setPages(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsKey, cols, perPage]);

  const dims = { width: `${CARD.widthMM}mm`, height: `${CARD.heightMM}mm` };
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, ${CARD.widthMM}mm)`,
    gap: '3mm',
    justifyContent: 'center',
    alignContent: 'start',
  };

  return (
    <div className="ic-print-root" aria-hidden="true">
      <style>{`
        .ic-print-root { position: absolute; left: -99999px; top: 0; }
        .ic-print-measure { position: absolute; left: -99999px; top: 0; visibility: hidden;
          box-sizing: content-box; line-height: 1.4; font-family: Georgia, 'Times New Roman', serif; }
        .ic-print-page { }
        .ic-face { box-sizing: border-box; background: #fff; color: #1a1a1a; border-radius: 6px;
          overflow: hidden; display: flex; flex-direction: column; line-height: 1.4;
          font-family: Georgia, 'Times New Roman', serif; }
        .ic-empty { box-sizing: border-box; }
        .ic-face .pc-accent { flex: 0 0 auto; height: 3px; border-radius: 2px; margin-bottom: 5px; }
        .ic-face .pc-body { flex: 1 1 auto; overflow: hidden; }
        .ic-face .pc-foot { flex: 0 0 auto; font-size: 8px; color: #999; border-top: 1px solid #ddd;
          margin-top: 3px; padding-top: 2px; display: flex; justify-content: space-between;
          text-transform: uppercase; letter-spacing: .05em; }
        .ic-print-measure .pc-name, .ic-face .pc-name { font-family: 'Cinzel', Georgia, serif;
          font-size: 1.7em; font-weight: 700; color: #7a5c00; margin-bottom: 2px; line-height: 1.1; }
        .ic-print-measure .pc-type, .ic-face .pc-type { font-size: .9em; color: #555; margin-bottom: 5px; }
        .ic-print-measure .pc-stat, .ic-face .pc-stat { color: #333; }
        .ic-print-measure .pc-stats, .ic-face .pc-stats { margin-bottom: 5px; }
        .ic-print-measure .pc-flavor, .ic-face .pc-flavor { font-style: italic; color: #444;
          background: #f3efe6; border-left: 2px solid #b8a15e; padding: 5px 6px; margin-bottom: 6px; }
        .ic-print-measure .pc-abilities, .ic-face .pc-abilities { margin-bottom: 4px; }
        .ic-face .pc-abilities ul, .ic-print-measure .pc-abilities ul { padding-left: 1.2em; margin: 2px 0; list-style: disc; }
        .ic-face .pc-abilities ol, .ic-print-measure .pc-abilities ol { padding-left: 1.2em; margin: 2px 0; list-style: decimal; }
        .ic-face .pc-abilities u, .ic-print-measure .pc-abilities u { text-decoration: underline; }
        .ic-face .pc-abilities b, .ic-face .pc-abilities strong { color: #7a5c00; }

        @media print {
          body * { visibility: hidden !important; }
          .ic-print-root, .ic-print-root * { visibility: visible !important; }
          .ic-print-root { position: absolute !important; left: 0 !important; top: 0 !important; }
          .ic-print-page { page-break-after: always; break-after: page; }
          .ic-print-page:last-child { page-break-after: auto; break-after: auto; }
          @page { size: A4 portrait; margin: 6mm; }
        }
      `}</style>

      {/* Offscreen measurer used for per-face auto-fit. */}
      <div className="ic-print-measure" ref={measurerRef} />

      {pages.map((pg, pi) => (
        <div className="ic-print-page" key={pi} style={gridStyle}>
          {pg.cells.map((cell, ci) => (cell
            ? (
              <div
                key={ci}
                className="ic-face"
                style={{ ...dims, padding: `${CARD.paddingMM}mm`, fontSize: `${cell.fontPx}px`, border: `2px solid ${cell.rarityColor}` }}
              >
                <div className="pc-accent" style={{ background: cell.rarityColor }} />
                <div className="pc-body" dangerouslySetInnerHTML={{ __html: cell.html }} />
                <div className="pc-foot"><span>{cell.cardName}</span><span>{cell.role}</span></div>
              </div>
            )
            : <div key={ci} className="ic-empty" style={dims} />
          ))}
        </div>
      ))}
    </div>
  );
}
