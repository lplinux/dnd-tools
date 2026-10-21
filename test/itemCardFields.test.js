/**
 * test/itemCardFields.test.js
 *
 * The weapon block on an item card: what it holds and how wide.
 *
 * Both of these were found by moving real cards into the fields rather
 * than by reading the code — the 60-character `damage` column silently
 * truncated "1d12 slashing (base), plus additional effects based on the
 * moon phase", and a hammer that is bludgeoning sealed and fire unsealed
 * had nowhere to put its second damage type.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(path.join(root, 'app.js'), 'utf8');
const read = (f) => readFileSync(path.join(root, 'frontend/src', f), 'utf8');

describe('mastery is a column, not another property', () => {
  it('because a weapon has many properties and exactly one mastery', () => {
    expect(app).toMatch(/mastery {5}VARCHAR\(60\)/);
    expect(app).toMatch(/ADD COLUMN IF NOT EXISTS mastery VARCHAR\(60\)/);
  });

  it('and it is written by every path a card is written by', () => {
    // CARD_COLS is the one list the INSERT and the UPDATE both build from.
    expect(app).toMatch(/'damage', 'damage_type', 'properties', 'mastery', 'ac_bonus'/);
    expect(app).toMatch(/str\(b\.mastery, 60\)/);
  });

  it('reaching the inventory tab with the rest of the card', () => {
    expect(app).toMatch(/c\.mastery {5}AS card_mastery/);
    expect(read('pages/PcSheet/tabs/InventoryTab.jsx')).toMatch(/mastery: i\.card_mastery/);
  });

  it('and the eight are offered rather than typed', () => {
    const c = read('pages/ItemCards/constants.js');
    expect(c).toMatch(/export const MASTERIES = \['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'\]/);
    // A select: a ninth mastery does not exist, so free text would invite one.
    expect(read('pages/ItemCards/index.jsx')).toMatch(/MASTERIES\.map\(\(m\) => <option key=\{m\} value=\{m\}>\{m\}<\/option>\)/);
  });

  it('and shows on both faces, beside the properties', () => {
    expect(read('pages/ItemCards/ItemCardPreview.jsx')).toMatch(/Mastery:<\/span> \{mastery\}/);
    expect(read('pages/ItemCards/ItemCardPrint.jsx')).toMatch(/k\('Mastery', esc\(form\.mastery\)\)/);
  });
});

describe('damage and its type are lists', () => {
  it('wide enough to hold one', () => {
    /*
     * 60 characters truncated a real card mid-word. Both are 255 now, the
     * same as the properties they sit beside.
     */
    expect(app).toMatch(/damage {6}VARCHAR\(255\)/);
    expect(app).toMatch(/damage_type VARCHAR\(255\)/);
    expect(app).toMatch(/str\(b\.damage, 255\)/);
    expect(app).toMatch(/str\(b\.damageType \?\? b\.damage_type, 255\)/);
  });

  it('and widened on a database that already exists', () => {
    // A column width inside CREATE TABLE IF NOT EXISTS never reaches one.
    expect(app).toMatch(/ALTER TABLE item_cards ALTER COLUMN damage TYPE VARCHAR\(255\)/);
    expect(app).toMatch(/ALTER TABLE item_cards ALTER COLUMN damage_type TYPE VARCHAR\(255\)/);
  });

  it('entered as chips, so each keeps its own lookup', () => {
    const ui = read('pages/ItemCards/index.jsx');
    expect(ui).toMatch(/srdResource="damage-types"/);
    expect(ui).toMatch(/damageType: joinList\(\[\.\.\.splitList\(f\.damageType\), v\]\)/);
  });
});

describe('the stat labels carry the weight', () => {
  it('on the preview', () => {
    const p = read('pages/ItemCards/ItemCardPreview.jsx');
    expect(p).toMatch(/\.ic-stat > \.ic-k \{ font-weight: 600/);
    for (const label of ['Damage:', 'Type:', 'Properties:', 'Mastery:', 'AC:']) {
      expect(p, `${label} is not signposted`).toMatch(new RegExp(`ic-k">${label}`));
    }
  });

  it('and on the printed card', () => {
    const p = read('pages/ItemCards/ItemCardPrint.jsx');
    expect(p).toMatch(/const k = \(label, value\) =>/);
    expect(p).toMatch(/\.pc-k, \.ic-face \.pc-k \{ font-weight: 700/);
  });

  it('with no backtick anywhere in that stylesheet', () => {
    /*
     * It is a template literal. A backtick in a CSS comment there ends the
     * template and turns the rest of the block into JavaScript — which is
     * exactly what happened, twice.
     */
    const p = read('pages/ItemCards/ItemCardPrint.jsx');
    const css = p.slice(p.indexOf('<style>{`') + 9, p.indexOf('`}</style>'));
    expect(css).not.toContain('`');
  });
});
