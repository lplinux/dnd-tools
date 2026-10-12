/**
 * isFormDirty — "has anything been typed here yet?"
 *
 * It decides whether picking an "Evolves from" card may copy that card over the
 * form without asking. A false negative costs someone whatever they had just
 * written, so the bias is towards calling a form dirty.
 */
import { describe, it, expect } from 'vitest';
import { defaultForm, isFormDirty } from './constants';

describe('isFormDirty', () => {
  it('is false for a untouched form', () => {
    expect(isFormDirty(defaultForm())).toBe(false);
  });

  it('ignores the parent itself', () => {
    // Choosing a parent is the action asking the question; counting it would
    // make the answer always yes and the copy would never happen.
    expect(isFormDirty({ ...defaultForm(), evolvesFrom: 7 })).toBe(false);
  });

  it('notices any field the user could have filled', () => {
    for (const [k, v] of Object.entries({
      name: 'Tidecaller', type: 'Weapon', rarity: 'legendary', flavor: 'x',
      abilities: '<p>x</p>', attunement: true, weight: '3', damage: '1d8',
      damageType: 'Slashing', properties: 'Finesse', acBonus: '1',
      armorType: 'Light', uses: '3',
    })) {
      expect(isFormDirty({ ...defaultForm(), [k]: v }), `${k} not detected`).toBe(true);
    }
  });

  it('covers every field in the form, not a hardcoded list', () => {
    // A new field added to defaultForm is checked automatically. If this ever
    // stops being true, a typed value could be silently overwritten.
    const keys = Object.keys(defaultForm());
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) {
      if (k === 'evolvesFrom') continue;
      const changed = { ...defaultForm(), [k]: k === 'attunement' ? true : 'zzz' };
      expect(isFormDirty(changed), `${k} is not checked`).toBe(true);
    }
  });

  it('errs towards dirty for a malformed form, and never throws', () => {
    // `{}` is not a real form — the component's always has every key. Reading
    // it as dirty means an unrecognised shape costs a confirmation prompt
    // rather than someone's unsaved text. That is the right way round.
    expect(() => isFormDirty({})).not.toThrow();
    expect(() => isFormDirty(null)).not.toThrow();
    expect(isFormDirty({})).toBe(true);
  });
});
