/**
 * Flattening SRD / Open5e payloads onto the NPC sheet.
 *
 * The two APIs disagree about almost every shape — dnd5eapi gives
 * `armor_class: [{value}]` and a `speed` object, Open5e gives a plain int and
 * numeric speeds — and the sheet wants prose in both cases. These fixtures are
 * trimmed from real responses (goblin-warrior and adult-red-dragon), which is
 * how this mapping was originally checked by hand.
 */

import { describe, it, expect } from 'vitest';
import {
  fmtCr, fmtAc, fmtSpeed, fmtSenses, fmtHp, fmtBlocks,
  splitProficiencies, monsterToSheet, open5eMonsterToSheet,
  speciesToSheet, subclassFeaturesText, open5eSubclassFeaturesText, magicItemToCard,
} from './srdMap';

describe('formatters', () => {
  it('writes sub-1 challenge ratings as fractions', () => {
    expect(fmtCr(0)).toBe('0');
    expect(fmtCr(0.125)).toBe('1/8');
    expect(fmtCr(0.25)).toBe('1/4');
    expect(fmtCr(0.5)).toBe('1/2');
    expect(fmtCr(17)).toBe('17');
    expect(fmtCr(null)).toBe('');
  });

  it('takes the first armor class entry — later ones are alternate forms', () => {
    expect(fmtAc([{ value: 15, armor: [] }, { value: 20 }])).toBe('15');
    expect(fmtAc(19)).toBe('19');
    expect(fmtAc(null)).toBe('');
  });

  it('leaves walking speed unlabelled and names the rest', () => {
    expect(fmtSpeed({ walk: '30 ft.' })).toBe('30 ft.');
    expect(fmtSpeed({ walk: '40 ft.', climb: '40 ft.', fly: '80 ft.' }))
      .toBe('40 ft., climb 40 ft., fly 80 ft.');
  });

  it('drops passive perception from senses — the sheet derives it', () => {
    expect(fmtSenses({ darkvision: '60 ft.', passive_perception: 9 })).toBe('Darkvision 60 ft.');
  });

  it('writes hit points in stat-block notation', () => {
    expect(fmtHp(10, '3d6')).toBe('10 (3d6)');
    expect(fmtHp(10, null)).toBe('10');
    expect(fmtHp(null)).toBe('');
  });

  it('renders named blocks, tolerating either desc key', () => {
    expect(fmtBlocks([{ name: 'Nimble Escape', desc: 'Disengage or Hide.' }]))
      .toBe('Nimble Escape. Disengage or Hide.');
    expect(fmtBlocks([{ name: 'A', description: 'x' }, { name: 'B', desc: 'y' }]))
      .toBe('A. x\n\nB. y');
    expect(fmtBlocks([])).toBe('');
    expect(fmtBlocks(null)).toBe('');
  });
});

describe('splitProficiencies', () => {
  it('separates skills from saving throws', () => {
    const { skillProfs, stProf } = splitProficiencies([
      { value: 6, proficiency: { index: 'skill-stealth' } },
      { value: 5, proficiency: { index: 'saving-throw-dex' } },
      { value: 3, proficiency: { index: 'armor-light' } },   // neither — ignored
    ]);
    expect(skillProfs).toEqual({ Stealth: 1 });
    expect(stProf).toEqual({ dex: true });
  });

  it('is safe on missing input', () => {
    expect(splitProficiencies(null)).toEqual({ skillProfs: {}, stProf: {} });
  });
});

describe('monsterToSheet (dnd5eapi shape)', () => {
  const goblin = {
    name: 'Goblin Warrior', size: 'Small', type: 'fey', alignment: 'chaotic neutral',
    armor_class: [{ value: 15 }], hit_points: 10, hit_dice: '3d6',
    challenge_rating: 0.25, speed: { walk: '30 ft.' },
    senses: { darkvision: '60 ft.', passive_perception: 9 },
    languages: 'Common, Goblin',
    strength: 8, dexterity: 15, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8,
    proficiencies: [{ value: 6, proficiency: { index: 'skill-stealth' } }],
    actions: [{ name: 'Scimitar', desc: 'Melee Attack Roll: +4.' }],
    special_abilities: [], damage_immunities: [], condition_immunities: [],
  };

  it('maps a whole stat block', () => {
    const { fields, abilities, skillProfs } = monsterToSheet(goblin);
    expect(fields.charName).toBe('Goblin Warrior');
    expect(fields.race).toBe('Small Fey');            // type is lowercase in the API
    expect(fields.alignment).toBe('Chaotic Neutral');
    expect(fields.ac).toBe('15');
    expect(fields.hp).toBe('10 (3d6)');
    expect(fields.cr).toBe('1/4');
    expect(fields.senses).toBe('Darkvision 60 ft.');
    expect(fields.langs).toBe('Common, Goblin');
    expect(fields.actions).toContain('Scimitar.');
    expect(abilities.str).toEqual({ score: 8, stProf: false });
    expect(skillProfs).toEqual({ Stealth: 1 });
  });

  it('canonicalises damage types onto the sheet\'s own vocabulary', () => {
    const dragon = { ...goblin, damage_immunities: ['fire'] };
    expect(monsterToSheet(dragon).tags.immune).toEqual(['Fire']);
  });

  it('returns null for no monster', () => {
    expect(monsterToSheet(null)).toBeNull();
  });
});

