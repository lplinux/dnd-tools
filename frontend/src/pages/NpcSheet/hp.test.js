/**
 * pages/NpcSheet/hp.test.js
 *
 * Every case here is a string that is not a number — which is what these
 * fields actually hold in play.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { num, effectiveMax, clampedHp, hasTemp, canClearHp, clearedHp } from './hp';

describe('num', () => {
  it('reads what a sheet in play actually contains', () => {
    expect(num('12')).toBe(12);
    expect(num(' 12 ')).toBe(12);
    expect(num('+12')).toBe(12);
    expect(num('-4')).toBe(-4);
  });

  it('is zero for anything unparseable, never NaN', () => {
    for (const v of ['', '   ', 'abc', null, undefined, {}]) {
      expect(num(v)).toBe(0);
      expect(Number.isNaN(num(v))).toBe(false);
    }
  });
});

describe('clampedHp', () => {
  const f = (hp, maxHp, tempMaxHp = '') => ({ hp, maxHp, tempMaxHp });

  it('pulls current down to the effective maximum', () => {
    expect(clampedHp(f('38', '20'))).toBe('20');
  });

  it('honours a negative temporary maximum', () => {
    expect(clampedHp(f('20', '20', '-4'))).toBe('16');
  });

  it('leaves current alone when it already fits', () => {
    expect(clampedHp(f('12', '20'))).toBeNull();
    expect(clampedHp(f('20', '20'))).toBeNull();
    expect(clampedHp(f('24', '20', '+4'))).toBeNull();
  });

  it('never raises current', () => {
    // Healing is not something a clamp should do on its way past.
    expect(clampedHp(f('5', '20'))).toBeNull();
  });

  it('does nothing while the maximum is blank', () => {
    // num('') is 0, so without this a blank maximum would zero a character's
    // HP the moment you tabbed past it — and the SRD importer leaves max_hp
    // empty on every single monster.
    expect(clampedHp(f('38', ''))).toBeNull();
    expect(clampedHp(f('38', '   '))).toBeNull();
  });

  it('does nothing while current is blank', () => {
    expect(clampedHp(f('', '20'))).toBeNull();
  });
});

describe('hasTemp', () => {
  it('counts a negative temporary maximum', () => {
    expect(hasTemp({ tempHp: '', tempMaxHp: '-4' })).toBe(true);
  });

  it('is false for blank and for an explicit zero', () => {
    expect(hasTemp({ tempHp: '', tempMaxHp: '' })).toBe(false);
    expect(hasTemp({ tempHp: '0', tempMaxHp: '0' })).toBe(false);
  });
});

describe('canClearHp', () => {
  it('is false with no maximum to heal to', () => {
    expect(canClearHp({ hp: '5', maxHp: '' })).toBe(false);
    // Even with temporary HP in play: there is nowhere to set current to.
    expect(canClearHp({ hp: '5', maxHp: '', tempHp: '8' })).toBe(false);
  });

  it('is false on an untouched character', () => {
    expect(canClearHp({ hp: '20', maxHp: '20', tempHp: '', tempMaxHp: '' })).toBe(false);
    expect(canClearHp({ hp: ' 20 ', maxHp: '20' })).toBe(false);
  });

  it('is true when wounded', () => {
    expect(canClearHp({ hp: '12', maxHp: '20' })).toBe(true);
  });

  it('is true at full HP but carrying a temporary value', () => {
    expect(canClearHp({ hp: '20', maxHp: '20', tempHp: '8' })).toBe(true);
    expect(canClearHp({ hp: '20', maxHp: '20', tempMaxHp: '-4' })).toBe(true);
  });

  it('is true when current is blank, since setting it is the point', () => {
    expect(canClearHp({ hp: '', maxHp: '20' })).toBe(true);
  });
});

describe('clearedHp', () => {
  it('drops every temporary value and heals to full', () => {
    expect(clearedHp({ hp: '3', maxHp: '20', tempHp: '8', tempMaxHp: '5' }))
      .toEqual({ hp: '20', tempHp: '', tempMaxHp: '' });
  });

  it('heals to the BASE maximum, not the temporary one', () => {
    // The temporary maximum is being cleared on the same action, so honouring
    // it would set HP from a value that does not exist a line later.
    expect(clearedHp({ hp: '3', maxHp: '20', tempMaxHp: '10' }).hp).toBe('20');
    expect(clearedHp({ hp: '3', maxHp: '20', tempMaxHp: '-4' }).hp).toBe('20');
  });

  it('trims, so the field does not grow whitespace each time', () => {
    expect(clearedHp({ maxHp: ' 20 ' }).hp).toBe('20');
  });

  it('leaves nothing clampable behind', () => {
    const f = { hp: '38', maxHp: '20', tempHp: '8', tempMaxHp: '-4' };
    const after = { ...f, ...clearedHp(f) };
    expect(clampedHp(after)).toBeNull();
    expect(canClearHp(after)).toBe(false);
    expect(effectiveMax(after)).toBe(20);
  });
});


/**
 * The sheet itself. Structural, because the point of these three changes is
 * WHERE a control is, which no amount of pure-function testing can see.
 */
