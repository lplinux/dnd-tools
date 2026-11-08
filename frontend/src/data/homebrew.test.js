/**
 * data/homebrew.test.js
 *
 * A homebrew spell renders through the same card as an SRD one, so the round
 * trip SRD → homebrew body → card must not lose anything.
 */
import { describe, it, expect } from 'vitest';

import { spellFromHomebrew, spellToHomebrew, blankSpell, KINDS, STATUSES, creatureLine } from './homebrew';
import { spellFromSrd } from './spellDetails';

const SRD = {
  name: 'Fire Bolt', level: 0, school: { name: 'Evocation' }, casting_time: 'Action',
  range: '120 feet', components: ['V', 'S'], duration: 'Instantaneous',
  description: 'You hurl a mote of fire.\nIt ignites objects.', higher_level: 'More dice.',
  classes: [{ name: 'Sorcerer' }, { name: 'Wizard' }],
};

describe('homebrew spells', () => {
  it('survive SRD → homebrew → card unchanged', () => {
    const s = spellFromSrd(SRD);
    const card = spellFromHomebrew({ name: s.name, data: spellToHomebrew(s) });
    expect(card).toMatchObject({
      name: 'Fire Bolt', level: 0, school: 'Evocation', castingTime: 'Action', range: '120 feet',
      components: ['V', 'S'], duration: 'Instantaneous', higherLevel: 'More dice.',
      classes: ['Sorcerer', 'Wizard'], paragraphs: ['You hurl a mote of fire.', 'It ignites objects.'],
    });
  });

  it('fill anything missing from a blank spell, so an old body still renders', () => {
    const card = spellFromHomebrew({ name: 'Odd', data: { level: 2 } });
    expect(card.components).toEqual(blankSpell().components);
    expect(card.paragraphs).toEqual([]);
    expect(card.level).toBe(2);
  });

  it('list spells, creatures and the embedded item cards as built; feats to come', () => {
    expect(KINDS.filter((k) => k.ready).map((k) => k.id)).toEqual(['spell', 'creature', 'item']);
    expect(KINDS.find((k) => k.id === 'item').embedded).toBe(true);
    expect(KINDS.find((k) => k.id === 'feat').ready).toBe(false);
  });

  it('sum a creature up in one line, skipping what is blank', () => {
    expect(creatureLine({ cr: '3', race: 'Monstrosity', alignment: 'Neutral evil' })).toBe('CR 3 · Monstrosity · Neutral evil');
    expect(creatureLine({ race: 'Beast' })).toBe('Beast');
    expect(creatureLine(undefined)).toBe('');
  });

  it('use the statuses the server accepts', () => {
    expect(STATUSES.map((s) => s.id)).toEqual(['draft', 'playtest', 'final']);
  });
});
