/**
 * data/statBlock.js
 *
 * A saved stat block (the blob validateStats cleans — an NPC's sheet, a
 * homebrew creature, a character's stats) turned into what a READER needs:
 * modifiers, the saves and skills that differ from the plain modifier, spell
 * DC and slots, and the text sections split into named entries.
 *
 * Pure, and the same arithmetic the editable sheet uses (useNpcSheet's
 * `derived`): proficiency comes from Level, not CR. If the two ever disagree,
 * the card and the sheet would show a creature different numbers, so both
 * read from data/dnd.js.
 */

import {
  ABILITY_IDS, SKILLS, abilityMod, profBonus, fmtMod, getSlotArray,
} from './dnd';

const TAG_LABELS = {
  resist: 'Damage Resistances', immune: 'Damage Immunities', vuln: 'Damage Vulnerabilities',
  condimmune: 'Condition Immunities',
};

/**
 * One text box as entries: "Name. Text" becomes { name, text }; a line that
 * starts with spaces continues the entry above as its own paragraph; anything
 * else is plain text. Written the way the sheet's own boxes are filled in,
 * so a stat block typed by hand and one imported read the same.
 */
export function entriesOf(text) {
  const out = [];
  for (const raw of String(text ?? '').split('\n')) {
    if (!raw.trim()) continue;
    if (/^\s{2,}/.test(raw) && out.length) {
      out.push({ name: null, text: raw.trim(), sub: true });
      continue;
    }
    // A name is short, starts with a capital, and ends at the first ". " —
    // allowing one bracket ("Whirlpool (1/Day).", "Water Jet (Costs 1).").
    const m = raw.trim().match(/^([A-Z][^.()]{0,48}(?:\([^)]{0,30}\))?)\.\s+(.+)$/);
    out.push(m ? { name: m[1].trim(), text: m[2] } : { name: null, text: raw.trim() });
  }
  return out;
}

/** Everything the card shows, derived once. */
export function statBlockView(stats) {
  const s = stats ?? {};
  const level = Math.min(20, Math.max(1, parseInt(s.level, 10) || 1));
  const prof = profBonus(level);
  const abilities = ABILITY_IDS.map((id) => {
    const a = s.abilities?.[id] ?? {};
    const score = Number.isFinite(a.score) ? a.score : 10;
    const mod = abilityMod(score);
    return { id, score, mod, save: a.st_prof ? mod + prof : null };
  });
  const modOf = Object.fromEntries(abilities.map((a) => [a.id, a.mod]));

  const saves = abilities.filter((a) => a.save !== null)
    .map((a) => `${a.id[0].toUpperCase()}${a.id.slice(1)} ${fmtMod(a.save)}`);
  const skills = SKILLS
    .filter(([name]) => (s.skill_profs?.[name] ?? 0) > 0)
    .map(([name, ab]) => `${name} ${fmtMod(modOf[ab] + prof * s.skill_profs[name])}`);

  const tags = Object.entries(TAG_LABELS)
    .map(([k, label]) => ({ label, value: (s.tags?.[k] ?? []).join(', ') }))
    .filter((t) => t.value);

  const caster = s.caster_type && s.caster_type !== 'none';
  const spellMod = caster && s.spell_ability ? modOf[s.spell_ability] : null;
  const slots = caster ? getSlotArray(s.caster_type, level) : [];
  const spells = caster
    ? Array.from({ length: 10 }, (_, lv) => ({
      level: lv,
      slots: lv === 0 ? null : (slots[lv] ?? 0),
      names: String(s.spell_names?.[lv] ?? '').split(',').map((n) => n.trim()).filter(Boolean),
    })).filter((r) => r.names.length)
    : [];

  return {
    name: s.char_name || '',
    kindLine: [s.race, s.char_class && [s.char_class, s.subclass].filter(Boolean).join(' — '), s.alignment]
      .filter(Boolean).join(' · '),
    cr: s.cr || '',
    level,
    prof,
    ac: s.ac || '—',
    hp: s.max_hp || s.hp || '—',
    speed: s.speed || '—',
    abilities,
    saves,
    skills,
    tags,
    senses: s.senses || '',
    langs: s.langs || '',
    spellDc: spellMod !== null ? 8 + prof + spellMod : null,
    spellAtk: spellMod !== null ? prof + spellMod : null,
    spellAbility: s.spell_ability || '',
    spells,
    sections: [
      ['Traits', s.spec_traits],
      ['Actions', s.actions],
      ['Bonus Actions & Reactions', s.bonus_actions],
      ['Legendary Actions', s.leg_actions],
      ['Lair Actions', s.lair_actions],
      ['Mythic / Special', s.special_abilities],
      ['Features', s.features],
    ].map(([title, text]) => ({ title, entries: entriesOf(text) })).filter((x) => x.entries.length),
    personality: s.personality || '',
    equipment: s.equipment || '',
    dmNotes: s.dm_notes || '',
  };
}
