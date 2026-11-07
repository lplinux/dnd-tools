/**
 * data/spellDetails.js
 *
 * A 2024 SRD spell record (dnd5eapi.co /api/2024/spells/:slug) turned into the
 * fields a sheet shows, worded the way the 2024 Player's Handbook words them.
 *
 * Pure: no fetching, no React. The sheet's spell list and the spell card both
 * read through here, so the two cannot describe the same spell differently.
 */

const ORDINAL = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/** `null` for a missing or non-spell body, so callers can treat "no data" once. */
export function spellFromSrd(body) {
  if (!body || typeof body !== 'object' || body.level == null) return null;
  const raw = body.description ?? body.desc ?? '';
  const paragraphs = (Array.isArray(raw) ? raw : String(raw).split(/\n+/))
    .map((p) => String(p).trim()).filter(Boolean);
  const higher = Array.isArray(body.higher_level) ? body.higher_level.join(' ') : body.higher_level;
  const duration = String(body.duration ?? '').trim();
  // Nine records (Guidance, Divine Smite, Sorcerous Burst…) carry an empty
  // `components` and the components at the END OF THE RANGE instead:
  // "Touch Component: V, S". Read back out of the field they landed in.
  let range = String(body.range ?? '').trim();
  let components = Array.isArray(body.components) ? body.components : [];
  const misfiled = range.match(/^(.*?)\s*Components?:\s*([VSM](?:\s*,\s*[VSM])*)\s*$/i);
  if (misfiled) {
    range = misfiled[1].trim();
    if (!components.length) components = misfiled[2].split(/\s*,\s*/).map((c) => c.toUpperCase());
  }
  return {
    name: body.name ?? '',
    level: Number(body.level) || 0,
    school: body.school?.name ?? '',
    castingTime: String(body.casting_time ?? '').trim(),
    range,
    components,
    material: body.material ? String(body.material).trim() : '',
    duration,
    // The flag OR the duration's own words. Protection from Evil and Good
    // reads "Concentration up to 10 minutes" with `concentration: false` —
    // the record contradicts itself, and the duration is the book's text.
    concentration: body.concentration === true || /^concentration\b/i.test(duration),
    ritual: body.ritual === true,
    paragraphs,
    higherLevel: higher ? String(higher).trim() : '',
    classes: (body.classes ?? []).map((c) => c?.name).filter(Boolean),
  };
}

/** "Level 3 Evocation (Sorcerer, Wizard)" / "Evocation Cantrip (Wizard)". */
export function levelLine(s) {
  const who = s.classes.length ? ` (${s.classes.join(', ')})` : '';
  return s.level === 0
    ? `${s.school} Cantrip${who}`.trim()
    : `Level ${s.level} ${s.school}${who}`;
}

/** The short form for a table column: "3rd", "Cantrip". */
export const levelShort = (level) => ORDINAL[level] ?? String(level);

/**
 * Casting time for the sheet's list: the reaction's trigger is dropped — it
 * is a sentence, and it belongs on the card — and so is "or Ritual", which
 * the list shows as a tag beside the name.
 */
export function castingTimeShort(s) {
  return s.castingTime.split(',')[0].trim();
}

/** The full casting time, trigger included, for the card. */
export function castingTimeFull(s) {
  return s.ritual ? `${s.castingTime} or Ritual` : s.castingTime;
}

/** "Concentration, up to 1 minute" — the book's phrasing, from a flag and a string. */
export function durationText(s) {
  if (!s.concentration) return s.duration;
  // "up to 1 minute" and "Concentration up to 10 minutes" both come out as
  // "Concentration, up to …", which is how every one is printed in the book.
  return `Concentration, ${s.duration.replace(/^concentration,?\s*/i, '')}`;
}

/**
 * Duration for the sheet's list: without "Concentration,", which the list
 * shows as a tag beside the name. "Up to 1 minute", "Instantaneous".
 */
export function durationShort(s) {
  const d = s.duration.replace(/^concentration,?\s*/i, '');
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/** "V, S, M (a ball of bat guano and sulfur)". */
export function componentsText(s) {
  // A record with none, after the misfiled ones are read back, is a gap in
  // the source — shown as one rather than filled in from memory.
  if (!s.components.length) return '—';
  const list = s.components.join(', ');
  return s.material && s.components.includes('M') ? `${list} (${s.material})` : list;
}

/**
 * Whether the material is one a focus cannot replace — the 2024 sheet's "M"
 * column. That is a component with a stated cost, or one the spell consumes.
 */
export function needsMaterial(s) {
  // "worth 25+ GP" and, in one record, "worth 25+, GP".
  return !!s.material && /\d[\d,]*\+?,?\s*GP|consume/i.test(s.material);
}

/**
 * The cost a material carries, short enough for a tag: "10+ GP", "25+ GP",
 * or "consumed" when the spell uses it up without naming a price. `null`
 * when a focus would do.
 */
export function materialCost(s) {
  if (!needsMaterial(s)) return null;
  const gp = s.material.match(/(\d[\d,]*\+?),?\s*GP/i);
  return gp ? `${gp[1].replace(/,$/, '')} GP` : 'consumed';
}

/** Sort a spell list the way a sheet reads: by level, then by name. */
export function byLevelThenName(a, b) {
  return (a.level - b.level) || a.name.localeCompare(b.name);
}
