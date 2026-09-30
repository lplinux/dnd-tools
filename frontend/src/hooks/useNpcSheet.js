/**
 * hooks/useNpcSheet.js
 *
 * All state and derived values for the NPC sheet.
 * Keeps the page component clean — it just reads values and calls setters.
 *
 * Returned shape:
 *   fields      — plain text/number fields (name, class, hp, etc.)
 *   setField    — update one field by key
 *   abilities   — { str: { score, stProf }, dex: … }
 *   setAbility  — update score or stProf for one ability
 *   skillProfs  — { [skillName]: 0 | 1 | 2 }
 *   cycleSkill  — toggle 0→1→2→0 for a skill
 *   tags        — { resist, immune, vuln, condimmune, damagetype }
 *   addTag      — (key, value) => void
 *   removeTag   — (key, value) => void
 *   spellNames  — { [level: 0-9]: string }   level 0 is cantrips; comma-separated
 *   setSpellName — (level, value) => void
 *   usedSlots   — { [level: 1-9]: Set<number> }   (toggled spell slot boxes)
 *   toggleSlot  — (level, index) => void
 *   legRes      — boolean[5]  (legendary resistances)
 *   toggleLegRes — (index) => void
 *   derived     — computed values (profBonus, modifiers, passPerc, passInvest,
 *                 spellDC, spellAtk)
 *   clearSheet  — reset everything to defaults
 *   collectSheet / populateSheet — serialise/deserialise for print/embed
 *
 * State is camelCase; the serialised form is the snake_case schema in
 * docs/pc-sheet/README.md. collectSheet maps between them explicitly.
 * populateSheet accepts either spelling so older stored sheets still load.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  ABILITY_IDS, SKILLS,
  abilityMod, profBonus, fmtMod,
  FULL_CASTERS, HALF_CASTERS, WARLOCKS,
} from '@/data/dnd';

// ── Default state factories ──────────────────────────────────────────────────

function defaultAbilities() {
  return Object.fromEntries(ABILITY_IDS.map(id => [id, { score: 10, stProf: false }]));
}

function defaultSkillProfs() {
  return Object.fromEntries(SKILLS.map(([name]) => [name, 0]));
}

function defaultTags() {
  return { resist: [], immune: [], vuln: [], condimmune: [], damagetype: [] };
}

function defaultFields() {
  return {
    charName: '', charClass: '', subclass: '', race: '', sex: '', alignment: '',
    level: '1', cr: '',
    // senses and langs start blank on purpose: pre-filling them with
    // "Darkvision" / "Common" put traits on every sheet that most characters
    // don't have, and a wrong default is worse than an empty field — it reads
    // as deliberate and survives until someone notices.
    hp: '', ac: '', speed: '30 ft', senses: '', langs: '',
    casterType: 'none', spellAbility: '', slotReset: 'Long Rest',
    personality: '', specTraits: '', features: '', equipment: '',
    actions: '', bonusActions: '', legActions: '', lairActions: '',
    specialAbilities: '', dmNotes: '',
  };
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useNpcSheet() {
  const [fields,     setFieldsState]  = useState(defaultFields);
  const [abilities,  setAbilities]    = useState(defaultAbilities);
  const [skillProfs, setSkillProfs]   = useState(defaultSkillProfs);
  const [tags,       setTags]         = useState(defaultTags);
  const [spellNames, setSpellNames]   = useState({});
  const [usedSlots,  setUsedSlots]    = useState({});    // { [level]: Set<index> }
  const [legRes,     setLegRes]       = useState([false, false, false, false, false]);

  // ── Field setter ──────────────────────────────────────────────────────────
  const setField = useCallback((key, value) => {
    setFieldsState(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Ability setter ────────────────────────────────────────────────────────
  const setAbility = useCallback((id, key, value) => {
    setAbilities(prev => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }, []);

  // ── Skill cycle: 0 → 1 → 2 → 0 ──────────────────────────────────────────
  const cycleSkill = useCallback((name) => {
    setSkillProfs(prev => ({ ...prev, [name]: (prev[name] + 1) % 3 }));
  }, []);

  // ── Tag management ────────────────────────────────────────────────────────
  const addTag = useCallback((key, value) => {
    setTags(prev => {
      if (prev[key].includes(value)) return prev;
      return { ...prev, [key]: [...prev[key], value] };
    });
  }, []);

  const removeTag = useCallback((key, value) => {
    setTags(prev => ({ ...prev, [key]: prev[key].filter(t => t !== value) }));
  }, []);

  // ── Spell names ───────────────────────────────────────────────────────────
  const setSpellName = useCallback((level, value) => {
    setSpellNames(prev => ({ ...prev, [level]: value }));
  }, []);

  // ── Slot toggling (used/unused checkboxes) ────────────────────────────────
  const toggleSlot = useCallback((level, index) => {
    setUsedSlots(prev => {
      const set = new Set(prev[level] ?? []);
      if (set.has(index)) set.delete(index); else set.add(index);
      return { ...prev, [level]: set };
    });
  }, []);

  // ── Legendary resistances ─────────────────────────────────────────────────
  const toggleLegRes = useCallback((index) => {
    setLegRes(prev => prev.map((v, i) => i === index ? !v : v));
  }, []);

  // ── Derived values (memoised) ──────────────────────────────────────────────
  const derived = useMemo(() => {
    const level = Math.min(20, Math.max(1, parseInt(fields.level) || 1));
    const prof  = profBonus(level);

    const mods = Object.fromEntries(
      ABILITY_IDS.map(id => [id, abilityMod(abilities[id].score)])
    );

    const skillValues = Object.fromEntries(
      SKILLS.map(([name, ab]) => {
        const p = skillProfs[name] ?? 0;
        const bonus = p === 0 ? mods[ab] : p === 1 ? mods[ab] + prof : mods[ab] + prof * 2;
        return [name, bonus];
      })
    );

    const savingThrows = Object.fromEntries(
      ABILITY_IDS.map(id => {
        const bonus = abilities[id].stProf ? mods[id] + prof : mods[id];
        return [id, bonus];
      })
    );

    const passPerc   = 10 + skillValues['Perception'];
    const passInvest = 10 + skillValues['Investigation'];

    const abilityId = fields.spellAbility;
    const spellMod  = abilityId ? mods[abilityId] : null;
    const spellDC   = spellMod !== null ? 8 + prof + spellMod : null;
    const spellAtk  = spellMod !== null ? prof + spellMod : null;

    const isSpellcaster = fields.casterType !== 'none' && fields.casterType !== '';

    // Auto-set caster type hint from class
    const cls = fields.charClass;
    const defaultCasterType =
      FULL_CASTERS.includes(cls)  ? 'full'    :
      WARLOCKS.includes(cls)      ? 'warlock' :
      HALF_CASTERS.includes(cls)  ? 'half'    : 'none';

    return {
      level, prof, mods, skillValues, savingThrows, passPerc, passInvest,
      spellMod, spellDC, spellAtk, isSpellcaster,
      defaultCasterType,
      initiative: fmtMod(mods.dex),
      profBonus:  `+${prof}`,
    };
  }, [fields.level, fields.spellAbility, fields.casterType, fields.charClass, abilities, skillProfs]);

  // ── Serialise ─────────────────────────────────────────────────────────────
  // Emits the snake_case shape documented in docs/pc-sheet/README.md. Internal
  // state is camelCase, so every renamed key is mapped explicitly below — do NOT
  // spread `fields` here. Saving camelCase used to round-trip badly: populateSheet
  // reads `abilities[id].st_prof`, so saving `stProf` silently wiped every saving
  // throw proficiency on the next load.
  const collectSheet = useCallback(() => ({
    char_name:  fields.charName,
    char_class: fields.charClass,
    subclass:   fields.subclass,
    race:       fields.race,
    sex:        fields.sex,
    alignment:  fields.alignment,
    level:      fields.level,
    cr:         fields.cr,
    hp:         fields.hp,
    ac:         fields.ac,
    speed:      fields.speed,
    senses:     fields.senses,
    langs:      fields.langs,
    caster_type:   fields.casterType,
    spell_ability: fields.spellAbility,
    slot_reset:    fields.slotReset,
    personality:       fields.personality,
    spec_traits:       fields.specTraits,
    features:          fields.features,
    equipment:         fields.equipment,
    actions:           fields.actions,
    bonus_actions:     fields.bonusActions,
    leg_actions:       fields.legActions,
    lair_actions:      fields.lairActions,
    special_abilities: fields.specialAbilities,
    dm_notes:          fields.dmNotes,
    abilities: Object.fromEntries(
      ABILITY_IDS.map(id => [id, { score: abilities[id].score, st_prof: !!abilities[id].stProf }])
    ),
    skill_profs: { ...skillProfs },
    tags:        JSON.parse(JSON.stringify(tags)),
    spell_names: { ...spellNames },
    // Sets are not JSON-serialisable — store each level's used slots as an array.
    used_slots: Object.fromEntries(
      Object.entries(usedSlots).map(([lv, set]) => [lv, [...set].sort((a, b) => a - b)])
    ),
    legendary_res: [...legRes],
  }), [fields, abilities, skillProfs, tags, spellNames, usedSlots, legRes]);

  // ── Deserialise ───────────────────────────────────────────────────────────
  const populateSheet = useCallback((d) => {
    if (!d || !Object.keys(d).length) return;

    setFieldsState(prev => ({
      ...prev,
      charName: d.char_name ?? d.charName ?? prev.charName,
      charClass: d.char_class ?? d.charClass ?? prev.charClass,
      subclass: d.subclass ?? prev.subclass,
      race: d.race ?? prev.race,
      sex: d.sex ?? prev.sex,
      alignment: d.alignment ?? prev.alignment,
      level: String(d.level ?? prev.level),
      cr: d.cr ?? prev.cr,
      hp: d.hp ?? prev.hp,
      ac: d.ac ?? prev.ac,
      speed: d.speed ?? prev.speed,
      senses: d.senses ?? prev.senses,
      langs: d.langs ?? prev.langs,
      casterType: d.caster_type ?? d.casterType ?? prev.casterType,
      spellAbility: d.spell_ability ?? d.spellAbility ?? prev.spellAbility,
      slotReset: d.slot_reset ?? d.slotReset ?? prev.slotReset,
      personality: d.personality ?? prev.personality,
      specTraits: d.spec_traits ?? d.specTraits ?? prev.specTraits,
      features: d.features ?? prev.features,
      equipment: d.equipment ?? prev.equipment,
      actions: d.actions ?? prev.actions,
      bonusActions: d.bonus_actions ?? d.bonusActions ?? prev.bonusActions,
      legActions: d.leg_actions ?? d.legActions ?? prev.legActions,
      lairActions: d.lair_actions ?? d.lairActions ?? prev.lairActions,
      specialAbilities: d.special_abilities ?? d.specialAbilities ?? prev.specialAbilities,
      dmNotes: d.dm_notes ?? d.dmNotes ?? prev.dmNotes,
    }));

    if (d.abilities) {
      setAbilities(prev => {
        const next = { ...prev };
        ABILITY_IDS.forEach(id => {
          const a = d.abilities[id];
          // `!!x ?? !!y` never falls through — !!undefined is false, not nullish —
          // so coalesce the raw values first, then coerce.
          if (a) next[id] = { score: a.score ?? 10, stProf: !!(a.st_prof ?? a.stProf) };
        });
        return next;
      });
    }

    if (d.skill_profs ?? d.skillProfs) {
      const sp = d.skill_profs ?? d.skillProfs;
      setSkillProfs(prev => ({ ...prev, ...sp }));
    }

    if (d.tags) setTags({ ...defaultTags(), ...d.tags });
    if (d.spell_names ?? d.spellNames) setSpellNames(d.spell_names ?? d.spellNames ?? {});

    const us = d.used_slots ?? d.usedSlots;
    if (us) {
      setUsedSlots(Object.fromEntries(
        Object.entries(us).map(([lv, arr]) => [lv, new Set(Array.isArray(arr) ? arr : [])])
      ));
    }

    if (Array.isArray(d.legendary_res ?? d.legRes)) {
      const arr = (d.legendary_res ?? d.legRes).slice(0, 5);
      setLegRes([...arr, ...Array(5).fill(false)].slice(0, 5).map(Boolean));
    }
  }, []);

  // ── Clear ─────────────────────────────────────────────────────────────────
  const clearSheet = useCallback(() => {
    setFieldsState(defaultFields());
    setAbilities(defaultAbilities());
    setSkillProfs(defaultSkillProfs());
    setTags(defaultTags());
    setSpellNames({});
    setUsedSlots({});
    setLegRes([false, false, false, false, false]);
  }, []);

  /**
   * Merge an SRD payload (see data/srdMap.js) over the current sheet.
   *
   * A merge, not a replace: only the keys the SRD actually supplied are written,
   * so importing a monster leaves personality, DM notes and spell lists alone.
   * Empty strings are skipped too — an absent `legendary_actions` must not wipe
   * what's already typed there.
   */
  const applySrd = useCallback((patch) => {
    if (!patch) return;
    if (patch.fields) {
      setFieldsState(prev => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(patch.fields)) {
          if (v !== '' && v != null) next[k] = v;
        }
        return next;
      });
    }
    if (patch.abilities) {
      setAbilities(prev => {
        const next = { ...prev };
        for (const [id, val] of Object.entries(patch.abilities)) {
          next[id] = { ...prev[id], ...val };
        }
        return next;
      });
    }
    if (patch.skillProfs) {
      setSkillProfs(prev => ({ ...prev, ...patch.skillProfs }));
    }
    if (patch.tags) {
      setTags(prev => {
        const next = { ...prev };
        for (const [k, list] of Object.entries(patch.tags)) {
          if (list?.length) next[k] = [...new Set([...prev[k], ...list])];
        }
        return next;
      });
    }
  }, []);

  return {
    fields, setField,
    abilities, setAbility,
    skillProfs, cycleSkill,
    tags, addTag, removeTag,
    spellNames, setSpellName,
    usedSlots, toggleSlot,
    legRes, toggleLegRes,
    derived,
    clearSheet,
    applySrd,
    collectSheet,
    populateSheet,
  };
}
