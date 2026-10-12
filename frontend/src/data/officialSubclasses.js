/**
 * src/data/officialSubclasses.js
 *
 * Official Player's Handbook subclass NAMES, by class and edition.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * No API has this data. The SRD (5.1 and 5.2 alike) licenses exactly one
 * subclass per class, and Open5e's extra 113 are third-party. Assassin, Battle
 * Master, Gloom Stalker and the rest are PHB content that was never released
 * under the OGL or CC, so they exist in no licensed dataset and never will.
 *
 * ── What is and is not here ─────────────────────────────────────────────────
 * NAMES ONLY. No rules text — that text is copyrighted and unlicensed. Where a
 * name also exists in the SRD or Open5e (Champion, Thief, Berserker, Life
 * Domain…) the ⓘ lookup picks its description up automatically; everywhere else
 * the picker offers the name and nothing more, which is all that is needed to
 * stop retyping "Assassin" on every sheet.
 *
 * ── Accuracy warning ────────────────────────────────────────────────────────
 * This list was written from knowledge, NOT transcribed from a queryable
 * source, because none exists. Spot-check it against your books before trusting
 * it, and edit freely — it is a plain table with no logic attached. Adding or
 * removing an entry needs no other change anywhere.
 *
 * ── Coverage ────────────────────────────────────────────────────────────────
 * PHB 2024, PHB 2014, Xanathar's Guide to Everything and Tasha's Cauldron of
 * Everything. Later books (Fizban's, Van Richten's, Strixhaven, Wildemount…)
 * are omitted; add them here if you want them, nothing else needs changing.
 * Anything missing can still be typed by hand — free text always wins.
 *
 * ── Ordering matters ────────────────────────────────────────────────────────
 * List 2024 entries FIRST within each class. `mergeOptions` in SrdCombobox
 * de-dupes by name keeping the first occurrence, which is how a reprint
 * (Gloom Stalker, Psi Warrior, Soulknife, Fey Wanderer, Oath of Glory…) shows
 * once as current-edition rather than twice.
 *
 * A few TCE entries first appeared elsewhere — Order Domain and Circle of
 * Spores in Guildmasters' Guide to Ravnica, Bladesinging in Sword Coast — and
 * are filed under TCE, which is where you would look for them today.
 */

