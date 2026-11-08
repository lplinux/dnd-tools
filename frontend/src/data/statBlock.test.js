/**
 * data/statBlock.test.js
 *
 * The reading card must give the same numbers as the printed stat blocks it
 * was built from. The fixture is four of the Oracle's Chamber stat blocks as
 * stored (DM notes blanked); every expected value below is the PRINTED one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { statBlockView, entriesOf } from './statBlock';
import FIX from './__fixtures__/oracleStatBlocks.json';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.resolve(here, p), 'utf8');

describe('the numbers match the printed stat blocks', () => {
  it('Vhessk: saves, expertise Perception, resistances', () => {
    const v = statBlockView(FIX.Vhessk);
    expect(v.saves).toEqual(['Con +6', 'Wis +7', 'Cha +5']);
    expect(v.skills).toEqual(['Perception +10']);
    expect(v.tags).toEqual([{ label: 'Damage Resistances', value: 'Cold, Lightning, Thunder' }]);
    expect(v.spells).toEqual([]);
    expect([v.ac, v.hp, v.cr]).toEqual(['16', '142', '6']);
  });

  it('Ssharai: DC 12, +4 to hit, Perception +6, Religion +3', () => {
    const v = statBlockView(FIX.Ssharai);
    expect([v.spellDc, v.spellAtk]).toEqual([12, 4]);
    expect(v.skills).toEqual(['Perception +6', 'Religion +3']);
    expect(v.spells[0]).toMatchObject({ level: 0, slots: null, names: ['Guidance', 'Thaumaturgy'] });
  });

  it('Nerida: DC 15, +7, slots 4/3/3/1, Insight +10', () => {
    const v = statBlockView(FIX['Nerida Stormtide']);
    expect([v.spellDc, v.spellAtk]).toEqual([15, 7]);
    expect(v.spells.filter((r) => r.level > 0).map((r) => r.slots)).toEqual([4, 3, 3, 1]);
    expect(v.skills).toContain('Insight +10');
    expect(v.saves).toEqual(['Wis +7', 'Cha +6']);
  });

  it('Pilika: Performance and Persuasion +10, Dex +6, Cha +7', () => {
    const v = statBlockView(FIX['Pilika Greenbottle']);
    expect(v.skills).toEqual(expect.arrayContaining(['Performance +10', 'Persuasion +10', 'Deception +7']));
    expect(v.saves).toEqual(['Dex +6', 'Cha +7']);
    expect(v.kindLine).toBe('Halfling · Bard — College of Lore · Chaotic Good');
  });

  it('an empty blob still renders', () => {
    const v = statBlockView(undefined);
    expect(v.abilities.every((a) => a.score === 10 && a.mod === 0)).toBe(true);
    expect(v.sections).toEqual([]);
  });
});

describe('text boxes become named entries', () => {
  it('reads "Name. Text", with one bracket allowed in the name', () => {
    const e = entriesOf(FIX.Vhessk.leg_actions);
    expect(e.map((x) => x.name)).toEqual([null, 'Surge', 'Water Jet (Costs 1)', 'Undertow (Costs 2)', 'Call the Deep (Costs 3)']);
  });

  it('keeps an indented line as a continuation of the entry above', () => {
    const e = entriesOf(FIX.Vhessk.actions);
    const i = e.findIndex((x) => x.name === 'Whirlpool (1/Day)');
    expect(e[i + 1]).toMatchObject({ name: null, sub: true });
  });

  it('does not invent a name for a plain sentence', () => {
    expect(entriesOf('Three per round, one at a time, at the end of another creature\'s turn.')[0].name).toBeNull();
  });
});

describe('the encounter tab', () => {
  const tab = read('../pages/ManageCampaigns/tabs/EncounterTab.jsx');
  const card = read('../components/StatBlockCard.jsx');

  it('draws stat blocks natively — no iframe per creature', () => {
    expect(card).not.toMatch(/<iframe|import StatsSheetFrame/);
    expect(tab).not.toMatch(/<iframe|import StatsSheetFrame/);
  });

  it('switches by key: 1–9 show, Shift pins, arrows step, never while typing', () => {
    expect(tab).toMatch(/if \(e\.shiftKey\) setSecondary/);
    expect(tab).toMatch(/e\.key === 'ArrowRight' \|\| e\.key === 'ArrowLeft'/);
    expect(tab).toMatch(/e\.target\.closest\?\.\('input, textarea, select/);
  });

  it('remembers the line-up per campaign, without depending on storage', () => {
    expect(tab).toMatch(/encounter-lineup:\$\{cid\}/);
    expect(tab).toMatch(/try \{ localStorage\.setItem/);
  });
});
