/**
 * pages/NpcSheet/spellList.test.js
 *
 * Spells "full of details": the wiring around data/spellDetails.js, which
 * has its own tests for what the details say.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.resolve(here, p), 'utf8');
const SECTION = read('./SpellSection.jsx');
const SRDINFO = read('../../components/SrdInfo.jsx');
const HOOK = read('../../hooks/useSpellDetails.js');
const CSS = read('./npc-sheet.css');

describe('the spell list on the sheet', () => {
  it('sits under the slot table, from the same names', () => {
    expect(SECTION).toMatch(/<SpellList spellNames=\{spellNames\} \/>/);
  });

  it('has its columns in order, components between the spell and its casting time', () => {
    // The list's own header only — the slot table above has a Level too.
    const list = SECTION.slice(SECTION.indexOf('function SpellList('), SECTION.indexOf('function SpellNames('));
    const cols = [...list.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
    expect(cols).toEqual(['Level', 'Spell', 'Components', 'Casting Time', 'Range', 'Duration']);
    expect(SECTION).not.toMatch(/C R M/);
  });

  it('Concentration and Ritual are a circled C / R beside the name, the word on hover', () => {
    expect(SECTION).toMatch(/d\.spell\.concentration && <span className="spell-mark" title="Concentration">C<\/span>/);
    expect(SECTION).toMatch(/d\.spell\.ritual && <span className="spell-mark" title="Ritual">R<\/span>/);
  });

  it('the school is left to the card, not the list', () => {
    const list = SECTION.slice(SECTION.indexOf('function SpellList('), SECTION.indexOf('function SpellNames('));
    expect(list).not.toMatch(/school/);
  });

  it('a material with a price carries it on the M, the full text on hover', () => {
    expect(SECTION).toMatch(/title=\{d\.spell\.material \|\| undefined\}/);
    expect(SECTION).toMatch(/materialCost\(d\.spell\) && <span className="spell-tag">\{materialCost\(d\.spell\)\}<\/span>/);
  });

  it('a name opens its full card', () => {
    expect(SECTION).toMatch(/<SrdInfo resource="spells" name=\{name\}>\{d\.spell\.name\}<\/SrdInfo>/);
  });

  it('a spell the SRD lacks stays on the list, and says so', () => {
    // PHB-only spells, homebrew and typos are still the character's spells.
    expect(SECTION).toMatch(/'Not in SRD 5\.2'/);
  });

  it('sorts by the SRD level when it knows it', () => {
    // A spell typed into the wrong row still sorts with its own level.
    expect(SECTION).toMatch(/level: d\.spell\?\.level \?\? e\.row/);
  });

  it('a row never splits across a printed page', () => {
    expect(CSS).toMatch(/\.npc-sheet \.spell-list tr \{ break-inside: avoid; \}/);
  });
});

describe('fetching the details', () => {
  it('goes through the cached lookup, so each spell is asked for once', () => {
    expect(HOOK).toMatch(/import \{ lookupRaw \} from '@\/api\/srd';/);
    expect(HOOK).toMatch(/spellFromSrd\(await lookupRaw\('spells', name\)\)/);
  });

  it('at most four at a time', () => {
    expect(HOOK).toMatch(/const IN_FLIGHT = 4;/);
  });

  it('refetches only when the names change, not on every render', () => {
    expect(HOOK).toMatch(/\}, \[key\]\);/);
  });

  it('and stops writing state once the sheet is gone', () => {
    expect(HOOK).toMatch(/return \(\) => \{ alive = false; \};/);
  });
});

describe('every spell lookup shows the full card', () => {
  it('SrdInfo reads a spell from the whole record', () => {
    // It used to keep only the prose, so the card said what Fireball does
    // but not its range, components or duration.
    expect(SRDINFO).toMatch(/resource === 'spells'\s*\n\s*\? lookupRaw\(resource, name\)\.then\(\(body\) => \(\{ spell: spellFromSrd\(body\) \}\)\)/);
    expect(SRDINFO).toMatch(/<SpellCard spell=\{state\.spell\} \/>/);
  });

  it('and falls back to the prose for anything else', () => {
    expect(SRDINFO).toMatch(/const entry = await lookupByResource\(resource, name\);/);
  });
});
