/**
 * pages/ItemCards/itemCardLookups.test.js
 *
 * Rules terms on an item card are clickable in ONE place — the pinned
 * inventory card — and nowhere else.
 *
 * That constraint is the whole design. This component is also what
 * `handleDownload` captures for the PNG and what the Item Cards creator shows
 * as a live preview; interactive chrome in either would be baked into an
 * image. Structural, because "which caller turns this on" is not something a
 * render test can see.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.resolve(here, p), 'utf8');

const PREVIEW = read('./ItemCardPreview.jsx');
const INVENTORY = read('../PcSheet/tabs/InventoryTab.jsx');
const CREATOR = read('./index.jsx');
const SRDINFO = read('../../components/SrdInfo.jsx');

describe('lookups are off unless a caller asks', () => {
  it('the prop defaults to false', () => {
    expect(PREVIEW).toMatch(/function ItemCardPreview\(\{ form, lookups = false \}/);
  });

  it('the creator’s live preview does not ask — it is what the PNG captures', () => {
    const uses = [...CREATOR.matchAll(/<ItemCardPreview[^>]*/g)].map((m) => m[0]);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u, u).not.toMatch(/lookups/);
  });

  it('the inventory asks only when the card is PINNED', () => {
    // The hover card follows the pointer; a click pins it, and only then is
    // it a thing you can reach into.
    expect(INVENTORY).toMatch(/<ItemCardPreview form=\{cardFormOf\(card\.item\)\} lookups=\{card\.pinned\} \/>/);
  });

  it('and the pinned card takes pointer events, while the hover card does not', () => {
    // Without this the terms are unreachable however they are rendered.
    expect(INVENTORY).toMatch(/card\.pinned \? 'pointer-events-auto/);
    expect(INVENTORY).toMatch(/: 'pointer-events-none'/);
  });

  it('fetches no SRD index when lookups are off', () => {
    // useSrdIndex(null) is a no-op, so a PNG capture makes no request.
    expect(PREVIEW).toMatch(/useSrdIndex\(lookups \? 'weapon-properties' : null\)/);
    expect(PREVIEW).toMatch(/useSrdIndex\(lookups \? 'damage-types' : null\)/);
  });
});

describe('what is clickable', () => {
  it('each weapon property separately, not the whole line', () => {
    expect(PREVIEW).toMatch(/<TermList lookups=\{lookups\} resource="weapon-properties"/);
    const list = PREVIEW.slice(PREVIEW.indexOf('function TermList'));
    expect(list.slice(0, 600)).toMatch(/split\(','\)/);
  });

  it('and the damage type', () => {
    expect(PREVIEW).toMatch(/<Term lookups=\{lookups\} resource="damage-types"/);
  });

  it('but not a name the SRD does not have', () => {
    // A homebrew property as a link is a dead end that opens "no entry".
    const term = PREVIEW.slice(PREVIEW.indexOf('function Term('), PREVIEW.indexOf('function TermList'));
    expect(term).toMatch(/!srdHasEntry\(slugs, name\)/);
    expect(term).toMatch(/return name \?\? null;/);
  });
});

describe('the trigger', () => {
  it('SrdInfo renders children in place of the ⓘ when given', () => {
    expect(SRDINFO).toMatch(/\{children \?\? 'ⓘ'\}/);
    expect(SRDINFO).toMatch(/srd-info-term/);
  });

  it('still defaults to the ⓘ for every existing caller', () => {
    // The NPC sheet puts one after a condition chip; that must not change.
    expect(SRDINFO).toMatch(/children\s*$|children\s*\}/m);
    expect(SRDINFO).toMatch(/srd-info-btn/);
  });
});

/**
 * The three fixes that came out of using it.
 */
describe('Escape closes a pinned inventory card', () => {
  it('binds the key, and only while pinned', () => {
    // It has a backdrop and takes clicks, so Escape is what people try. The
    // hover card is dismissed by moving the pointer, and a global key for it
    // would fight every other Escape on the sheet.
    const eff = INVENTORY.slice(INVENTORY.indexOf('Escape closes a pinned card'));
    expect(eff.slice(0, 600)).toMatch(/if \(!card\?\.pinned\) return undefined;/);
    expect(eff.slice(0, 600)).toMatch(/e\.key === 'Escape'/);
    expect(eff.slice(0, 600)).toMatch(/removeEventListener\('keydown', onKey\)/);
  });
});

describe('the Item Card form has no \u24d8 on its damage type', () => {
  const COMBO = read('../../components/SrdCombobox.jsx');

  it('the form asks for completion without the button', () => {
    expect(CREATOR).toMatch(/srdResource="damage-types"\s*\n\s*info=\{false\}/);
  });

  it('and the combobox honours that', () => {
    expect(COMBO).toMatch(/const showInfo = info &&/);
  });

  it('while every other caller still gets it', () => {
    expect(COMBO).toMatch(/info = true,/);
  });
});

