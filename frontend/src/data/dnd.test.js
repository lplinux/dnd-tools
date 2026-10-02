/**
 * 5e rules arithmetic. These numbers appear on every sheet and are the sort of
 * thing that is easy to get subtly wrong (and hard to notice) — negative
 * modifiers, the proficiency-bonus step points, and the warlock slot table,
 * which is shaped differently from every other caster.
 */

import { describe, it, expect } from 'vitest';
import { abilityMod, profBonus, fmtMod, getSlotArray, SKILLS, ABILITY_IDS } from './dnd';

describe('abilityMod', () => {
  it('floors toward negative infinity, not toward zero', () => {
    expect(abilityMod(10)).toBe(0);
    expect(abilityMod(11)).toBe(0);
    expect(abilityMod(12)).toBe(1);
    expect(abilityMod(9)).toBe(-1);   // NOT 0 — the classic off-by-one
    expect(abilityMod(8)).toBe(-1);
    expect(abilityMod(7)).toBe(-2);
    expect(abilityMod(1)).toBe(-5);
    expect(abilityMod(20)).toBe(5);
    expect(abilityMod(30)).toBe(10);
  });
});

describe('profBonus', () => {
  it('steps at 5, 9, 13 and 17', () => {
    expect([1, 4].map(profBonus)).toEqual([2, 2]);
    expect([5, 8].map(profBonus)).toEqual([3, 3]);
    expect([9, 12].map(profBonus)).toEqual([4, 4]);
    expect([13, 16].map(profBonus)).toEqual([5, 5]);
    expect([17, 20].map(profBonus)).toEqual([6, 6]);
  });

  it('clamps out-of-range levels rather than extrapolating', () => {
    expect(profBonus(0)).toBe(2);
    expect(profBonus(-3)).toBe(2);
    expect(profBonus(99)).toBe(6);
  });
});

describe('fmtMod', () => {
  it('always carries an explicit sign', () => {
    expect(fmtMod(3)).toBe('+3');
    expect(fmtMod(0)).toBe('+0');
    expect(fmtMod(-2)).toBe('-2');
  });
});

describe('getSlotArray', () => {
  it('returns 10 entries so index === spell level', () => {
    const s = getSlotArray('full', 5);
    expect(s).toHaveLength(10);
    expect(s[0]).toBe(0);            // index 0 is the cantrip placeholder
  });

  it('matches the full-caster table', () => {
    expect(getSlotArray('full', 1).slice(1, 4)).toEqual([2, 0, 0]);
    expect(getSlotArray('full', 5).slice(1, 4)).toEqual([4, 3, 2]);
    expect(getSlotArray('full', 20).slice(1, 10)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });

  it('gives half and third casters a fraction of the full progression', () => {
    // a level-10 paladin casts as a level-5 full caster
    expect(getSlotArray('half', 10).slice(1, 4)).toEqual(getSlotArray('full', 5).slice(1, 4));
    // a level-12 eldritch knight casts as a level-4 full caster
    expect(getSlotArray('third', 12).slice(1, 4)).toEqual(getSlotArray('full', 4).slice(1, 4));
  });

  it('gives warlocks few slots at a high level — pact magic, not the full table', () => {
    const w = getSlotArray('warlock', 9);
    expect(w).toHaveLength(10);
    expect(w[5]).toBe(2);                       // two 5th-level pact slots
    expect(w.slice(1, 5)).toEqual([0, 0, 0, 0]); // and nothing below
  });

  it('returns nothing for a non-caster, and all-zeroes for innate', () => {
    expect(getSlotArray('none', 5)).toEqual([]);
    expect(getSlotArray('nonsense', 5)).toEqual([]);
    expect(getSlotArray('innate', 5)).toEqual(Array(10).fill(0));
  });

  it('clamps the level rather than reading past the table', () => {
    expect(getSlotArray('full', 0)).toEqual(getSlotArray('full', 1));
    expect(getSlotArray('full', 99)).toEqual(getSlotArray('full', 20));
  });
});

describe('SKILLS', () => {
  it('lists the 18 skills, each against a real ability', () => {
    expect(SKILLS).toHaveLength(18);
    for (const [name, ability] of SKILLS) {
      expect(typeof name).toBe('string');
      expect(ABILITY_IDS).toContain(ability);
    }
  });
});
