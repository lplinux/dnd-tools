/**
 * equipmentToItem — the SRD-equipment → inventory-row mapper.
 *
 * The payloads below are REAL responses from dnd5eapi.co/api/2024/equipment,
 * trimmed but not reshaped. That matters: an earlier version of this file
 * invented a `desc: [...]` field, which the 2024 endpoint does not send. The
 * tests passed against the made-up shape while the real feature silently
 * dropped every description, so a Potion of Healing arrived on the sheet
 * carrying its price and nothing about what it does.
 *
 * Three things about the real payload are not obvious from the docs, and all
 * three would quietly degrade the feature if they changed:
 *
 *   - the prose is `description`, an ARRAY of paragraphs — never `desc`;
 *   - the category field is `equipment_categories`, plural and an array — the
 *     singular `equipment_category` never appears;
 *   - `weight` is omitted entirely for weightless entries rather than sent as
 *     0, so "unknown" and "weighs nothing" have to stay distinguishable.
 */
import { describe, it, expect } from 'vitest';
import { equipmentToItem } from './srdMap';

/** Real: /api/2024/equipment/potion-of-healing */
const POTION_OF_HEALING = {
  index: 'potion-of-healing',
  name: 'Potion of Healing',
  equipment_categories: [{ index: 'adventuring-gear', name: 'Adventuring Gear' }],
  cost: { quantity: 50, unit: 'gp' },
  description: [
    'This potion is a magic item. As a Bonus Action, you can drink it or administer it to another creature within 5 feet of yourself. The creature that drinks the magical red fluid in this vial regains 2d4 + 2 Hit Points.',
  ],
  weight: 0.5,
  notes: [],
  properties: [],
};

/**
 * Real: /api/2024/equipment/longsword.
 *
 * Its `description` is EMPTY — a weapon's information is entirely in these
 * structured fields. That is why fixing the description bug alone still left a
 * longsword showing nothing but its price.
 */
const LONGSWORD = {
  index: 'longsword',
  name: 'Longsword',
  equipment_categories: [
    { name: 'Martial Melee Weapons' }, { name: 'Martial Weapons' },
    { name: 'Melee Weapons' }, { name: 'Weapons' },
  ],
  cost: { quantity: 15, unit: 'gp' },
  damage: { damage_dice: '1d8', damage_type: { name: 'Slashing' } },
  two_handed_damage: { damage_dice: '1d10', damage_type: { name: 'Slashing' } },
  range: { normal: 5 },
  properties: [{ name: 'Versatile' }],
  mastery: { name: 'Sap' },
  description: [],
  weight: 3,
};

/** Real: /api/2024/equipment/half-plate-armor */
const HALF_PLATE = {
  name: 'Half-Plate Armor',
  equipment_categories: [{ name: 'Armor' }, { name: 'Medium Armor' }],
  armor_class: { base: 15, dex_bonus: true, max_bonus: 2 },
  cost: { quantity: 750, unit: 'gp' },
  don_time: '5 minutes', doff_time: '1 minute',
  stealth_disadvantage: true, str_minimum: 0, weight: 40,
};

/** Real: /api/2024/equipment/shield — `base` is a BONUS here, not a base AC. */
const SHIELD = {
  name: 'Shield',
  equipment_categories: [{ name: 'Armor' }, { name: 'Shields' }],
  armor_class: { base: 2, dex_bonus: false },
  cost: { quantity: 10, unit: 'gp' },
  stealth_disadvantage: false, str_minimum: 0, weight: 6,
};

/** Real: /api/2024/equipment/longbow */
const LONGBOW = {
  name: 'Longbow',
  equipment_categories: [{ name: 'Martial Ranged Weapons' }],
  cost: { quantity: 5, unit: 'gp' },
  damage: { damage_dice: '1d8', damage_type: { name: 'Piercing' } },
  range: { normal: 150, long: 600 },
  properties: [{ name: 'Ammunition' }, { name: 'Heavy' }, { name: 'Two-Handed' }],
  ammunition: { name: 'Arrows' },
  mastery: { name: 'Slow' },
  weight: 2,
};

