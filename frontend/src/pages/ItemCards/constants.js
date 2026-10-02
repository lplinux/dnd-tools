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
 * Printable-card geometry. A standard "tarot"-ish item card; content flows across
 * one or more of these fixed-size cards (Front → Back → Continuation). Auto-fit
 * shrinks the font between MAX and MIN before spilling to another card.
 */
export const CARD = {
  widthMM: 63,      // poker/MTG width
  heightMM: 88,     // poker/MTG height
  paddingMM: 4,
  maxFontPx: 14,
  minFontPx: 8,
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
  };
}
