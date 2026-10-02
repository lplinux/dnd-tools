/**
 * src/data/srdMap.js
 *
 * Pure translation from 2024 SRD API payloads into the shapes the NPC sheet
 * stores. Kept out of components so it can be reasoned about (and tested)
 * without a DOM: every function here takes a parsed API body and returns plain
 * data, with no fetching and no side effects.
 *
 * The API shapes are considerably more structured than the sheet, which stores
 * most of this as human-edited prose — so this module is mostly a flattener.
 */

import { CONDITIONS, DAMAGE_TYPES, SKILLS } from '@/data/dnd';

/** "chaotic neutral" -> "Chaotic Neutral". */
const titleCase = (s) => String(s ?? '').replace(/\b\w/g, (c) => c.toUpperCase());

/** `0.25` -> `"1/4"`. CR below 1 is conventionally written as a fraction. */
export function fmtCr(cr) {
  if (cr == null) return '';
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

/** `[{value:15, armor:[…]}]` -> `"15"`. Extra entries are alternate forms. */
export function fmtAc(ac) {
  if (Array.isArray(ac)) return ac[0]?.value != null ? String(ac[0].value) : '';
  return ac != null ? String(ac) : '';
}

/** `{walk:"30 ft.", fly:"60 ft."}` -> `"30 ft., fly 60 ft."` (walk is implicit). */
export function fmtSpeed(speed) {
  if (!speed || typeof speed !== 'object') return String(speed ?? '');
  return Object.entries(speed)
    .map(([mode, v]) => (mode === 'walk' ? String(v) : `${mode} ${v}`))
    .join(', ');
}

/**
 * `{darkvision:"60 ft.", passive_perception:9}` -> `"Darkvision 60 ft."`
 * passive_perception is dropped: the sheet derives it from WIS + proficiency,
 * so copying the monster's value in would fight the calculated field.
 */
export function fmtSenses(senses) {
  if (!senses || typeof senses !== 'object') return String(senses ?? '');
  return Object.entries(senses)
    .filter(([k]) => k !== 'passive_perception')
    .map(([k, v]) => `${k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} ${v}`)
    .join(', ');
}

/** `10` + `"3d6"` -> `"10 (3d6)"`, the usual stat-block notation. */
export function fmtHp(hp, dice) {
  if (hp == null) return '';
  return dice ? `${hp} (${dice})` : String(hp);
}

/** `[{name, desc}]` -> `"Name. desc"` blocks, one per blank-line-separated entry. */
export function fmtBlocks(list) {
  if (!Array.isArray(list) || !list.length) return '';
  return list
    .map((a) => [a.name, a.desc ?? a.description].filter(Boolean).join('. '))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Match an SRD name against one of our static lists, so imported values land on
 * the exact strings the tag pickers already offer (and so the ⓘ still resolves).
 * Falls back to the API's own wording when there's no match rather than dropping
 * it — a lossy import is worse than an unfamiliar label.
 */
function canonical(name, list) {
  const n = String(name ?? '').trim();
  if (!n) return null;
  return list.find((o) => o.toLowerCase() === n.toLowerCase()) ?? n;
}

const toNameList = (arr, list) =>
  (Array.isArray(arr) ? arr : [])
    .map((x) => canonical(typeof x === 'string' ? x : x?.name ?? x?.index, list))
    .filter(Boolean);

/**
 * Monster proficiencies arrive as `{value, proficiency:{index:"skill-stealth"}}`.
 * Split them into the sheet's two separate concepts: skill proficiencies (keyed
 * by skill name) and saving-throw flags (keyed by ability id).
 *
 * `value` is the total bonus, not a tier, and recovering "proficient vs expert"
 * from it needs the ability modifier and proficiency bonus we haven't applied
 * yet — so everything imports as plain proficient (1) and can be bumped by hand.
 */
export function splitProficiencies(profs) {
  const skillProfs = {};
  const stProf = {};
  for (const p of Array.isArray(profs) ? profs : []) {
    const idx = p?.proficiency?.index ?? '';
    if (idx.startsWith('skill-')) {
      const slug = idx.slice('skill-'.length);
      const match = SKILLS.find(([n]) => n.toLowerCase().replace(/\s+/g, '-') === slug);
      if (match) skillProfs[match[0]] = 1;
    } else if (idx.startsWith('saving-throw-')) {
      stProf[idx.slice('saving-throw-'.length)] = true;
    }
  }
  return { skillProfs, stProf };
}

/**
 * A monster body -> the subset of NPC-sheet state it can populate.
 *
 * Returns `{ fields, abilities, tags, skillProfs }` rather than a whole sheet:
 * the caller merges these over current state, so anything the SRD has nothing to
 * say about (personality, DM notes, spell lists) is left untouched.
 */
export function monsterToSheet(m) {
  if (!m) return null;

  const { skillProfs, stProf } = splitProficiencies(m.proficiencies);

  const abilities = {};
  for (const [id, key] of [
    ['str', 'strength'], ['dex', 'dexterity'], ['con', 'constitution'],
    ['int', 'intelligence'], ['wis', 'wisdom'], ['cha', 'charisma'],
  ]) {
    if (m[key] != null) abilities[id] = { score: m[key], stProf: !!stProf[id] };
  }

  return {
    fields: {
      charName: m.name ?? '',
      // `type` comes back lowercase ("fey"), `size` capitalised ("Small").
      race: [m.size, titleCase(m.type)].filter(Boolean).join(' '),
      alignment: titleCase(m.alignment),
      cr: fmtCr(m.challenge_rating),
      hp: fmtHp(m.hit_points, m.hit_dice),
      ac: fmtAc(m.armor_class),
      speed: fmtSpeed(m.speed),
      senses: fmtSenses(m.senses),
      langs: m.languages ?? '',
      specTraits: fmtBlocks(m.special_abilities),
      actions: fmtBlocks(m.actions),
      // The sheet pairs these in one box labelled "Bonus Actions & Reactions".
      bonusActions: [fmtBlocks(m.bonus_actions), fmtBlocks(m.reactions)]
        .filter(Boolean).join('\n\n'),
      legActions: fmtBlocks(m.legendary_actions),
      equipment: toNameList(m.gear, []).join(', '),
    },
    abilities,
    tags: {
      resist: toNameList(m.damage_resistances, DAMAGE_TYPES),
      immune: toNameList(m.damage_immunities, DAMAGE_TYPES),
      vuln: toNameList(m.damage_vulnerabilities, DAMAGE_TYPES),
      condimmune: toNameList(m.condition_immunities, CONDITIONS),
    },
    skillProfs,
  };
}

/**
 * A species body -> the fields it can fill.
 *
 * Trait *descriptions* are a request each, so only names are inserted here; the
 * ⓘ next to the field covers looking one up.
 */
export function speciesToSheet(s) {
  if (!s) return null;
  const traitNames = (s.traits ?? []).map((t) => t.name).filter(Boolean);
  return {
    fields: {
      race: s.name ?? '',
      speed: s.speed != null ? `${s.speed} ft` : '',
      senses: traitNames.find((t) => /darkvision/i.test(t)) ?? '',
      specTraits: traitNames.join(', '),
    },
    subspecies: (s.subspecies ?? []).map((x) => x.name).filter(Boolean),
  };
}

/** `equipment_category.name` -> one of ITEM_TYPES, or '' when nothing fits. */
const ITEM_TYPE_BY_CATEGORY = {
  weapon: 'Weapon', weapons: 'Weapon',
  armor: 'Armor',
  potion: 'Potion', potions: 'Potion',
  ring: 'Accessory', rings: 'Accessory',
  rod: 'Wondrous Item', rods: 'Wondrous Item',
  staff: 'Wondrous Item', staffs: 'Wondrous Item', staves: 'Wondrous Item',
  wand: 'Wondrous Item', wands: 'Wondrous Item',
  scroll: 'Consumable', scrolls: 'Consumable',
  'wondrous item': 'Wondrous Item', 'wondrous items': 'Wondrous Item',
};

/**
 * A magic-item body -> the Item Card form fields it can fill.
 *
 * `desc` arrives as plain text but the card's abilities editor stores HTML, so
 * paragraphs are wrapped. Everything is a suggestion: the caller merges these
 * over the current form and the user edits freely afterwards.
 */
export function magicItemToCard(m) {
  if (!m) return null;

  const rarityName = m.rarity?.name ?? m.rarity ?? '';
  const rarityId = String(rarityName).toLowerCase().replace(/[^a-z]/g, '');

  const category = String(m.equipment_category?.name ?? '').toLowerCase();
  const type = ITEM_TYPE_BY_CATEGORY[category] ?? '';

  const raw = Array.isArray(m.desc) ? m.desc.join('\n\n') : String(m.desc ?? '');
  const paras = raw.split('\n').map((s) => s.trim()).filter(Boolean);

  return {
    name: m.name ?? '',
    type,
    // Only keep a rarity the card actually offers; otherwise leave the current one.
    rarity: ['common', 'uncommon', 'rare', 'veryrare', 'legendary', 'artifact'].includes(rarityId)
      ? rarityId
      : undefined,
    attunement: !!m.attunement,
    abilities: paras.map((p) => `<p>${escapeHtml(p)}</p>`).join(''),
  };
}

/** The abilities editor writes raw HTML, so API text must not be able to inject. */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Subclass features up to a level -> one text block.
 * `/subclasses/<slug>` embeds `features:[{name, level, description}]`, so this
 * needs no further requests.
 */
export function subclassFeaturesText(sc, maxLevel = 20) {
  if (!sc?.features?.length) return '';
  return sc.features
    .filter((f) => (f.level ?? 1) <= maxLevel)
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
    .map((f) => `${f.name} (lvl ${f.level}). ${f.description ?? ''}`.trim())
    .join('\n\n');
}

/**
 * Same, for an Open5e subclass detail (api/open5e.js `getSubclass`), whose
 * features use `desc` and carry a possibly-null `level`.
 * Featureless entries are kept rather than dropped — some third-party subclasses
 * describe themselves only in prose.
 */
export function open5eSubclassFeaturesText(sc, maxLevel = 20) {
  if (!sc) return '';
  const feats = (sc.features ?? [])
    .filter((f) => f.level == null || f.level <= maxLevel)
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
    .map((f) => `${f.name}${f.level ? ` (lvl ${f.level})` : ''}. ${f.desc ?? ''}`.trim());
  return feats.length ? feats.join('\n\n') : String(sc.desc ?? '').trim();
}

/**
 * An Open5e v1 monster -> the same patch shape as `monsterToSheet`.
 *
 * Open5e's v1 rows are flatter than dnd5eapi's: `armor_class` is a plain int,
 * `challenge_rating` already reads "1/4", `senses` and the damage lists are
 * already strings. So most of this is passing values through rather than
 * flattening them — the shapes that do differ are `speed` (ints, not strings)
 * and `skills` (an object, not a proficiency list).
 */
export function open5eMonsterToSheet(m) {
  if (!m) return null;

  const skillProfs = {};
  for (const [slug] of Object.entries(m.skills ?? {})) {
    const match = SKILLS.find(([n]) => n.toLowerCase().replace(/\s+/g, '_') === slug
      || n.toLowerCase().replace(/\s+/g, '-') === slug
      || n.toLowerCase() === slug);
    if (match) skillProfs[match[0]] = 1;
  }

  const abilities = {};
  for (const [id, key] of [
    ['str', 'strength'], ['dex', 'dexterity'], ['con', 'constitution'],
    ['int', 'intelligence'], ['wis', 'wisdom'], ['cha', 'charisma'],
  ]) {
    if (m[key] != null) {
      abilities[id] = { score: m[key], stProf: m[`${key}_save`] != null };
    }
  }

  // Open5e speeds are numbers ({walk: 30}); the sheet wants "30 ft.".
  const speed = m.speed && typeof m.speed === 'object'
    ? Object.entries(m.speed)
      .map(([mode, v]) => (mode === 'walk' ? `${v} ft.` : `${mode} ${v} ft.`))
      .join(', ')
    : String(m.speed ?? '');

  const splitList = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

  return {
    fields: {
      charName: m.name ?? '',
      race: [m.size, titleCase(m.type)].filter(Boolean).join(' '),
      alignment: titleCase(m.alignment),
      cr: String(m.challenge_rating ?? ''),
      hp: fmtHp(m.hit_points, m.hit_dice),
      ac: String(m.armor_class ?? ''),
      speed,
      // Already a string, and it includes passive Perception, which the sheet
      // derives itself — strip that clause so the two don't disagree. Title-cased
      // to match the SRD path, which builds this from structured keys.
      senses: titleCase(
        String(m.senses ?? '').replace(/,?\s*passive Perception \d+/i, '').trim(),
      ),
      langs: m.languages ?? '',
      specTraits: fmtBlocks(m.special_abilities),
      actions: fmtBlocks(m.actions),
      bonusActions: [fmtBlocks(m.bonus_actions), fmtBlocks(m.reactions)].filter(Boolean).join('\n\n'),
      legActions: fmtBlocks(m.legendary_actions),
    },
    abilities,
    tags: {
      resist: splitList(m.damage_resistances).map((x) => canonical(x, DAMAGE_TYPES)),
      immune: splitList(m.damage_immunities).map((x) => canonical(x, DAMAGE_TYPES)),
      vuln: splitList(m.damage_vulnerabilities).map((x) => canonical(x, DAMAGE_TYPES)),
      condimmune: splitList(m.condition_immunities).map((x) => canonical(x, CONDITIONS)),
    },
    skillProfs,
  };
}
