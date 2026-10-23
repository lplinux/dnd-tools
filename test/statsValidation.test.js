/**
 * test/statsValidation.test.js
 *
 * `pc_char_stats.stats_json` used to take `JSON.stringify(req.body)` unchecked.
 * `validateStats` closes that, and in doing so becomes the single most dangerous
 * function in the file: it is a whitelist standing between the character sheet
 * and the database, so any key it fails to know about is a key that silently
 * disappears the next time someone saves.
 *
 * That exact failure has happened here before. The comment above `collectSheet`
 * records it — saving camelCase while `populateSheet` read snake_case "silently
 * wiped every saving throw proficiency on the next load". These tests exist so
 * it does not happen a second time:
 *
 *   - **The drift test** reads `collectSheet` out of the frontend hook and
 *     `validateStats` out of app.js, and fails when the two disagree about what
 *     a sheet contains. It is the whole point of the file.
 *   - **The behaviour tests** pull the validator out of app.js as text and run
 *     it. app.js calls `app.listen` at import time so it cannot be required,
 *     but the validator is pure and self-contained, so it can be lifted out and
 *     exercised for real rather than merely grepped for.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource  = readFileSync(path.join(root, 'app.js'), 'utf8');
const hookSource = readFileSync(path.join(root, 'frontend/src/hooks/useNpcSheet.js'), 'utf8');

// ── Lift the validator out of app.js and make it callable ───────────────────
function loadValidator() {
  const start = appSource.indexOf('const STATS_TEXT_FIELDS = {');
  expect(start, 'STATS_TEXT_FIELDS not found in app.js').toBeGreaterThan(-1);
  const fnStart = appSource.indexOf('function validateStats(body) {', start);
  expect(fnStart, 'validateStats not found in app.js').toBeGreaterThan(-1);
  const end = appSource.indexOf('\n}\n', fnStart);
  expect(end, 'unterminated validateStats').toBeGreaterThan(fnStart);
  const src = appSource.slice(start, end + 2);
  return new Function(`${src}\nreturn validateStats;`)();
}
const validateStats = loadValidator();

/** The keys `collectSheet` actually emits, read from the hook. */
function collectSheetKeys() {
  const start = hookSource.indexOf('const collectSheet = useCallback(() => ({');
  expect(start, 'collectSheet not found').toBeGreaterThan(-1);
  const end = hookSource.indexOf('\n  }), [', start);
  expect(end, 'unterminated collectSheet').toBeGreaterThan(start);
  const body = hookSource.slice(start, end);
  return [...body.matchAll(/^\s{4}([a-z_]+):/gm)].map(m => m[1]);
}

describe('validateStats stays in step with the sheet', () => {
  const emitted = collectSheetKeys();

  it('reads a plausible set of keys out of collectSheet', () => {
    // A guard on the guard: if the regex silently stops matching, every other
    // assertion in this file passes vacuously.
    expect(emitted.length).toBeGreaterThan(30);
    expect(emitted).toContain('char_name');
    expect(emitted).toContain('legendary_res');
  });

  it('handles every key collectSheet emits', () => {
    const textFields = appSource
      .slice(appSource.indexOf('const STATS_TEXT_FIELDS = {'),
             appSource.indexOf('/** Kept in step with ABILITY_IDS'));
    // Structured keys are handled by name in the validator body, not in the map.
    const structured = ['abilities', 'skill_profs', 'tags', 'spell_names',
      'used_slots', 'legendary_res'];

    const unhandled = emitted.filter(k =>
      !structured.includes(k) && !new RegExp(`\\b${k}:`).test(textFields));

    expect(unhandled, `collectSheet emits keys validateStats drops: ${unhandled.join(', ')}`)
      .toEqual([]);
  });

  it('survives a full round-trip of a realistic sheet unchanged', () => {
    const sheet = Object.fromEntries(emitted.map(k => [k, '']));
    Object.assign(sheet, {
      char_name: 'Nerida Stormtide',
      char_class: 'Cleric',
      level: '7',
      cr: '1/2',                       // fractions, not numbers
      hp: '10 (3d6)',                  // the SRD importer's format
      max_hp: '45',
      ac: '14',
      speed: '30 ft., swim 40 ft.',
      senses: 'Darkvision 60 ft.',
      actions: 'Tidelash. Ranged Spell Attack: +7 to hit.',
      abilities: {
        str: { score: 9,  st_prof: false }, dex: { score: 14, st_prof: false },
        con: { score: 14, st_prof: false }, int: { score: 16, st_prof: false },
        wis: { score: 18, st_prof: true  }, cha: { score: 16, st_prof: true  },
      },
      skill_profs: {
        Acrobatics: 0, 'Animal Handling': 0, Arcana: 0, Athletics: 0,
        Deception: 0, History: 1, Insight: 2, Intimidation: 0,
        Investigation: 0, Medicine: 0, Nature: 0, Perception: 1,
        Performance: 0, Persuasion: 0, Religion: 0, 'Sleight of Hand': 0,
        Stealth: 0, Survival: 0,
      },
      tags: { resist: ['Cold'], immune: [], vuln: [], condimmune: [], damagetype: [] },
      spell_names: { 0: 'guidance, mending', 1: 'bane, healing word', 4: 'divination' },
      used_slots: { 1: [0, 2], 3: [] },
      legendary_res: [false, false, false, false, false],
    });

    // Byte-identical, key order included — this is what proves a save/reload
    // cycle cannot quietly rewrite someone's character.
    expect(JSON.stringify(validateStats(sheet))).toBe(JSON.stringify(sheet));
  });
});

