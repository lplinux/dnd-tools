/**
 * data/spellDetails.test.js
 *
 * The 2024 SRD spell record → what the sheet and the card show.
 *
 * The fixtures are trimmed copies of real records from
 * dnd5eapi.co/api/2024/spells, chosen for the shapes that needed a rule:
 * a reaction with its trigger, a ritual that is also concentration, a
 * costly material, a record whose components landed in its range, and one
 * whose duration says concentration while its flag says otherwise. The
 * mapping was also run over all 339 SRD spells while it was written, and
 * these pin what that found.
 */
import { describe, it, expect } from 'vitest';
import {
  spellFromSrd, levelLine, levelShort, castingTimeShort, castingTimeFull,
  durationText, durationShort, componentsText, needsMaterial, materialCost, byLevelThenName,
} from './spellDetails';

const school = (name) => ({ index: name.toLowerCase(), name });
const cls = (...names) => names.map((name) => ({ index: name.toLowerCase(), name }));

const FIREBALL = {
  name: 'Fireball', level: 3, school: school('Evocation'), casting_time: 'Action',
  range: '150 feet', components: ['V', 'S', 'M'], material: 'a ball of bat guano and sulfur',
  duration: 'Instantaneous', concentration: false, ritual: false,
  description: 'A bright streak flashes from you to a point you choose within range.',
  higher_level: 'The damage increases by 1d6 for each spell slot level above 3.',
  classes: cls('Sorcerer', 'Wizard'),
};
const SHIELD = {
  name: 'Shield', level: 1, school: school('Abjuration'),
  casting_time: 'Reaction, which you take when you are hit by an attack roll or targeted by the Magic Missile spell',
  range: 'Self', components: ['V', 'S'], duration: '1 round', concentration: false, ritual: false,
  description: 'An imperceptible barrier of magical force protects you.', classes: cls('Sorcerer', 'Wizard'),
};
const DETECT_MAGIC = {
  name: 'Detect Magic', level: 1, school: school('Divination'), casting_time: 'Action',
  range: 'Self', components: ['V', 'S'], duration: 'up to 10 minutes', concentration: true, ritual: true,
  description: 'For the duration, you sense the presence of magical effects within 30 feet of yourself.',
  classes: cls('Bard', 'Cleric', 'Wizard'),
};
const FIND_FAMILIAR = {
  name: 'Find Familiar', level: 1, school: school('Conjuration'), casting_time: '1 hour',
  range: '10 feet', components: ['V', 'S', 'M'],
  material: 'burning incense worth 10+ GP, which the spell consumes',
  duration: 'Instantaneous', concentration: false, ritual: true,
  description: 'You gain the service of a familiar.', classes: cls('Wizard'),
};
// The real shape: `components` empty, and the components on the end of the
// range. Nine SRD records arrive like this.
const GUIDANCE = {
  name: 'Guidance', level: 0, school: school('Divination'), casting_time: 'Action',
  range: 'Touch Component: V, S',
  components: [], material: null, duration: 'up to 1 minute', concentration: true, ritual: false,
  description: 'You touch a willing creature and choose a skill.', classes: cls('Cleric', 'Druid'),
};
const PROT_EVIL = {
  name: 'Protection from Evil and Good', level: 1, school: school('Abjuration'),
  casting_time: 'Action', range: 'Touch', components: ['V', 'S', 'M'],
  material: 'a flask of Holy Water worth 25+, GP, which the spell consumes',
  duration: 'Concentration up to 10 minutes', concentration: false, ritual: false,
  description: 'Until the spell ends, one willing creature you touch is protected.',
  classes: cls('Cleric', 'Paladin', 'Warlock', 'Wizard'),
};

const s = (body) => spellFromSrd(body);

describe('reading a record', () => {
  it('takes the fields a sheet shows', () => {
    expect(s(FIREBALL)).toMatchObject({
      name: 'Fireball', level: 3, school: 'Evocation', castingTime: 'Action', range: '150 feet',
      components: ['V', 'S', 'M'], material: 'a ball of bat guano and sulfur',
      duration: 'Instantaneous', concentration: false, ritual: false,
      classes: ['Sorcerer', 'Wizard'],
    });
    expect(s(FIREBALL).higherLevel).toMatch(/1d6 for each spell slot level above 3/);
  });

  it('reads the prose from either field the API uses', () => {
    expect(s({ ...FIREBALL, description: undefined, desc: ['One.', 'Two.'] }).paragraphs).toEqual(['One.', 'Two.']);
  });

  it('is null for nothing, or for something that is not a spell', () => {
    expect(s(null)).toBeNull();
    expect(s({ name: 'Frightened', description: 'x' })).toBeNull();
  });
});

