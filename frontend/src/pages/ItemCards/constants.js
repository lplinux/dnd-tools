/**
 * pages/ItemCards/constants.js
 *
 * Static data for the Item Card Creator.
 */

export const ITEM_TYPES = [
  'Accessory', 'Armor', 'Artifact', 'Consumable',
  'Potion', 'Weapon', 'Wondrous Item',
];

export const RARITIES = [
  { id: 'common',    label: 'Common',    color: '#a0a0a0' },
  { id: 'uncommon',  label: 'Uncommon',  color: '#3cb371' },
  { id: 'rare',      label: 'Rare',      color: '#4169e1' },
  { id: 'veryrare',  label: 'Very Rare', color: '#8a2be2' },
  { id: 'legendary', label: 'Legendary', color: '#ffd700' },
  { id: 'artifact',  label: 'Artifact',  color: 'var(--gold)' },
];

export const ARMOR_TYPES = ['Light', 'Medium', 'Heavy'];

/**
 * Printable-card geometry. A poker-sized item card with two faces: Front, then
 * Back. Auto-fit measures each face and picks the largest whole pixel size
 * between MAX and MIN at which it fits.
 *
 * There is no third card. The comment here used to say content "flows across
 * one or more" cards and spills "to another card" when it will not fit, and
 * the print help text said the same — neither was ever true. A face that still
 * overflows at MIN is clipped, because the body is `overflow: hidden`. See
 * TODO.md for the continuation cards that would actually carry the remainder.
 */
export const CARD = {
  widthMM: 63,      // poker/MTG width
  heightMM: 88,     // poker/MTG height
  paddingMM: 4,
  maxFontPx: 14,
  // 6px is about 1.5mm tall — readable held close, not across a table. It is
  // this low because the alternative at the floor is silent truncation: the
  // content simply stops, with nothing on the card to say so. Dropping 8 -> 6
  // buys about 73% more room and rescues most, though not all, of the long
  // homebrew items. See TODO.md for the continuation cards that would fix the
  // rest properly.
  minFontPx: 6,
};
export const MM_TO_PX = 96 / 25.4; // CSS px per mm at 96dpi

/** Which item types show the weapon stats block */
export const WEAPON_TYPES = ['Weapon'];

/** Which item types show the armor stats block */
export const ARMOR_TYPES_TRIGGER = ['Armor'];

/** Which item types show the uses/charges block */
export const CONSUMABLE_TYPES = ['Consumable', 'Potion'];

/**
 * Default form state.
 * Exported as a factory so each clearForm() call gets a fresh object.
 */
export function defaultForm() {
  return {
    name:       '',
    type:       '',
    rarity:     'rare',
    flavor:     '',
    attunement: false,
    // Pounds. Optional — blank means "unweighed", which is not the same as
    // weightless. Feeds the carry total on a character's Inventory tab when
    // the card is granted to them.
    weight:     '',
    // Weapon
    damage:     '',
    damageType: '',
    properties: '',
    // Armor
    acBonus:    '',
    armorType:  '',
    // Consumable / Potion
    uses:       '',
    // Rich-text abilities (stored as HTML string)
    abilities:  '',
    // The card this one grew out of, by id, or null for a base tier. DM-only:
    // it never reaches the preview or the print card, and never reaches a
    // player at all — see the INV_SELECT comment in app.js.
    evolvesFrom: null,
  };
}

/**
 * Has anything been typed into this form yet?
 *
 * `evolvesFrom` is excluded deliberately: choosing a parent is the action that
 * asks this question, so counting it would make the answer always "yes".
 *
 * Used to decide whether picking a parent may copy that card over the form
 * silently, or has to ask first. Getting it wrong in the lenient direction
 * costs someone the abilities text they just wrote.
 */
export function isFormDirty(form) {
  const blank = defaultForm();
  return Object.keys(blank).some((k) => {
    if (k === 'evolvesFrom') return false;
    return (form?.[k] ?? '') !== blank[k];
  });
}
