/**
 * pages/NpcSheet/index.jsx
 *
 * NPC / Character Sheet — faithful React port of the original parchment design
 * (master `npc-sheet.html`). No API calls; client-side state via useNpcSheet.
 * Styling lives in ./npc-sheet.css, scoped under `.npc-sheet` and pinned to the
 * parchment palette regardless of the app theme.
 *
 * Features:
 *   - Header banner (fancy name, class/subclass/race/sex/alignment, LEVEL/CR boxes)
 *   - Core stats bar (HP/AC/Speed + derived Prof/Initiative/Pass Perc + senses/langs)
 *   - Ability scores with modifiers + saving-throw proficiency
 *   - Skills with 0/proficient/expert cycling
 *   - Defenses (tag fields), traits, actions, legendary, spellcasting, DM notes
 *   - Print / PDF, Clear, and embedded mode (?embedded=1 postMessage bridge)
 */

import { useEffect, useRef, useState } from 'react';

import AppHeader from '@/components/layout/AppHeader';
import { Button } from '@/components/ui';
import SrdCombobox from '@/components/SrdCombobox';
import SrdInfo, { useSrdIndex } from '@/components/SrdInfo';
import { getClass, getMonster, getSpecies, getSubclass, loadEntries, toSlug } from '@/api/srd';
import {
  loadSubclasses,
  loadMonsters as loadOpen5eMonsters,
  getSubclass as getOpen5eSubclass,
  getMonster as getOpen5eMonster,
} from '@/api/open5e';
import {
  monsterToSheet, speciesToSheet, subclassFeaturesText,
  open5eSubclassFeaturesText, open5eMonsterToSheet,
} from '@/data/srdMap';
import { officialSubclassesFor } from '@/data/officialSubclasses';
import { useNpcSheet }   from '@/hooks/useNpcSheet';
import { useConfirm }    from '@/contexts/ConfirmContext';
import { CLASSES, ALIGNMENTS, DAMAGE_TYPES, CONDITIONS, FULL_CASTERS, HALF_CASTERS, WARLOCKS, SPELL_ABILITY_DEFAULT, fmtMod } from '@/data/dnd';

import AbilityScores from './AbilityScores';
import SkillsBlock   from './SkillsBlock';
import SpellSection  from './SpellSection';
import TagInput      from './TagInput';
import './npc-sheet.css';

const SHEET_SURROUND = '#1a1208'; // dark page behind the parchment sheet (original)

