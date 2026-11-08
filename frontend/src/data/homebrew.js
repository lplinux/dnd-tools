/**
 * data/homebrew.js
 *
 * Homebrew entries as the rest of the app reads them. Pure: no fetching.
 *
 * A homebrew spell is stored in the shape data/spellDetails.js gives an SRD
 * spell, so `spellFromHomebrew` only has to add the name and split the text
 * into paragraphs — and SpellCard renders either without knowing which.
 */

export const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];

/** Mirrors HB_STATUSES in app.js. In the order an entry moves through them. */
export const STATUSES = [
  { id: 'draft',    label: 'Draft',    hint: 'Being written. Not ready for the table.' },
  { id: 'playtest', label: 'Playtest', hint: 'In use, still being balanced.' },
  { id: 'final',    label: 'Final',    hint: 'Settled.' },
];

/**
 * The tabs of the module. `ready: false` is listed so the page can say what
 * is coming rather than pretending it is complete.
 *
 * Items are not homebrew_entries: they are the Item Cards library, which was
 * per-user long before this module, shown here as a tab (`embedded`).
 */
export const KINDS = [
  { id: 'spell',    label: '✨ Spells',    ready: true, noun: 'spell' },
  { id: 'creature', label: '🐉 Creatures', ready: true, noun: 'creature' },
  { id: 'item',     label: '🗡️ Items',     ready: true, embedded: true },
  { id: 'feat',     label: '🎖 Feats',     ready: false },
];

/** "CR 3 · Monstrosity · Neutral evil" — a creature's stat block in one line. */
export function creatureLine(stats) {
  const s = stats ?? {};
  return [s.cr ? `CR ${s.cr}` : null, s.race, s.alignment].filter(Boolean).join(' · ');
}

export const blankSpell = () => ({
  level: 1, school: '', castingTime: 'Action', range: '', components: ['V', 'S'],
  material: '', duration: 'Instantaneous', concentration: false, ritual: false,
  description: '', higherLevel: '', classes: [],
});

/** An entry's spell in SpellCard's shape. */
export function spellFromHomebrew(entry) {
  const d = { ...blankSpell(), ...(entry?.data ?? {}) };
  return {
    ...d,
    name: entry?.name ?? '',
    paragraphs: String(d.description ?? '').split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean),
  };
}

/** An SRD spell (spellFromSrd's shape) as an editable homebrew body. */
export function spellToHomebrew(s) {
  return {
    level: s.level, school: s.school, castingTime: s.castingTime, range: s.range,
    components: [...s.components], material: s.material, duration: s.duration,
    concentration: s.concentration, ritual: s.ritual,
    description: s.paragraphs.join('\n\n'), higherLevel: s.higherLevel, classes: [...s.classes],
  };
}