describe('validateStats preserves what the sheet depends on', () => {
  it('leaves an absent key absent', () => {
    // populateSheet falls back with `?? prev`, so inventing a key overwrites.
    const out = validateStats({ char_name: 'Reaver' });
    expect(out).toEqual({ char_name: 'Reaver' });
    expect('dm_notes' in out).toBe(false);
  });

  it('keeps an empty string empty rather than nulling it', () => {
    // '' ?? prev is ''; null ?? prev is prev. Nulling stops a field clearing.
    const out = validateStats({ dm_notes: '', senses: '' });
    expect(out.dm_notes).toBe('');
    expect(out.senses).toBe('');
  });

  it('does not coerce the numeric-looking fields to numbers', () => {
    const out = validateStats({ cr: '1/4', hp: '27/40', ac: '16 (natural armor)' });
    expect(out.cr).toBe('1/4');
    expect(out.hp).toBe('27/40');
    expect(out.ac).toBe('16 (natural armor)');
  });

  it('accepts tag values outside the built-in lists', () => {
    // srdMap's canonical() deliberately falls back to the API's own wording.
    const out = validateStats({ tags: { resist: ['Bludgeoning from tidal force'] } });
    expect(out.tags.resist).toEqual(['Bludgeoning from tidal force']);
  });
});

describe('validateStats rejects what it should', () => {
  it('returns an empty object for a missing or non-object body', () => {
    // Also fixes the NULL insert: JSON.stringify(undefined) is undefined, which
    // used to hit a NOT NULL column and surface as a raw Postgres 500.
    for (const bad of [undefined, null, '', 'nope', 42, []]) {
      expect(validateStats(bad)).toEqual({});
    }
  });

  it('drops unknown keys', () => {
    const out = validateStats({ char_name: 'ok', __proto__dangerous: 1, whatever: 'x' });
    expect(Object.keys(out)).toEqual(['char_name']);
  });

  it('caps oversized text', () => {
    const out = validateStats({ char_name: 'x'.repeat(5000), dm_notes: 'y'.repeat(99999) });
    expect(out.char_name.length).toBe(255);
    expect(out.dm_notes.length).toBe(20000);
  });

  it('drops a nested blob smuggled into a text slot', () => {
    const out = validateStats({ char_name: { deeply: { nested: [1, 2, 3] } } });
    expect('char_name' in out).toBe(false);
  });

  it('clamps ability scores and ignores unknown ability ids', () => {
    const out = validateStats({
      abilities: { str: { score: 9999 }, dex: { score: -5 }, zzz: { score: 10 } },
    });
    expect(out.abilities.str.score).toBe(99);
    expect(out.abilities.dex.score).toBe(1);
    expect('zzz' in out.abilities).toBe(false);
  });

  it('bounds the skill tiers, tag lists, spell levels and slots', () => {
    const out = validateStats({
      skill_profs: { Stealth: 99, NotASkill: 2 },
      tags: { resist: Array(500).fill('Cold'), bogus: ['x'] },
      spell_names: { 3: 'fireball', 42: 'nope' },
      used_slots: { 2: [1, 1, 0, 999], 99: [0] },
      legendary_res: [1, 'yes', 0, null, true, true, true],
    });
    expect(out.skill_profs).toEqual({ Stealth: 0 });
    expect(out.tags.resist.length).toBe(50);
    expect('bogus' in out.tags).toBe(false);
    expect(out.spell_names).toEqual({ 3: 'fireball' });
    expect(out.used_slots).toEqual({ 2: [0, 1] });        // deduped, sorted, bounded
    expect(out.legendary_res).toEqual([true, true, false, false, true]);
  });
});

describe('every write to stats_json goes through the validator', () => {
  it('has no remaining unvalidated write', () => {
    // Six writes now: the character PUT and the NPC sheet PUT, plus four
    // that take the blob from an uploaded file — the new-campaign import
    // writes both kinds, and import-into writes NPC sheets since it stopped
    // dropping them. Hardening only the PUTs
    // would leave the import paths as a back door — a bundle is a file a
    // person can edit, so what is in it is no more trusted than a request.
    //
    // `sheet` is in the filter because that is what the campaign import
    // calls its variable. It was added when NPC sheets landed, and without
    // it that write matched nothing and the guard counted past it: a raw
    // JSON.stringify(sheet) would have sailed through this test.
    // Comments stripped first, as handlerCode() does in itemCards.test.js —
    // the validator's own doc comment names the old unchecked call.
    const code = appSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const writes = [...code.matchAll(/JSON\.stringify\(([^)]*)\)/g)]
      .map(m => m[1])
      .filter(a => /stats|req\.body|sheet/.test(a));

    expect(writes.length).toBe(6);
    for (const arg of writes) expect(arg).toMatch(/^validateStats\(/);
  });
});