describe('the lines the book prints', () => {
  it('level and school, with who can cast it', () => {
    expect(levelLine(s(FIREBALL))).toBe('Level 3 Evocation (Sorcerer, Wizard)');
    expect(levelLine(s(GUIDANCE))).toBe('Divination Cantrip (Cleric, Druid)');
    expect(levelShort(0)).toBe('Cantrip');
    expect(levelShort(3)).toBe('3rd');
  });

  it('a reaction keeps its trigger on the card and drops it in the table', () => {
    expect(castingTimeShort(s(SHIELD))).toBe('Reaction');
    expect(castingTimeFull(s(SHIELD))).toMatch(/^Reaction, which you take when you are hit/);
  });

  it('a ritual says so on the card, and leaves it to the tag in the list', () => {
    expect(castingTimeFull(s(DETECT_MAGIC))).toBe('Action or Ritual');
    expect(castingTimeShort(s(DETECT_MAGIC))).toBe('Action');
    expect(castingTimeShort(s(FIND_FAMILIAR))).toBe('1 hour');
  });

  it('concentration reads the way the book prints it on the card', () => {
    expect(durationText(s(DETECT_MAGIC))).toBe('Concentration, up to 10 minutes');
    expect(durationText(s(FIREBALL))).toBe('Instantaneous');
  });

  it('and in the list, without the word the tag already says', () => {
    expect(durationShort(s(DETECT_MAGIC))).toBe('Up to 10 minutes');
    expect(durationShort(s(PROT_EVIL))).toBe('Up to 10 minutes');
    expect(durationShort(s(FIREBALL))).toBe('Instantaneous');
  });

  it('components carry their material', () => {
    expect(componentsText(s(FIREBALL))).toBe('V, S, M (a ball of bat guano and sulfur)');
    expect(componentsText(s(SHIELD))).toBe('V, S');
  });
});

describe('what the source gets wrong, handled rather than repeated', () => {
  it('components filed at the end of the range are read back out of it', () => {
    // Guidance, Divine Smite, Sorcerous Burst and six more. Found by
    // rendering the sheet: Guidance's range read "Touch Component: V, S".
    const g = s(GUIDANCE);
    expect(g.range).toBe('Touch');
    expect(g.components).toEqual(['V', 'S']);
    expect(componentsText(g)).toBe('V, S');
    expect(s({ ...GUIDANCE, range: 'Self Component: V' })).toMatchObject({ range: 'Self', components: ['V'] });
  });

  it('a range that is just a range is left alone', () => {
    expect(s(FIREBALL).range).toBe('150 feet');
  });

  it('a record with genuinely no components shows a gap, not an invented list', () => {
    expect(componentsText(s({ ...GUIDANCE, range: 'Touch' }))).toBe('—');
  });

  it('a duration that says concentration IS concentration, whatever the flag says', () => {
    const p = s(PROT_EVIL);
    expect(p.concentration).toBe(true);
    expect(durationText(p)).toBe('Concentration, up to 10 minutes');
    expect(materialCost(p)).toBe('25+ GP');
  });

  it('a cost written "25+, GP" still counts as a cost', () => {
    expect(needsMaterial(s({ ...PROT_EVIL, material: 'a flask worth 25+, GP' }))).toBe(true);
  });
});

describe("a material's cost, as a tag on the M", () => {
  it('names the price', () => {
    expect(materialCost(s(FIND_FAMILIAR))).toBe('10+ GP');
    expect(materialCost(s({ ...FIREBALL, material: 'a diamond worth 1,000+ GP' }))).toBe('1,000+ GP');
  });

  it('or says it is consumed when there is no price', () => {
    expect(materialCost(s({ ...FIREBALL, material: 'a feather, which the spell consumes' }))).toBe('consumed');
  });

  it('and is nothing when a focus would do', () => {
    // Bat guano has no cost: a component pouch or focus covers it.
    expect(needsMaterial(s(FIREBALL))).toBe(false);
    expect(materialCost(s(FIREBALL))).toBeNull();
    expect(materialCost(s(SHIELD))).toBeNull();
  });
});

describe('order', () => {
  it('by level, then by name', () => {
    const list = [s(FIREBALL), s(SHIELD), s(GUIDANCE), s(DETECT_MAGIC)].sort(byLevelThenName);
    expect(list.map((x) => x.name)).toEqual(['Guidance', 'Detect Magic', 'Shield', 'Fireball']);
  });
});
