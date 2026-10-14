/**
 * data/highlight.test.js
 *
 * The offset arithmetic. Folding accents changes the length of a string in
 * exactly the case nobody tests — text that arrives already decomposed — and
 * every offset after it is then wrong.
 */
import { describe, it, expect } from 'vitest';
import { foldWithMap, queryTerms, findRanges, splitOnMatches } from './highlight';

/** "Théa" with a precomposed é (4 chars) and with a combining one (5 chars). */
const NFC = 'Théa';
const NFD = 'Théa';

describe('foldWithMap', () => {
  it('folds the same whichever way the accent was written', () => {
    expect(foldWithMap(NFC).folded).toBe('thea');
    expect(foldWithMap(NFD).folded).toBe('thea');
  });

  it('maps each folded character back to where it came from', () => {
    // NFC: one char each, so the map is the identity plus the end.
    expect(foldWithMap(NFC).map).toEqual([0, 1, 2, 3, 4]);
    // NFD: the combining mark at index 3 contributes nothing, so 'a' — the
    // fourth folded character — came from index 4, not index 3.
    expect(foldWithMap(NFD).map).toEqual([0, 1, 2, 4, 5]);
  });

  it('survives empty and non-string input', () => {
    expect(foldWithMap('').folded).toBe('');
    expect(foldWithMap(null).folded).toBe('');
    expect(foldWithMap(undefined).map).toEqual([0]);
  });
});

describe('findRanges', () => {
  it('finds a term written with an accent when typed without', () => {
    expect(findRanges(`Met ${NFC} here`, ['thea'])).toEqual([{ start: 4, end: 8 }]);
  });

  it('gets the offsets right on ALREADY-DECOMPOSED text', () => {
    // This is the case a naive fold gets wrong: the folded string is shorter
    // than the original, so a folded offset used directly would slice early.
    const text = `Met ${NFD} here`;
    const [r] = findRanges(text, ['thea']);
    expect(text.slice(r.start, r.end)).toBe(NFD);
  });

  it('finds every occurrence, not just the first', () => {
    expect(findRanges('ab ab ab', ['ab'])).toEqual([
      { start: 0, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 8 },
    ]);
  });

  it('finds several different terms', () => {
    const r = findRanges('a letter in the vault', ['letter', 'vault']);
    expect(r).toEqual([{ start: 2, end: 8 }, { start: 16, end: 21 }]);
  });

  it('merges overlapping and touching matches into one', () => {
    // "water" and "waterdeep" both hit; two marks that touch should read as one.
    expect(findRanges('Waterdeep', ['water', 'waterdeep'])).toEqual([{ start: 0, end: 9 }]);
  });

  it('returns nothing for no terms, no text, or no match', () => {
    expect(findRanges('abc', [])).toEqual([]);
    expect(findRanges('', ['a'])).toEqual([]);
    expect(findRanges('abc', ['zzz'])).toEqual([]);
    expect(findRanges(null, ['a'])).toEqual([]);
  });
});

describe('queryTerms', () => {
  it('folds, splits and deduplicates', () => {
    expect(queryTerms('  Théa   THEA  grathul ')).toEqual(['grathul', 'thea']);
  });

  it('puts the longest first, so a short term cannot carve up a long match', () => {
    expect(queryTerms('wat water waterdeep')[0]).toBe('waterdeep');
  });

  it('is empty for an empty query', () => {
    expect(queryTerms('')).toEqual([]);
    expect(queryTerms('   ')).toEqual([]);
  });
});

describe('splitOnMatches', () => {
  it('alternates plain and matched pieces', () => {
    expect(splitOnMatches('a letter here', ['letter'])).toEqual([
      { text: 'a ', match: false },
      { text: 'letter', match: true },
      { text: ' here', match: false },
    ]);
  });

  it('keeps the ORIGINAL spelling in a matched piece', () => {
    // The mark must show what the author wrote, not what the query typed.
    const [, hit] = splitOnMatches(`Met ${NFC}`, ['thea']);
    expect(hit).toEqual({ text: NFC, match: true });
  });

  it('handles a match at either end', () => {
    expect(splitOnMatches('ab c', ['ab'])).toEqual([
      { text: 'ab', match: true }, { text: ' c', match: false },
    ]);
    expect(splitOnMatches('c ab', ['ab'])).toEqual([
      { text: 'c ', match: false }, { text: 'ab', match: true },
    ]);
  });

  it('returns the whole string as one plain piece when nothing matches', () => {
    expect(splitOnMatches('abc', ['z'])).toEqual([{ text: 'abc', match: false }]);
  });

  it('never loses or duplicates a character', () => {
    const src = `A ${NFD} and a ${NFC} and water`;
    for (const terms of [['thea'], ['thea', 'water'], ['a'], []]) {
      const joined = splitOnMatches(src, terms).map((p) => p.text).join('');
      expect(joined, `terms ${JSON.stringify(terms)}`).toBe(src);
    }
  });
});