/** Auto-grow textarea: expand as the user types */
function autoGrow(e) {
  const el = e.target;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * The caster type a class determines on its own, or null when it does not.
 * Martial classes return null on purpose — Eldritch Knight and Arcane Trickster
 * are third casters, so the field has to stay editable for them.
 */
function casterTypeForClass(cls) {
  if (FULL_CASTERS.includes(cls)) return 'full';
  if (WARLOCKS.includes(cls)) return 'warlock';
  if (HALF_CASTERS.includes(cls)) return 'half';
  return null;
}

/** A labelled parchment textarea field (.field) */
function FieldArea({ label, cls = 'tall', value, onChange, placeholder, srdResource = null }) {
  const empty = !String(value ?? '').trim();
  return (
    <div className={`field${empty ? ' field-empty' : ''}`}>
      {label && <label>{label}</label>}
      <textarea
        className={cls}
        value={value}
        onChange={onChange}
        onInput={autoGrow}
        placeholder={placeholder}
      />
      {/* Print-only mirror of the same text.
          A <textarea> cannot grow to fit its content on paper: autoGrow writes an
          inline pixel height measured at SCREEN width, which survives into print
          and clips once the text reflows narrower — and `height: auto` is no help
          either, since a textarea then sizes from its `rows`, not its content.
          So print renders the value as flowing text and hides the control. */}
      <div className="field-print">{value}</div>
      {srdResource && <SrdChips resource={srdResource} value={value} />}
    </div>
  );
}

/**
 * Read-only ⓘ chips mirroring the comma-separated names in a textarea.
 *
 * Same trick SpellSection uses: a link cannot live inside a <textarea>, so the
 * parsed names are echoed below it. Purely presentational — the field value is
 * never touched. Only names the SRD actually has get a chip, so a sheet full of
 * homebrew traits shows nothing rather than a row of dead ⓘs.
 */
function SrdChips({ resource, value }) {
  const slugs = useSrdIndex(resource);
  const names = String(value ?? '').split(/[,\n]/).map((n) => n.trim()).filter(Boolean);
  const known = names.filter((n) => slugs && slugs.has(toSlug(n)));
  if (!known.length) return null;
  return (
    <div className="spell-chips">
      {known.map((n, i) => (
        <span className="spell-chip" key={`${n}-${i}`}>
          {n}
          <SrdInfo resource={resource} name={n} />
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function NpcSheet() {
  const confirm = useConfirm();
  const sheet = useNpcSheet();
  const { fields, setField, abilities, setAbility, derived,
          skillProfs, cycleSkill, tags, addTag, removeTag,
          spellNames, setSpellName, usedSlots, toggleSlot,
          legRes, toggleLegRes, clearSheet, applySrd, collectSheet, populateSheet } = sheet;

  // The spell table shows when a caster type is chosen; the caster controls in
  // the header show whenever the class is a spellcaster (mirrors the original).
  const isSpellcaster = fields.casterType !== 'none' && fields.casterType !== '';
  const classIsCaster = [...FULL_CASTERS, ...HALF_CASTERS, ...WARLOCKS, 'Multiclass'].includes(fields.charClass);
  // The caster type a class fixes, or null when it is the user's choice
  // (no class yet, Multiclass, or a martial class that may take a third-caster
  // subclass).
  const casterTypeLocked = casterTypeForClass(fields.charClass) !== null;

  // Legendary & Lair visibility is tri-state: `null` follows the content (hidden
  // on an ordinary PC, shown once it holds anything), and an explicit true/false
  // overrides that. Hiding is always available — a section can be put away even
  // with content in it, which is the whole point of collapsing something. The
  // data is untouched either way; only the rendering changes, and the reveal
  // control says when there is something behind it.
  const [legendaryOpen, setLegendaryOpen] = useState(null);
  // Four pieces of state, legRes being a boolean[5] that is easy to overlook.
  const hasLegendary = !!fields.legActions || !!fields.lairActions
    || !!fields.specialAbilities || legRes.some(Boolean);
  const showLegendary = legendaryOpen ?? hasLegendary;

  function handleClassChange(e) {
    const cls = e.target.value;
    setField('charClass', cls);
    // A class on one of these three lists fixes the caster type outright; the
    // select is disabled to match (see casterTypeLocked below).
    const fixed = casterTypeForClass(cls);
    if (fixed) {
      setField('casterType', fixed);
      // SPELL_ABILITY_DEFAULT was imported but never applied, so picking Wizard
      // left the ability on whatever it was before.
      if (SPELL_ABILITY_DEFAULT[cls]) setField('spellAbility', SPELL_ABILITY_DEFAULT[cls]);
    }
    // Deliberately NOT forcing 'none' for the martial classes. That is what the
    // old code did, and it blocked the two subclasses that need otherwise:
    // an Eldritch Knight Fighter and an Arcane Trickster Rogue are third casters.
    // Monsters also set 'innate' with no class at all.
    // The SRD subclass list is per class, so a stale subclass must not survive.
    if (cls !== fields.charClass) setField('subclass', '');
  }

  // ── SRD (2024 SRD 5.2) assisted entry ─────────────────────────────────────
  // Every control below suggests; none of them restrict. The SRD is a subset of
  // the PHB — an Assassin rogue has no SRD entry — so free text always wins.

  /**
   * Subclass options for the current class, from three sources merged in
   * priority order (SrdCombobox de-dupes by name, keeping the first):
   *
   *   1. the static official PHB list — the only place Assassin & co. exist,
   *   2. the 2024 SRD — one per class, but it carries rules text,
   *   3. Open5e — ~110 more, all 2014-era third-party, badged with their source.
   *
   * Per class, not global: offering all 122 would suggest Champion to a Wizard.
   * Every source is optional — if either API is down its entries simply don't
   * appear, and free text still works.
   */
  const [apiSubclasses, setApiSubclasses] = useState([]);
  useEffect(() => {
    const cls = fields.charClass;
    if (!cls) { setApiSubclasses([]); return undefined; }
    let alive = true;
    Promise.all([getClass(cls), loadSubclasses()]).then(([srdClass, open5e]) => {
      if (!alive) return;
      const srd = (srdClass?.subclasses ?? [])
        .map((s) => ({ name: s.name, edition: '2024' }))
        .filter((s) => s.name);
      const third = (open5e ?? [])
        .filter((s) => s.className === cls)
        .map((s) => ({ name: s.name, key: s.key, edition: s.source.edition, source: s.source }));
      setApiSubclasses([...srd, ...third]);
    });
    return () => { alive = false; };
  }, [fields.charClass]);

  const subclassOptions = [...officialSubclassesFor(fields.charClass), ...apiSubclasses];

  const [subspeciesOpts, setSubspeciesOpts] = useState([]);

  async function handleSpeciesPick(name) {
    const body = await getSpecies(name);
    const patch = speciesToSheet(body);
    if (!patch) return;
    applySrd(patch);
    setSubspeciesOpts(patch.subspecies ?? []);
  }

  /**
   * Lineage folds into `race` ("Elf (Drow)") rather than becoming a new field.
   * `stats_json` keys are mapped by hand in both collectSheet and populateSheet,
   * and a key added to one but not the other silently drops data on save — not a
   * risk worth taking for a label.
   */
  function handleLineagePick(name) {
    const base = (fields.race || '').replace(/\s*\(.*\)\s*$/, '').trim();
    // API names read "Elven Lineage: Drow"; keep only what follows the colon.
    const short = String(name).split(':').pop().trim();
    setField('race', base ? `${base} (${short})` : short);
  }

  /**
   * Insert a subclass's features. Which API to ask depends on where the option
   * came from: an Open5e option carries a `key`, an SRD one doesn't, and an
   * entry from the static official list has neither — it is a name only, so
   * nothing is fetched and the field is simply set.
   */
  async function handleSubclassPick(name, opt) {
    setField('subclass', name);

    const text = opt?.key
      ? open5eSubclassFeaturesText(await getOpen5eSubclass(opt.key), derived.level)
      : subclassFeaturesText(await getSubclass(name), derived.level);

    if (!text) return;
    // Append rather than replace: `features` is also where hand-written notes go.
    setField('features', fields.features ? `${fields.features}\n\n${text}` : text);
  }

  /**
   * `langs` is a single comma-separated string in stats_json, so a pick appends
   * to it rather than replacing it — converting the field to an array would mean
   * changing the serialised schema in two hand-maintained places.
   */
  function handleLanguagePick(name) {
    const have = (fields.langs || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (have.some((l) => l.toLowerCase() === name.toLowerCase())) return;
    setField('langs', [...have, name].join(', '));
  }

  /**
   * Monster options: the 341 SRD entries plus ~3,200 from Open5e. The two have
   * different payload shapes, so the option's `key` decides both which API to
   * ask and which mapper to use.
   */
  const [monsterOpts, setMonsterOpts] = useState([]);
  useEffect(() => {
    let alive = true;
    Promise.all([loadEntries('monsters'), loadOpen5eMonsters()]).then(([srd, o5e]) => {
      if (!alive) return;
      setMonsterOpts([
        ...(srd?.names ?? []).map((n) => ({ name: n, edition: '2024' })),
        ...(o5e ?? []).map((m) => ({ name: m.name, key: m.key, edition: '2014', source: m.source })),
      ]);
    });
    return () => { alive = false; };
  }, []);

  async function handleMonsterPick(name, opt) {
    const patch = opt?.key
      ? open5eMonsterToSheet(await getOpen5eMonster(opt.key))
      : monsterToSheet(await getMonster(name));
    if (!patch) return;

    const dirty = fields.charName || fields.actions || fields.specTraits;
    if (dirty && !await confirm(
      `Load ${name}? This overwrites the stat fields on this sheet.`,
      { title: 'Load stat block', confirmLabel: 'Load' },
    )) return;
    applySrd(patch);
  }

  // ── Embedded mode (postMessage bridge for PcSheet iframe) ─────────────────
  const isEmbedded = new URLSearchParams(window.location.search).get('embedded') === '1';

  // `collectSheet` changes identity on every edit (it closes over `fields`). Holding
  // it in a ref keeps the effect below mounted exactly once: with it in the dep array
  // the effect tore down and re-ran on every keystroke, re-posting NPC_READY, which
  // made the parent answer with LOAD_STATS carrying the last-saved snapshot — silently
  // reverting whatever the user was typing.
  const collectRef  = useRef(collectSheet);
  const populateRef = useRef(populateSheet);
  const clearRef    = useRef(clearSheet);
  useEffect(() => { collectRef.current  = collectSheet;  }, [collectSheet]);
  useEffect(() => { populateRef.current = populateSheet; }, [populateSheet]);
  useEffect(() => { clearRef.current    = clearSheet;    }, [clearSheet]);

  useEffect(() => {
    if (!isEmbedded) return undefined;

    function sendResize() {
      window.parent.postMessage(
        { type: 'IFRAME_RESIZE', height: document.documentElement.scrollHeight },
        '*',
      );
    }
    function handleMessage(e) {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'LOAD_STATS')    { populateRef.current(e.data.payload ?? {}); setTimeout(sendResize, 200); }
      if (e.data.type === 'COLLECT_STATS') { e.source?.postMessage({ type: 'STATS_DATA', payload: collectRef.current() }, e.origin ?? '*'); }
      // Distinct from LOAD_STATS with an empty payload: populateSheet ignores
      // `{}` by design, so the host's Clear button needs its own message.
      if (e.data.type === 'CLEAR_STATS')   { clearRef.current(); setTimeout(sendResize, 200); }
    }

    window.addEventListener('message', handleMessage);
    const ro = new ResizeObserver(sendResize);
    ro.observe(document.body);
    window.parent.postMessage({ type: 'NPC_READY' }, '*');
    setTimeout(sendResize, 250);

    return () => {
      window.removeEventListener('message', handleMessage);
      ro.disconnect();
    };
  }, [isEmbedded]);

  // autoGrow only fires on user input, so programmatically loaded NPCs (and the
  // initial render) keep the clipped min-height — content was hidden on screen
  // and in print. Re-size every textarea to its content whenever fields change.
  useEffect(() => {
    document.querySelectorAll('.npc-sheet textarea').forEach((el) => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [fields]);

  async function handleClear() {
    if (!await confirm('Clear all fields on the sheet?', { title: 'Clear sheet', confirmLabel: 'Clear' })) return;
    clearSheet();
  }

  const bind = (key) => ({ value: fields[key], onChange: (e) => setField(key, e.target.value) });

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {!isEmbedded && (
        <AppHeader icon="🎭" name="NPC Sheet">
          <Button variant="danger" onClick={handleClear}>🗑 Clear</Button>
          <Button variant="default" onClick={() => window.print()}>🖨 Print / PDF</Button>
        </AppHeader>
      )}

      <main className="flex-1 overflow-y-auto py-6 px-4" style={{ background: SHEET_SURROUND }}>
        <div className="npc-sheet">

          {/* ── HEADER ── */}
          <div className="sheet-head">
            <div className="head-left">
              <div className="char-name-wrap">
                <input className="char-name" type="text" placeholder="Character / NPC Name" autoComplete="off"
                  {...bind('charName')} aria-label="Character name" />
              </div>

              <div className="meta-row">
                <div className="mf wide">
                  <span className="mf-lbl">Load from SRD</span>
                  <SrdCombobox
                    value=""
                    onChange={() => {}}
                    onPick={handleMonsterPick}
                    options={monsterOpts}
                    infoResource={null}
                    placeholder="Search SRD + Open5e monsters…"
                  />
                </div>
              </div>

              <div className="meta-row">
                <div className="mf">
                  <span className="mf-lbl">Class</span>
                  <select value={fields.charClass} onChange={handleClassChange}>
                    <option value="">—</option>
                    {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="mf wide">
                  <span className="mf-lbl">Subclass</span>
                  <SrdCombobox
                    value={fields.subclass}
                    onChange={(v) => setField('subclass', v)}
                    onPick={handleSubclassPick}
                    options={subclassOptions}
                    infoResource="subclasses"
                    placeholder="Archetype…"
                  />
                </div>
              </div>

              <div className="meta-row">
                <div className="mf"><span className="mf-lbl">Race</span>
                  <SrdCombobox
                    value={fields.race}
                    onChange={(v) => setField('race', v)}
                    onPick={handleSpeciesPick}
                    srdResource="species"
                    // /species carries no prose, so an ⓘ here could only ever
                    // report "No entry". Trait names land in Special Traits,
                    // which is where the text actually lives.
                    infoResource={null}
                    placeholder="Race"
                  /></div>
                {subspeciesOpts.length > 0 && (
                  <div className="mf wide"><span className="mf-lbl">Lineage</span>
                    <SrdCombobox
                      value=""
                      onChange={() => {}}
                      onPick={handleLineagePick}
                      options={subspeciesOpts}
                      infoResource={null}   // /subspecies carries no prose either
                      placeholder="Lineage…"
                    /></div>
                )}
                <div className="mf"><span className="mf-lbl">Sex</span>
                  <input type="text" placeholder="—" style={{ minWidth: 40 }} autoComplete="off" {...bind('sex')} /></div>
                <div className="mf">
                  <span className="mf-lbl">Alignment</span>
                  <select {...bind('alignment')}>
                    <option value="">—</option>
                    {ALIGNMENTS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              {classIsCaster && (
                <div className="meta-row">
                  <div className="mf">
                    <span className="mf-lbl">Caster Type</span>
                    <select
                      {...bind('casterType')}
                      disabled={casterTypeLocked}
                      title={casterTypeLocked
                        ? `${fields.charClass} always has this caster type`
                        : 'Set the caster type — e.g. Third Caster for an Eldritch Knight or Arcane Trickster'}
                    >
                      <option value="none">None</option>
                      <option value="full">Full Caster</option>
                      <option value="half">Half Caster</option>
                      <option value="third">Third Caster</option>
                      <option value="warlock">Warlock (Pact)</option>
                      <option value="innate">Innate Spellcasting</option>
                    </select>
                  </div>
                  <div className="mf">
                    <span className="mf-lbl">Spell Ability</span>
                    <select {...bind('spellAbility')}>
                      <option value="">—</option>
                      <option value="int">Intelligence</option>
                      <option value="wis">Wisdom</option>
                      <option value="cha">Charisma</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="stat-boxes">
              <div className="sbox"><div className="sbox-lbl">LEVEL</div>
                <input type="text" placeholder="—" autoComplete="off" {...bind('level')} /></div>
              <div className="sbox"><div className="sbox-lbl">CR</div>
                <input type="text" placeholder="—" autoComplete="off" {...bind('cr')} /></div>
            </div>
          </div>

          <div className="sep" />

          {/* ── CORE STATS ── */}
          <div className="stats-bar">
            <div className="cs"><span className="cs-lbl">HP</span><input type="text" placeholder="0" {...bind('hp')} /></div>
            <div className="cs"><span className="cs-lbl">AC</span><input type="text" placeholder="0" {...bind('ac')} /></div>
            <div className="cs"><span className="cs-lbl">SPEED</span><input type="text" placeholder="30 ft" {...bind('speed')} /></div>
            <div className="cs"><span className="cs-lbl">PROF BONUS</span><input className="derived" type="text" readOnly value={derived.profBonus} /></div>
            <div className="cs"><span className="cs-lbl">INITIATIVE</span><input className="derived" type="text" readOnly value={derived.initiative} /></div>
            <div className="cs"><span className="cs-lbl">PASS PERC</span><input className="derived" type="text" readOnly value={derived.passPerc} /></div>
            <div className="cs"><span className="cs-lbl">PASS INVEST</span><input className="derived" type="text" readOnly value={derived.passInvest} /></div>
          </div>

          {/* ── ABILITY SCORES ── */}
          <AbilityScores abilities={abilities} derived={derived} onAbilityChange={setAbility} />

          <div className="sep-thin" />

          {/* ── SKILLS ── */}
          <SkillsBlock skillProfs={skillProfs} derived={derived} onCycleSkill={cycleSkill} />

          <div className="sep" />

          {/* ── DEFENSES ──
              Always printed, blank or not: the empty boxes are useful to write
              into on a printed sheet. (Unlike the Traits & Features textareas,
              which are hidden when empty — those are prose, not checklists.) */}
          <div className="sec-title"><span>Defenses &amp; Damage Traits</span></div>
          <div className="three-col">
            <div className="field"><label>Damage Resistances</label>
              <TagInput srdResource="damage-types" options={DAMAGE_TYPES} values={tags.resist} placeholder="Fire, Cold…" onAdd={(v) => addTag('resist', v)} onRemove={(v) => removeTag('resist', v)} /></div>
            <div className="field"><label>Damage Immunities</label>
              <TagInput srdResource="damage-types" options={DAMAGE_TYPES} values={tags.immune} placeholder="Poison, Fire…" onAdd={(v) => addTag('immune', v)} onRemove={(v) => removeTag('immune', v)} /></div>
            <div className="field"><label>Damage Vulnerabilities</label>
              <TagInput srdResource="damage-types" options={DAMAGE_TYPES} values={tags.vuln} placeholder="Radiant, Thunder…" onAdd={(v) => addTag('vuln', v)} onRemove={(v) => removeTag('vuln', v)} /></div>
          </div>
          <div className="two-col">
            <div className="field"><label>Condition Immunities</label>
              <TagInput srdResource="conditions" options={CONDITIONS} values={tags.condimmune} placeholder="Charmed, Frightened…" onAdd={(v) => addTag('condimmune', v)} onRemove={(v) => removeTag('condimmune', v)} /></div>
            <div className="field"><label>Additional Damage Tags</label>
              <TagInput srdResource="damage-types" options={DAMAGE_TYPES} values={tags.damagetype} placeholder="Slashing, Magical…" onAdd={(v) => addTag('damagetype', v)} onRemove={(v) => removeTag('damagetype', v)} /></div>
          </div>

          <div className="sep" />

          {/* ── TRAITS ── */}
          <div className="sec-title"><span>Traits &amp; Features</span></div>
          <div className="two-col">
            <FieldArea label="Personality / Roleplay Notes" placeholder="Mannerisms, voice, quirks…" {...bind('personality')} />
            <FieldArea label="Special Traits / Passive Abilities" placeholder="Pack Tactics, Undead Fortitude…" srdResource="traits" {...bind('specTraits')} />
          </div>
          <div className="two-col">
            <FieldArea label="Class Features &amp; Abilities" placeholder="Sneak Attack, Divine Smite…" {...bind('features')} />
            <FieldArea label="Equipment / Inventory" placeholder="Longsword, Chain Mail…" {...bind('equipment')} />
          </div>

          {/* Senses and Languages live here rather than in the stats bar above:
              they hold sentences ("Darkvision 120 ft., Blindsight 60 ft."), not
              the two or three characters that bar is sized for. */}
          <div className="two-col">
            <div className={`field${!String(fields.senses ?? '').trim() ? ' field-empty' : ''}`}>
              <label>Senses</label>
              <input type="text" placeholder="Darkvision 60 ft., Blindsight 30 ft." {...bind('senses')} />
            </div>
            <div className={`field${!String(fields.langs ?? '').trim() ? ' field-empty' : ''}`}>
              <label>Languages</label>
              <SrdCombobox
                value={fields.langs}
                onChange={(v) => setField('langs', v)}
                onPick={handleLanguagePick}
                srdResource="languages"
                infoResource={null}
                placeholder="Common, Elvish…"
              />
            </div>
          </div>

          <div className="sep" />

          {/* ── ACTIONS ── */}
          <div className="sec-title"><span>Actions</span></div>
          <div className="two-col">
            <FieldArea label="Actions" cls="xtall" placeholder="Multiattack. Longsword +5, 1d8+3…" {...bind('actions')} />
            <FieldArea label="Bonus Actions &amp; Reactions" cls="xtall" placeholder="Second Wind (1/SR), Parry…" {...bind('bonusActions')} />
          </div>

          {/* ── LEGENDARY ──
              Ordinary PCs have none of this, and empty it costs ~340px. Shown
              when it holds anything, or when explicitly revealed. The leading
              .sep lives inside the block so hiding it does not leave two
              separators stacked above Spellcasting (the Spellcasting gate below
              does the same). Nothing is persisted: deriving visibility from the
              content avoids adding a stats_json key, which has to be mapped by
              hand in both collectSheet and populateSheet. */}
          {showLegendary ? (
            <>
              <div className="sep" />
              <div className="sec-title">
                <span>Legendary &amp; Lair</span>
                <button type="button" className="sec-hide" onClick={() => setLegendaryOpen(false)}
                  title="Hide this section — nothing is deleted">
                  − Hide
                </button>
              </div>
              <div className="leg-res">
                <label>Legendary Resistances</label>
                <div className="leg-checks">
                  {legRes.map((used, i) => (
                    <input key={i} type="checkbox" checked={used} onChange={() => toggleLegRes(i)} aria-label={`Legendary resistance ${i + 1}`} />
                  ))}
                </div>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>(☑ = used)</span>
              </div>
              <div className="two-col">
                <FieldArea label="Legendary Actions" cls="xtall" placeholder="Can take 3 legendary actions per round…" {...bind('legActions')} />
                <FieldArea label="Lair Actions" cls="xtall" placeholder="On initiative count 20…" {...bind('lairActions')} />
              </div>
              <FieldArea label="Mythic / Special Abilities" placeholder="Mythic trait, regional effects…" {...bind('specialAbilities')} />
            </>
          ) : (
            <div className="add-section">
              <button type="button" onClick={() => setLegendaryOpen(true)}>
                + Legendary &amp; Lair{hasLegendary ? ' (has content)' : ''}
              </button>
            </div>
          )}

          {/* ── SPELLCASTING ── */}
          {isSpellcaster && (
            <>
              <div className="sep" />
              <div className="sec-title"><span>Spellcasting</span></div>
              <div className="spell-meta-row">
                <div className="spell-stat"><span className="spell-stat-lbl">Spell Save DC</span>
                  <div className="spell-stat-val">{derived.spellDC ?? '—'}</div></div>
                <div className="spell-stat"><span className="spell-stat-lbl">Spell Attack Bonus</span>
                  <div className="spell-stat-val">{derived.spellAtk != null ? fmtMod(derived.spellAtk) : '—'}</div></div>
                <div className="spell-stat"><span className="spell-stat-lbl">Ability Modifier</span>
                  <div className="spell-stat-val">{fields.spellAbility ? fmtMod(derived.mods[fields.spellAbility]) : '—'}</div></div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <span className="spell-stat-lbl" style={{ display: 'block', marginBottom: 3 }}>Slots Reset</span>
                  <select className="spell-reset-sel" {...bind('slotReset')}>
                    <option>Long Rest</option>
                    <option>Short Rest</option>
                    <option>Daily</option>
                  </select>
                </div>
              </div>
              <SpellSection
                casterType={fields.casterType}
                level={derived.level}
                spellNames={spellNames}
                usedSlots={usedSlots}
                onSetSpellName={setSpellName}
                onToggleSlot={toggleSlot}
              />
            </>
          )}

          <div className="sep" />

          {/* ── DM NOTES ── */}
          <div className="sec-title"><span>DM Notes</span></div>
          <FieldArea label="" cls="xtall" placeholder="Plot hooks, secrets, relationships, quest relevance…" {...bind('dmNotes')} />

        </div>
      </main>
    </>
  );
}