describe('open5eMonsterToSheet (the flatter Open5e shape)', () => {
  const goblin = {
    name: 'Goblin', size: 'Small', type: 'Humanoid', alignment: 'neutral evil',
    armor_class: 15, hit_points: 7, hit_dice: '2d6', challenge_rating: '1/4',
    speed: { walk: 30 },                                  // a NUMBER, not '30 ft.'
    senses: 'darkvision 60 ft., passive Perception 9',    // already a string
    languages: 'Common, Goblin',
    strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8,
    dexterity_save: 4,
    skills: { stealth: 6 },
    damage_immunities: '', condition_immunities: '',
    actions: [{ name: 'Scimitar', desc: '+4 to hit.' }],
  };

  it('adds units to numeric speeds', () => {
    expect(open5eMonsterToSheet(goblin).fields.speed).toBe('30 ft.');
  });

  it('strips passive perception out of the senses string', () => {
    expect(open5eMonsterToSheet(goblin).fields.senses).toBe('Darkvision 60 Ft.');
  });

  it('reads saving-throw proficiency from the *_save fields', () => {
    const { abilities } = open5eMonsterToSheet(goblin);
    expect(abilities.dex.stProf).toBe(true);
    expect(abilities.str.stProf).toBe(false);
  });

  it('produces the same field names as the dnd5eapi mapper', () => {
    expect(Object.keys(open5eMonsterToSheet(goblin).fields).sort())
      .toEqual(expect.arrayContaining(['charName', 'ac', 'hp', 'cr', 'speed', 'senses', 'langs']));
  });
});

describe('speciesToSheet', () => {
  it('pulls speed and trait names, and offers the lineages', () => {
    const out = speciesToSheet({
      name: 'Elf', speed: 30,
      traits: [{ name: 'Darkvision (60 ft.)' }, { name: 'Fey Ancestry' }],
      subspecies: [{ name: 'Elven Lineage: Drow' }],
    });
    expect(out.fields.race).toBe('Elf');
    expect(out.fields.speed).toBe('30 ft');
    expect(out.fields.senses).toBe('Darkvision (60 ft.)');
    expect(out.fields.specTraits).toBe('Darkvision (60 ft.), Fey Ancestry');
    expect(out.subspecies).toEqual(['Elven Lineage: Drow']);
  });
});

describe('subclass features', () => {
  const sc = {
    desc: 'A Champion focuses on martial prowess.',
    features: [
      { name: 'Improved Critical', level: 3, description: 'Crit on 19-20.' },
      { name: 'Remarkable Athlete', level: 7, description: 'Athletic.' },
    ],
  };

  it('includes only features up to the character level', () => {
    expect(subclassFeaturesText(sc, 5)).toContain('Improved Critical');
    expect(subclassFeaturesText(sc, 5)).not.toContain('Remarkable Athlete');
    expect(subclassFeaturesText(sc, 20)).toContain('Remarkable Athlete');
  });

  it('falls back to the description when an Open5e subclass has no features', () => {
    expect(open5eSubclassFeaturesText({ desc: 'Prose only.', features: [] })).toBe('Prose only.');
  });
});

describe('magicItemToCard', () => {
  it('maps rarity and category onto the card\'s own vocabulary', () => {
    const out = magicItemToCard({
      name: 'Flame Tongue', rarity: { name: 'Very Rare' }, attunement: true,
      equipment_category: { name: 'Weapons' }, desc: 'It burns.',
    });
    expect(out).toMatchObject({ name: 'Flame Tongue', type: 'Weapon', rarity: 'veryrare', attunement: true });
    expect(out.abilities).toBe('<p>It burns.</p>');
  });

  it('leaves rarity undefined when the source value is not one the card offers', () => {
    expect(magicItemToCard({ name: 'x', rarity: { name: 'Fabled' } }).rarity).toBeUndefined();
  });

  it('escapes API text — the abilities field is rendered as HTML', () => {
    const out = magicItemToCard({ name: 'x', desc: 'a <script>alert(1)</script> b' });
    expect(out.abilities).not.toContain('<script>');
    expect(out.abilities).toContain('&lt;script&gt;');
  });
});
