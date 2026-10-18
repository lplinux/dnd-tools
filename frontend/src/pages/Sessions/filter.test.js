/**
 * Filtering a tree is not filtering a list: a card that matches has to keep
 * its ancestors, or a deep hit surfaces at the root with nothing to say what
 * it belonged to.
 */
import { describe, it, expect } from 'vitest';
import { filterTree, countTree, hits, fold } from './filter';

const item = (id, title, over = {}) => ({
  id, title, body: null, state: 'in-preparation', section: 'beats', parent_id: null, ...over,
});
const items = [
  item(1, 'Ambush at the ford'),
  item(2, 'If they refuse', { parent_id: 1 }),
  item(3, 'Grathul speaks', { parent_id: 2, state: 'done' }),
  item(4, 'The princess and the cat', { state: 'ready' }),
  item(5, 'Somewhere else', { section: 'prep' }),
];
const none = new Set();

describe('text search', () => {
  it('finds a card by its title', () => {
    const t = filterTree(items, 'beats', 'princess', none);
    expect(t.map((i) => i.title)).toEqual(['The princess and the cat']);
  });

  it('keeps the ancestors of a deep match, marked as context', () => {
    const t = filterTree(items, 'beats', 'grathul', none);
    expect(t).toHaveLength(1);
    expect(t[0].title).toBe('Ambush at the ford');
    expect(t[0]._context, 'the ancestor should be context, not a hit').toBe(true);
    expect(t[0].children[0]._context).toBe(true);
    expect(t[0].children[0].children[0].title).toBe('Grathul speaks');
    expect(t[0].children[0].children[0]._context).toBeUndefined();
  });

  it('a matching card keeps its whole subtree', () => {
    // You searched for the card; its detail is what you wanted to read.
    // Filtering the children away would leave a beat with its "if they
    // refuse" branch missing.
    const t = filterTree(items, 'beats', 'ambush', none);
    expect(t.map((i) => i.title)).toEqual(['Ambush at the ford']);
    expect(t[0]._context).toBeUndefined();
    expect(t[0].children[0].title).toBe('If they refuse');
    expect(t[0].children[0].children[0].title).toBe('Grathul speaks');
  });

  it('matches on a substring, so "the" also finds "they"', () => {
    // Not a typo in the test: this is what substring search means, and an
    // earlier version of this file asserted the opposite and was wrong.
    const t = filterTree(items, 'beats', 'the', none);
    expect(t.map((i) => i.title).sort())
      .toEqual(['Ambush at the ford', 'The princess and the cat']);
  });

  it('needs every term, not any', () => {
    expect(filterTree(items, 'beats', 'princess ford', none)).toEqual([]);
  });

  it('ignores case and accents', () => {
    expect(fold('Théa')).toBe('thea');
    expect(filterTree([item(9, 'Théa waits')], 'beats', 'thea', none)).toHaveLength(1);
  });

  it('searches the body too', () => {
    const rows = [item(9, 'A beat', { body: 'They meet the smith' })];
    expect(filterTree(rows, 'beats', 'smith', none)).toHaveLength(1);
  });

  it('returns everything when there is nothing to filter by', () => {
    expect(countTree(filterTree(items, 'beats', '', none))).toBe(4);
  });

  it('stays inside its section', () => {
    expect(filterTree(items, 'prep', 'somewhere', none).map((i) => i.title))
      .toEqual(['Somewhere else']);
  });
});

describe('state filter', () => {
  it('narrows to the chosen states', () => {
    const t = filterTree(items, 'beats', '', new Set(['ready']));
    expect(t.map((i) => i.title)).toEqual(['The princess and the cat']);
  });

  it('keeps an ancestor so a deep match is still placed', () => {
    const t = filterTree(items, 'beats', '', new Set(['done']));
    expect(t[0].title).toBe('Ambush at the ford');
    expect(t[0]._context).toBe(true);
    expect(t[0].children[0].children[0].title).toBe('Grathul speaks');
  });

  it('combines with the text search', () => {
    expect(filterTree(items, 'beats', 'princess', new Set(['done']))).toEqual([]);
    expect(filterTree(items, 'beats', 'princess', new Set(['ready']))).toHaveLength(1);
  });
});

describe('hits', () => {
  it('is true for an empty query', () => {
    expect(hits(item(1, 'x'), [], new Set())).toBe(true);
  });
  it('survives a card with no body', () => {
    expect(hits(item(1, 'x', { body: null }), ['x'], new Set())).toBe(true);
  });
});
