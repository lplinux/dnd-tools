/**
 * pages/Diary/searchEntries.test.js
 *
 * The box is only worth having if it never hides a note that matches. These
 * mostly guard against the ways a filter quietly over-filters.
 */
import { describe, it, expect } from 'vitest';
import { fold, entryText, searchEntries } from './searchEntries';

const E = [
  { id: 1, title: 'The Ultheon pact', body: 'A sealed letter found in the vault.', category: 'Documents' },
  { id: 2, title: 'Rope and chalk', body: 'Bought at the market.', category: 'Supplies' },
  { id: 3, title: 'A name overheard', body: 'Grathul, spoken in Buldamar.', category: 'Documents' },
  { id: 4, title: 'Théa', body: null, category: null },
];
const FIELDS = ['title', 'body', 'category'];
const ids = (r) => r.map((e) => e.id);

describe('an empty query', () => {
  it('matches everything, so the raw input needs no guarding', () => {
    expect(searchEntries(E, '', FIELDS)).toBe(E);
    expect(searchEntries(E, '   ', FIELDS)).toBe(E);
    expect(searchEntries(E, null, FIELDS)).toBe(E);
  });
});

describe('matching', () => {
  it('searches every field, not just the title', () => {
    expect(ids(searchEntries(E, 'vault', FIELDS))).toEqual([1]);     // body
    expect(ids(searchEntries(E, 'supplies', FIELDS))).toEqual([2]);  // category
  });

  it('ignores case', () => {
    expect(ids(searchEntries(E, 'ULTHEON', FIELDS))).toEqual([1]);
  });

  it('ignores accents in both directions', () => {
    // A table that types "thea" for Théa is the normal case, not the edge one.
    expect(ids(searchEntries(E, 'thea', FIELDS))).toEqual([4]);
    expect(ids(searchEntries(E, 'théa', FIELDS))).toEqual([4]);
  });

  it('requires every term, in any order and any field', () => {
    expect(ids(searchEntries(E, 'letter vault', FIELDS))).toEqual([1]);
    expect(ids(searchEntries(E, 'vault letter', FIELDS))).toEqual([1]);
    expect(ids(searchEntries(E, 'documents grathul', FIELDS))).toEqual([3]);
    expect(ids(searchEntries(E, 'letter market', FIELDS))).toEqual([]);
  });

  it('matches partial words, because people type prefixes', () => {
    expect(ids(searchEntries(E, 'buld', FIELDS))).toEqual([3]);
  });

  it('never matches across two different fields as if they were one string', () => {
    // "pact" ends the title and "a sealed" opens the body; joined naively they
    // would read "pact a sealed" and match a term that is in neither field.
    expect(ids(searchEntries(E, 'pact a', FIELDS))).toEqual([1]);   // both terms exist separately
    expect(ids(searchEntries(E, 'pacta', FIELDS))).toEqual([]);
  });
});

describe('fields given as functions', () => {
  it('are read like any other field', () => {
    const rows = [
      { id: 1, author_character: 'Thalia', author_username: 'p1' },
      { id: 2, author_character: null, author_username: 'dm1' },
    ];
    const owner = (e) => e.author_character || e.author_username;
    expect(ids(searchEntries(rows, 'thalia', [owner]))).toEqual([1]);
    expect(ids(searchEntries(rows, 'dm1', [owner]))).toEqual([2]);
  });
});

describe('missing values', () => {
  it('are skipped rather than matched as "null"', () => {
    expect(ids(searchEntries(E, 'null', FIELDS))).toEqual([]);
    expect(ids(searchEntries(E, 'undefined', FIELDS))).toEqual([]);
  });

  it('do not throw', () => {
    expect(() => searchEntries([{}, null], 'x', FIELDS)).not.toThrow();
    expect(searchEntries(undefined, 'x', FIELDS)).toEqual([]);
  });
});

describe('fold', () => {
  it('handles a non-string without complaint', () => {
    expect(fold(42)).toBe('42');
    expect(fold(null)).toBe('');
  });
});

describe('entryText', () => {
  it('drops empty fields instead of leaving holes', () => {
    expect(entryText({ a: 'x', b: '', c: null }, ['a', 'b', 'c'])).toBe('x');
  });
});
