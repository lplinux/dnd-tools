/**
 * src/data/dnd.js
 *
 * Static D&D 5e constants shared across modules.
 * Import what you need — nothing here has side effects.
 */

export const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
export const ABILITY_IDS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** [skill name, governing ability id] */
export const SKILLS = [
  ['Acrobatics',     'dex'], ['Animal Handling', 'wis'], ['Arcana',       'int'],
  ['Athletics',      'str'], ['Deception',       'cha'], ['History',      'int'],
  ['Insight',        'wis'], ['Intimidation',    'cha'], ['Investigation','int'],
  ['Medicine',       'wis'], ['Nature',          'int'], ['Perception',   'wis'],
  ['Performance',    'cha'], ['Persuasion',      'cha'], ['Religion',     'int'],
  ['Sleight of Hand','dex'], ['Stealth',         'dex'], ['Survival',     'wis'],
];

export const DAMAGE_TYPES = [
  'Acid','Bludgeoning','Cold','Fire','Force','Lightning','Necrotic','Piercing',
  'Poison','Psychic','Radiant','Slashing','Thunder',
  'Nonmagical Bludgeoning','Nonmagical Piercing','Nonmagical Slashing',
  'Spell Damage','Magical Weapons','Silver','Adamantine',
];

export const CONDITIONS = [
  'Blinded','Charmed','Deafened','Exhaustion','Frightened','Grappled',
  'Incapacitated','Invisible','Paralyzed','Petrified','Poisoned',
  'Prone','Restrained','Stunned','Unconscious','Disease','Sleep',
  'Ability Score Reduction',
];

export const CLASSES = [
  'Artificer','Barbarian','Bard','Cleric','Druid','Fighter','Monk',
  'Paladin','Ranger','Rogue','Sorcerer','Warlock','Wizard','Multiclass',
];

export const ALIGNMENTS = [
  'Lawful Good','Neutral Good','Chaotic Good',
  'Lawful Neutral','True Neutral','Chaotic Neutral',
  'Lawful Evil','Neutral Evil','Chaotic Evil','Unaligned',
];

export const FULL_CASTERS  = ['Bard','Cleric','Druid','Sorcerer','Wizard'];
export const HALF_CASTERS  = ['Artificer','Paladin','Ranger'];
export const WARLOCKS      = ['Warlock'];

/** Default spellcasting ability per class */
export const SPELL_ABILITY_DEFAULT = {
  Bard:'cha', Cleric:'wis', Druid:'wis', Sorcerer:'cha', Wizard:'int',
  Artificer:'int', Paladin:'cha', Ranger:'wis', Warlock:'cha',
};

export const SPELL_LEVEL_NAMES = ['Cantrip','1st','2nd','3rd','4th','5th','6th','7th','8th','9th'];

/** Full caster slots per class level (indices 1–9 = spell levels 1–9) */
export const FULL_SLOTS = {
   1:[2,0,0,0,0,0,0,0,0],  2:[3,0,0,0,0,0,0,0,0],  3:[4,2,0,0,0,0,0,0,0],
   4:[4,3,0,0,0,0,0,0,0],  5:[4,3,2,0,0,0,0,0,0],  6:[4,3,3,0,0,0,0,0,0],
   7:[4,3,3,1,0,0,0,0,0],  8:[4,3,3,2,0,0,0,0,0],  9:[4,3,3,3,1,0,0,0,0],
  10:[4,3,3,3,2,0,0,0,0], 11:[4,3,3,3,2,1,0,0,0], 12:[4,3,3,3,2,1,0,0,0],
  13:[4,3,3,3,2,1,1,0,0], 14:[4,3,3,3,2,1,1,0,0], 15:[4,3,3,3,2,1,1,1,0],
  16:[4,3,3,3,2,1,1,1,0], 17:[4,3,3,3,2,1,1,1,1], 18:[4,3,3,3,3,1,1,1,1],
  19:[4,3,3,3,3,2,1,1,1], 20:[4,3,3,3,3,2,2,1,1],
};

/** Warlock slots per class level */
export const WARLOCK_SLOTS = {
   1:[1,0,0,0,0], 2:[2,0,0,0,0], 3:[0,2,0,0,0], 4:[0,2,0,0,0], 5:[0,0,2,0,0],
   6:[0,0,2,0,0], 7:[0,0,0,2,0], 8:[0,0,0,2,0], 9:[0,0,0,0,2],10:[0,0,0,0,2],
  11:[0,0,0,0,3],12:[0,0,0,0,3],13:[0,0,0,0,3],14:[0,0,0,0,3],15:[0,0,0,0,3],
  16:[0,0,0,0,3],17:[0,0,0,0,4],18:[0,0,0,0,4],19:[0,0,0,0,4],20:[0,0,0,0,4],
};

// ── Derived helpers ────────────────────────────────────────────────────────

/** Ability modifier from score */
export const abilityMod = (score) => Math.floor((score - 10) / 2);

/** Proficiency bonus from level */
export const profBonus = (level) => Math.ceil(Math.min(20, Math.max(1, level)) / 4) + 1;

/** Format a modifier as +N or -N */
export const fmtMod = (n) => (n >= 0 ? '+' : '') + n;

/** Pad to the documented 10 entries — WARLOCK_SLOTS rows only cover levels 1–5. */
const toSlotArray = (row) => [0, ...row, ...Array(9 - row.length).fill(0)];

/**
 * Get spell slot array for a given caster type and character level.
 * Returns an array of 10 numbers (index 0 = cantrip placeholder, 1–9 = slot counts),
 * except for a non-caster ('none' or unknown), which returns [].
 */
export function getSlotArray(casterType, level) {
  const lvl = Math.min(20, Math.max(1, level));
  if (casterType === 'full')    return toSlotArray(FULL_SLOTS[lvl]    ?? FULL_SLOTS[1]);
  if (casterType === 'half')    return toSlotArray(FULL_SLOTS[Math.max(1, Math.floor(lvl / 2))] ?? FULL_SLOTS[1]);
  if (casterType === 'third')   return toSlotArray(FULL_SLOTS[Math.max(1, Math.floor(lvl / 3))] ?? FULL_SLOTS[1]);
  if (casterType === 'warlock') return toSlotArray(WARLOCK_SLOTS[lvl] ?? WARLOCK_SLOTS[1]);
  if (casterType === 'innate')  return Array(10).fill(0);
  return [];
}