describe('the HP controls on the sheet', () => {
  const sheet = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.jsx'), 'utf8',
  );
  const dialog = sheet.slice(sheet.indexOf('open={hpModal}'));

  it('has no Current HP box in the Manage HP dialog', () => {
    // One number, one place to change it. A second box is how the two end up
    // disagreeing — and the inline one is the whole reason the dialog exists
    // for the other three values.
    // The field, not the words — the dialog's help text still says "Current HP"
    // to explain where it went, and should.
    expect(dialog).not.toMatch(/\{FIELD_LABEL\}>Current HP</);
    expect(dialog).not.toMatch(/bind\('hp'\)/);
    expect(dialog).not.toMatch(/<input[^>]*\bhp\b/);
  });

  it('still edits the other three there', () => {
    for (const f of ['maxHp', 'tempHp', 'tempMaxHp']) {
      expect(dialog).toMatch(new RegExp(`bind\\('${f}'\\)`));
    }
  });

  it('keeps Current HP editable inline', () => {
    const stat = sheet.slice(sheet.indexOf('className="hp-pair"'), sheet.indexOf('open={hpModal}'));
    expect(stat).toMatch(/aria-label="Current HP"/);
    // StatInput hands back the value, not the event — it owns a draft, so
    // there is no event left to read by the time it commits.
    expect(stat).toMatch(/onChange=\{\(v\) => setField\('hp', v\)\}/);
  });

  it('shows temporary HP only when there is some', () => {
    expect(sheet).toMatch(/\{tempHpNum !== 0 && \(/);
    expect(sheet).toMatch(/className="hp-temp-badge"/);
  });

  it('floats the temporary-HP badge beside the label, not above the number', () => {
    // Inside the label span, so it never sits in the number's column.
    const label = sheet.slice(sheet.indexOf('<span className="cs-lbl">'), sheet.indexOf('className="hp-pair"'));
    expect(label).toMatch(/className="hp-temp-badge"/);
  });

  it('makes the temporary-HP badge the control for its own value', () => {
    const badge = sheet.slice(sheet.indexOf('className="hp-temp-badge"'));
    expect(badge.slice(0, 220)).toMatch(/onClick=\{\(\) => setHpModal\(true\)\}/);
  });

  it('types the stat boxes you overwrite as StatInput', () => {
    // Current HP, AC and Speed are replaced, never amended.
    const bar = sheet.slice(sheet.indexOf('className="stats-bar"'), sheet.indexOf('<AbilityScores'));
    expect(bar).toMatch(/<StatInput[\s\S]*aria-label="Current HP"/);
    expect(bar).toMatch(/<StatInput[^>]*bindStat\('ac'\)/);
    expect(bar).toMatch(/<StatInput[^>]*bindStat\('speed'\)/);
    // The derived four stay plain read-only inputs.
    expect(bar).toMatch(/className="derived" type="text" readOnly/);
  });

  it('puts the clear control on the stat, not in the dialog', () => {
    const label = sheet.slice(sheet.indexOf('<span className="cs-lbl">'), sheet.indexOf('className="hp-pair"'));
    expect(label).toMatch(/onClick=\{clearHp\}/);
    expect(dialog).not.toMatch(/onClick=\{clearHp\}/);
  });
});

describe('the temporary-HP badge styling', () => {
  const css = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'npc-sheet.css'), 'utf8',
  );
  const rule = css.slice(css.indexOf('.hp-temp-badge {'), css.indexOf('.hp-temp-badge {') + 300);

  it('is blue, and smaller than the number it sits above', () => {
    // Blue so it is neither the sheet's red nor the green a temporary MAXIMUM
    // tints; three different things should not share a colour.
    expect(rule).toMatch(/color:\s*#1d4ed8/);
    expect(rule).toMatch(/font-size:\s*10px/);
    expect(css).toMatch(/\.hp-cur[^{]*\{[^}]*font-size:\s*1rem/);
  });

  it('floats, so the stats bar is the same height with it and without', () => {
    // The whole reason it is not stacked above the number any more.
    expect(rule).toMatch(/position:\s*absolute/);
    expect(css).toMatch(/\.npc-sheet \.cs \{[^}]*position:\s*relative/);
    // And the bar is back to its original, badge-agnostic layout.
    expect(css).not.toMatch(/\.stats-bar \{[^}]*align-items/);
    expect(css).toMatch(/\.hp-pair \{[^}]*align-items:\s*baseline/);
  });
});


describe('the grey hints on the stat boxes', () => {
  const css = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'npc-sheet.css'), 'utf8',
  );

  it('are muted well below the ink, so one can never pass for a set value', () => {
    const rule = css.slice(css.indexOf('.npc-sheet .cs input::placeholder'));
    expect(rule.slice(0, 400)).toMatch(/color:\s*var\(--muted\)/);
    expect(rule.slice(0, 400)).toMatch(/opacity:\s*\.?\d/);
  });

  it('cover the ability scores as well as the stats bar', () => {
    expect(css).toMatch(/\.npc-sheet \.ab-score::placeholder/);
  });

  it('do not print — a hint is not content', () => {
    const print = css.slice(css.indexOf('/* Print: a hint is not content. */'));
    expect(print.slice(0, 300)).toMatch(/color:\s*transparent/);
  });
});