/** @typedef {'PHB 2024'|'PHB 2014'|'XGE'|'TCE'} SubclassBook */
/** @type {Record<string, Array<{name: string, edition: '2024'|'2014', book: SubclassBook}>>} */
export const OFFICIAL_SUBCLASSES = {
  Artificer: [
    // Artificer is a TCE class; it has no PHB or SRD presence at all, so this
    // list is its only source of subclasses.
    { name: 'Alchemist', edition: '2014', book: 'TCE' },
    { name: 'Armorer', edition: '2014', book: 'TCE' },
    { name: 'Artillerist', edition: '2014', book: 'TCE' },
    { name: 'Battle Smith', edition: '2014', book: 'TCE' },
  ],
  Barbarian: [
    { name: 'Path of the Berserker', edition: '2024', book: 'PHB 2024' },
    { name: 'Path of the Wild Heart', edition: '2024', book: 'PHB 2024' },
    { name: 'Path of the World Tree', edition: '2024', book: 'PHB 2024' },
    { name: 'Path of the Zealot', edition: '2024', book: 'PHB 2024' },
    { name: 'Path of the Totem Warrior', edition: '2014', book: 'PHB 2014' },
    { name: 'Path of the Ancestral Guardian', edition: '2014', book: 'XGE' },
    { name: 'Path of the Storm Herald', edition: '2014', book: 'XGE' },
    { name: 'Path of the Beast', edition: '2014', book: 'TCE' },
    { name: 'Path of Wild Magic', edition: '2014', book: 'TCE' },
  ],
  Bard: [
    { name: 'College of Dance', edition: '2024', book: 'PHB 2024' },
    { name: 'College of Glamour', edition: '2024', book: 'PHB 2024' },
    { name: 'College of Lore', edition: '2024', book: 'PHB 2024' },
    { name: 'College of Valor', edition: '2024', book: 'PHB 2024' },
    { name: 'College of Swords', edition: '2014', book: 'XGE' },
    { name: 'College of Whispers', edition: '2014', book: 'XGE' },
    { name: 'College of Creation', edition: '2014', book: 'TCE' },
    { name: 'College of Eloquence', edition: '2014', book: 'TCE' },
  ],
  Cleric: [
    { name: 'Life Domain', edition: '2024', book: 'PHB 2024' },
    { name: 'Light Domain', edition: '2024', book: 'PHB 2024' },
    { name: 'Trickery Domain', edition: '2024', book: 'PHB 2024' },
    { name: 'War Domain', edition: '2024', book: 'PHB 2024' },
    { name: 'Knowledge Domain', edition: '2014', book: 'PHB 2014' },
    { name: 'Nature Domain', edition: '2014', book: 'PHB 2014' },
    { name: 'Tempest Domain', edition: '2014', book: 'PHB 2014' },
    { name: 'Death Domain', edition: '2014', book: 'PHB 2014' },
    { name: 'Forge Domain', edition: '2014', book: 'XGE' },
    { name: 'Grave Domain', edition: '2014', book: 'XGE' },
    { name: 'Order Domain', edition: '2014', book: 'TCE' },
    { name: 'Peace Domain', edition: '2014', book: 'TCE' },
    { name: 'Twilight Domain', edition: '2014', book: 'TCE' },
  ],
  Druid: [
    { name: 'Circle of the Land', edition: '2024', book: 'PHB 2024' },
    { name: 'Circle of the Moon', edition: '2024', book: 'PHB 2024' },
    { name: 'Circle of the Sea', edition: '2024', book: 'PHB 2024' },
    { name: 'Circle of the Stars', edition: '2024', book: 'PHB 2024' },
    { name: 'Circle of Dreams', edition: '2014', book: 'XGE' },
    { name: 'Circle of the Shepherd', edition: '2014', book: 'XGE' },
    { name: 'Circle of Spores', edition: '2014', book: 'TCE' },
    { name: 'Circle of Wildfire', edition: '2014', book: 'TCE' },
  ],
  Fighter: [
    { name: 'Battle Master', edition: '2024', book: 'PHB 2024' },
    { name: 'Champion', edition: '2024', book: 'PHB 2024' },
    { name: 'Eldritch Knight', edition: '2024', book: 'PHB 2024' },
    { name: 'Psi Warrior', edition: '2024', book: 'PHB 2024' },
    { name: 'Purple Dragon Knight', edition: '2014', book: 'PHB 2014' },
    { name: 'Arcane Archer', edition: '2014', book: 'XGE' },
    { name: 'Cavalier', edition: '2014', book: 'XGE' },
    { name: 'Samurai', edition: '2014', book: 'XGE' },
    { name: 'Rune Knight', edition: '2014', book: 'TCE' },
  ],
  Monk: [
    { name: 'Warrior of Mercy', edition: '2024', book: 'PHB 2024' },
    { name: 'Warrior of Shadow', edition: '2024', book: 'PHB 2024' },
    { name: 'Warrior of the Elements', edition: '2024', book: 'PHB 2024' },
    { name: 'Warrior of the Open Hand', edition: '2024', book: 'PHB 2024' },
    { name: 'Way of the Open Hand', edition: '2014', book: 'PHB 2014' },
    { name: 'Way of Shadow', edition: '2014', book: 'PHB 2014' },
    { name: 'Way of the Four Elements', edition: '2014', book: 'PHB 2014' },
    { name: 'Way of the Drunken Master', edition: '2014', book: 'XGE' },
    { name: 'Way of the Kensei', edition: '2014', book: 'XGE' },
    { name: 'Way of the Sun Soul', edition: '2014', book: 'XGE' },
    { name: 'Way of Mercy', edition: '2014', book: 'TCE' },
    { name: 'Way of the Astral Self', edition: '2014', book: 'TCE' },
  ],
  Paladin: [
    { name: 'Oath of Devotion', edition: '2024', book: 'PHB 2024' },
    { name: 'Oath of Glory', edition: '2024', book: 'PHB 2024' },
    { name: 'Oath of the Ancients', edition: '2024', book: 'PHB 2024' },
    { name: 'Oath of Vengeance', edition: '2024', book: 'PHB 2024' },
    { name: 'Oathbreaker', edition: '2014', book: 'PHB 2014' },
    { name: 'Oath of Conquest', edition: '2014', book: 'XGE' },
    { name: 'Oath of Redemption', edition: '2014', book: 'XGE' },
    { name: 'Oath of the Watchers', edition: '2014', book: 'TCE' },
  ],
  Ranger: [
    { name: 'Beast Master', edition: '2024', book: 'PHB 2024' },
    { name: 'Fey Wanderer', edition: '2024', book: 'PHB 2024' },
    { name: 'Gloom Stalker', edition: '2024', book: 'PHB 2024' },
    { name: 'Hunter', edition: '2024', book: 'PHB 2024' },
    { name: 'Horizon Walker', edition: '2014', book: 'XGE' },
    { name: 'Monster Slayer', edition: '2014', book: 'XGE' },
    { name: 'Swarmkeeper', edition: '2014', book: 'TCE' },
  ],
  Rogue: [
    { name: 'Arcane Trickster', edition: '2024', book: 'PHB 2024' },
    { name: 'Assassin', edition: '2024', book: 'PHB 2024' },
    { name: 'Soulknife', edition: '2024', book: 'PHB 2024' },
    { name: 'Thief', edition: '2024', book: 'PHB 2024' },
    { name: 'Inquisitive', edition: '2014', book: 'XGE' },
    { name: 'Mastermind', edition: '2014', book: 'XGE' },
    { name: 'Scout', edition: '2014', book: 'XGE' },
    { name: 'Swashbuckler', edition: '2014', book: 'XGE' },
    { name: 'Phantom', edition: '2014', book: 'TCE' },
  ],
  Sorcerer: [
    { name: 'Aberrant Sorcery', edition: '2024', book: 'PHB 2024' },
    { name: 'Clockwork Sorcery', edition: '2024', book: 'PHB 2024' },
    { name: 'Draconic Sorcery', edition: '2024', book: 'PHB 2024' },
    { name: 'Wild Magic Sorcery', edition: '2024', book: 'PHB 2024' },
    { name: 'Draconic Bloodline', edition: '2014', book: 'PHB 2014' },
    { name: 'Divine Soul', edition: '2014', book: 'XGE' },
    { name: 'Shadow Magic', edition: '2014', book: 'XGE' },
    { name: 'Storm Sorcery', edition: '2014', book: 'XGE' },
    { name: 'Aberrant Mind', edition: '2014', book: 'TCE' },
    { name: 'Clockwork Soul', edition: '2014', book: 'TCE' },
  ],
  Warlock: [
    { name: 'Archfey Patron', edition: '2024', book: 'PHB 2024' },
    { name: 'Celestial Patron', edition: '2024', book: 'PHB 2024' },
    { name: 'Fiend Patron', edition: '2024', book: 'PHB 2024' },
    { name: 'Great Old One Patron', edition: '2024', book: 'PHB 2024' },
    { name: 'The Celestial', edition: '2014', book: 'XGE' },
    { name: 'The Hexblade', edition: '2014', book: 'XGE' },
    { name: 'The Fathomless', edition: '2014', book: 'TCE' },
    { name: 'The Genie', edition: '2014', book: 'TCE' },
  ],
  Wizard: [
    { name: 'Abjurer', edition: '2024', book: 'PHB 2024' },
    { name: 'Diviner', edition: '2024', book: 'PHB 2024' },
    { name: 'Evoker', edition: '2024', book: 'PHB 2024' },
    { name: 'Illusionist', edition: '2024', book: 'PHB 2024' },
    { name: 'School of Enchantment', edition: '2014', book: 'PHB 2014' },
    { name: 'School of Necromancy', edition: '2014', book: 'PHB 2014' },
    { name: 'School of Transmutation', edition: '2014', book: 'PHB 2014' },
    { name: 'War Magic', edition: '2014', book: 'XGE' },
    { name: 'Bladesinging', edition: '2014', book: 'TCE' },
    { name: 'Order of Scribes', edition: '2014', book: 'TCE' },
  ],
};

/** Official subclass options for one class, or [] for an unknown/homebrew class. */
export function officialSubclassesFor(className) {
  return OFFICIAL_SUBCLASSES[className] ?? [];
}