describe('equipmentToItem', () => {
  it('keeps the description, which is the whole point of the lookup', () => {
    const out = equipmentToItem(POTION_OF_HEALING);
    expect(out.notes).toContain('regains 2d4 + 2 Hit Points');
    expect(out.notes).toContain('Cost: 50 gp');
    expect(out.name).toBe('Potion of Healing');
    expect(out.weight).toBe(0.5);
  });

  it('reads `description`, not `desc` — nothing on /api/2024 sends `desc`', () => {
    // The regression that started this. If someone "simplifies" the mapper back
    // to e.desc, every SRD item silently loses its text again.
    expect(equipmentToItem({ name: 'X', description: ['It glows.'] }).notes).toBe('It glows.');
    expect(equipmentToItem({ name: 'X', desc: ['Legacy 2014 shape.'] }).notes)
      .toBe('Legacy 2014 shape.');
  });

  it('joins multiple paragraphs rather than running them together', () => {
    expect(equipmentToItem({ name: 'X', description: ['One.', 'Two.'] }).notes)
      .toBe('One.\n\nTwo.');
  });

  it('puts the cost last, after the prose', () => {
    // At the table you want to know what the thing does, not what it sold for.
    expect(equipmentToItem(POTION_OF_HEALING).notes)
      .toBe(POTION_OF_HEALING.description[0] + '\n\nCost: 50 gp');
  });

  it('routes a potion to the Potions panel', () => {
    // By name: potions sit under "Adventuring Gear" in the 2024 SRD, so the
    // category is no help and the name is load-bearing.
    expect(equipmentToItem(POTION_OF_HEALING).category).toBe('potions');
    expect(equipmentToItem({ name: 'Basic Poison', weight: 0 }).category).toBe('potions');
  });

  it('also routes by category, for the day the SRD starts labelling them', () => {
    expect(equipmentToItem({
      name: 'Unlabelled Flask',
      equipment_categories: [{ name: 'Potion' }],
    }).category).toBe('potions');
  });

  it('leaves everything else in Inventory for the player to move', () => {
    expect(equipmentToItem(LONGSWORD).category).toBe('inventory');
    expect(equipmentToItem({ name: "Alchemist's Supplies" }).category).toBe('inventory');
  });

  it('a missing weight is null, not zero — unweighed is not weightless', () => {
    expect(equipmentToItem({ name: 'Spellbook' }).weight).toBeNull();
    expect(equipmentToItem({ name: 'Feather', weight: 0 }).weight).toBe(0);
  });

  it('survives an entry with no cost and no description', () => {
    expect(equipmentToItem({ name: 'Mystery Box' }).notes).toBeNull();
  });

  it('null in, null out — the caller fails open on a dead lookup', () => {
    expect(equipmentToItem(null)).toBeNull();
    expect(equipmentToItem(undefined)).toBeNull();
  });
});

describe('weapons and armour, whose description is always empty', () => {
  it('gives a longsword its damage, reach, properties and mastery', () => {
    expect(equipmentToItem(LONGSWORD).notes).toBe(
      '1d8 slashing (1d10 two-handed)\n'
      + 'Reach 5 ft.\n'
      + 'Versatile \u00b7 Mastery: Sap\n\n'
      + 'Cost: 15 gp',
    );
  });

  it('spells out the versatile die, which the property name alone does not', () => {
    expect(equipmentToItem(LONGSWORD).notes).toContain('1d10 two-handed');
  });

  it('does not invent a two-handed die when it matches the one-handed one', () => {
    const out = equipmentToItem({
      name: 'Club',
      damage: { damage_dice: '1d4', damage_type: { name: 'Bludgeoning' } },
      two_handed_damage: { damage_dice: '1d4' },
    });
    expect(out.notes).toBe('1d4 bludgeoning');
  });

  it('distinguishes reach from a ranged weapon\u2019s two bands', () => {
    expect(equipmentToItem(LONGSWORD).notes).toContain('Reach 5 ft.');
    expect(equipmentToItem(LONGBOW).notes).toContain('Range 150/600 ft.');
  });

  it('folds the ammunition type into the Ammunition property', () => {
    // Otherwise a longbow reads "Ammunition \u00b7 \u2026 \u00b7 Ammunition: Arrows".
    const notes = equipmentToItem(LONGBOW).notes;
    expect(notes).toContain('Ammunition (Arrows)');
    expect(notes.match(/Ammunition/g)).toHaveLength(1);
  });

  it('reads armour as a base AC plus a capped Dex bonus', () => {
    expect(equipmentToItem(HALF_PLATE).notes).toBe(
      'AC 15 + Dex (max 2)\n'
      + 'Disadvantage on Stealth\n'
      + 'Don 5 minutes \u00b7 Doff 1 minute\n\n'
      + 'Cost: 750 gp',
    );
  });

  it('reads a shield as a BONUS, not a base AC', () => {
    // `armor_class.base` is 2 for a shield. "AC 2" would be wrong by eleven,
    // and the only thing distinguishing the two cases is the category.
    expect(equipmentToItem(SHIELD).notes).toContain('AC +2');
    expect(equipmentToItem(SHIELD).notes).not.toContain('AC 2\n');
  });

  it('omits an uncapped Dex bonus rather than printing "max undefined"', () => {
    expect(equipmentToItem({
      name: 'Leather Armor',
      equipment_categories: [{ name: 'Light Armor' }],
      armor_class: { base: 11, dex_bonus: true },
    }).notes).toBe('AC 11 + Dex');
  });

  it('omits the Dex bonus entirely for heavy armour', () => {
    expect(equipmentToItem({
      name: 'Plate Armor',
      equipment_categories: [{ name: 'Heavy Armor' }],
      armor_class: { base: 18, dex_bonus: false },
      str_minimum: 15,
    }).notes).toBe('AC 18\nRequires Strength 15');
  });

  it('treats str_minimum 0 as no requirement, not Strength 0', () => {
    expect(equipmentToItem(HALF_PLATE).notes).not.toContain('Strength');
  });

  it('says nothing at all for an item with no structured fields', () => {
    // A potion must not pick up a stray blank line from an empty stat block.
    expect(equipmentToItem(POTION_OF_HEALING).notes.startsWith('This potion')).toBe(true);
  });
});