describe('lists are edited as chips, not as comma-separated text', () => {
  const SPELLS = read('../NpcSheet/SpellSection.jsx');

  /** The whole <TagInput …/> element, rather than a guessed character window. */
  const tagInput = (src) => {
    const i = src.indexOf('<TagInput');
    expect(i, 'no TagInput at all').toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('/>', i) + 2);
  };

  it('item properties use the same editor as damage resistances', () => {
    const el = tagInput(CREATOR);
    expect(el).toMatch(/srdResource="weapon-properties"/);
    expect(el).toMatch(/options=\{weaponProperties\}/);
    expect(el).toMatch(/onRemove=/);
  });

  it('so do spells, per level', () => {
    const el = tagInput(SPELLS);
    expect(el).toMatch(/srdResource="spells"/);
    expect(el).toMatch(/options=\{options\}/);
    expect(el).toMatch(/onRemove=/);
  });

  it('both store a comma-separated string, unchanged', () => {
    // The column, every import/export and the print path all read a string.
    for (const f of [CREATOR, SPELLS]) {
      expect(f).toMatch(/splitList/);
      expect(f).toMatch(/joinList/);
    }
  });

  it('the spell editor has no click-to-edit mode left', () => {
    // That toggle is what put the caret inside the last entry on re-entry.
    expect(SPELLS).not.toMatch(/editingLevel|spell-chips-btn/);
  });

  it('and the component it replaced is gone, not orphaned', () => {
    const dead = path.resolve(here, '../../components/ListAutocompleteInput.jsx');
    expect(existsSync(dead)).toBe(false);
  });
});

describe('chips are styled outside the NPC sheet too', () => {
  // The Item Cards form was the component's first caller beyond the sheet it
  // was written for, and every `.tag-*` rule was scoped `.npc-sheet .tag-*`.
  // The chips came out as bare serif text beside a default browser input.
  const GLOBALS = read('../../styles/globals.css');
  const SHEET = read('../NpcSheet/npc-sheet.css');

  /**
   * The body of an unscoped rule for exactly this selector.
   *
   * `^sel {`, not `^sel` — a first attempt matched the start of a line and was
   * happily satisfied by `.tag-box:focus-within` after I scoped the real rule
   * back under `.npc-sheet` to check the test could fail. It could not.
   */
  const ruleBody = (sel) => {
    const m = GLOBALS.match(new RegExp(`^\\${sel}\\s*\\{([^}]*)\\}`, 'm'));
    expect(m, `no unscoped rule for ${sel}`).not.toBeNull();
    return m[1];
  };

  const SELECTORS = ['.tag-field', '.tag-box', '.tag-input', '.tag-dropdown', '.tag-opt'];

  it.each(SELECTORS)('%s has an unscoped base rule that declares something', (sel) => {
    expect(ruleBody(sel).trim().length).toBeGreaterThan(0);
  });

  it('the box draws itself, which is what was missing', () => {
    // Without these the field was invisible and the input inside it fell back
    // to the browser default — the white box with the blue ring.
    const box = ruleBody('.tag-box');
    expect(box).toMatch(/background:/);
    expect(box).toMatch(/border:/);
  });

  it('the chip itself too', () => {
    expect(ruleBody('.tag')).toMatch(/background:/);
    expect(GLOBALS).toMatch(/^\.tag \.tag-x \{/m);
  });

  it('they use app theme tokens, not the sheet\'s parchment ones', () => {
    const block = GLOBALS.slice(GLOBALS.indexOf('.tag-field'), GLOBALS.indexOf('.srd-info-btn'));
    expect(block).toMatch(/var\(--surface2\)/);
    expect(block).toMatch(/var\(--text\)/);
    // --parch/--parch2/--ink/--rule exist only under .npc-sheet; using one
    // here would render as an invalid value on every other page.
    expect(block).not.toMatch(/var\(--parch2?\)|var\(--ink\)|var\(--rule\)/);
  });

  it('and the sheet keeps its own, which still win on specificity', () => {
    // Two selectors beats one; no !important needed either way.
    expect(SHEET).toMatch(/\.npc-sheet \.tag-box \{/);
    expect(SHEET).toMatch(/\.npc-sheet \.tag \{/);
  });

  it('the input stays borderless — the box around it is the field', () => {
    const rule = GLOBALS.slice(GLOBALS.indexOf('.tag-input {'));
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/border: none/);
  });

  it('× and the dropdown do not print', () => {
    const print = GLOBALS.slice(GLOBALS.indexOf('.tag-field'), GLOBALS.indexOf('.srd-info-btn'));
    expect(print).toMatch(/@media print \{[^}]*\.tag \.tag-x[^}]*display: none/);
  });

  it('nor does "+ Add spell level…"', () => {
    // The whole tfoot, not just the <select>: hiding the control alone leaves
    // an empty row with the spell table's rules drawn under the last level.
    const print = SHEET.slice(SHEET.lastIndexOf('@media print'));
    expect(print).toMatch(/\.npc-sheet \.spell-table tfoot \{[^}]*display: none/);
  });
});
