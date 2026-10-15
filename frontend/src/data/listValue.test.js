/**
 * data/listValue.test.js
 *
 * The chips are edited as a list; the column still holds a comma-separated
 * string. These three functions are the whole seam between the two, so a
 * round trip must not quietly change what is stored.
 */
import { describe, it, expect } from 'vitest';
import { splitList, joinList, removeOne } from './listValue';

describe('splitList', () => {
  it('splits and trims', () => {
    expect(splitList('Light, Finesse')).toEqual(['Light', 'Finesse']);
    expect(splitList('Light ,  Finesse ')).toEqual(['Light', 'Finesse']);
  });

  it('drops the empties a half-typed list leaves behind', () => {
    expect(splitList('Light, , Finesse,')).toEqual(['Light', 'Finesse']);
  });

  it('is an empty list, never [""], for an empty field', () => {
    // A single empty string would render as a blank chip.
    for (const v of ['', '  ', ',', ', ,', null, undefined]) {
      expect(splitList(v), JSON.stringify(v)).toEqual([]);
    }
  });
});

describe('joinList', () => {
  it('uses one canonical separator', () => {
    expect(joinList(['Light', 'Finesse'])).toBe('Light, Finesse');
  });

  it('drops blanks rather than emitting ", , "', () => {
    expect(joinList(['Light', '', '  ', 'Finesse'])).toBe('Light, Finesse');
  });

  it('is an empty string for nothing', () => {
    expect(joinList([])).toBe('');
    expect(joinList(null)).toBe('');
  });
});

describe('a round trip changes nothing', () => {
  it('for a list already stored tidily', () => {
    for (const v of ['Light, Finesse', 'Fireball', '']) {
      expect(joinList(splitList(v))).toBe(v);
    }
  });

  it('and tidies one that was not', () => {
    expect(joinList(splitList('Light ,, Finesse, '))).toBe('Light, Finesse');
  });
});

describe('removeOne', () => {
  it('removes the named entry', () => {
    expect(removeOne(['Light', 'Finesse'], 'Light')).toEqual(['Finesse']);
  });

  it('removes only the FIRST of a duplicate', () => {
    // A level holding a spell twice is a mistake, but one × should remove one
    // chip — taking both would be a surprise.
    expect(removeOne(['Aid', 'Bless', 'Aid'], 'Aid')).toEqual(['Bless', 'Aid']);
  });

  it('leaves the list alone when the name is not in it', () => {
    expect(removeOne(['Light'], 'Heavy')).toEqual(['Light']);
  });

  it('survives an empty or missing list', () => {
    expect(removeOne([], 'x')).toEqual([]);
    expect(removeOne(null, 'x')).toEqual([]);
  });
});
