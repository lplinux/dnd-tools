/**
 * The flat-rows-to-tree step, which the server deliberately leaves to the
 * client so it does not have to choose a nesting depth.
 */
import { describe, it, expect } from 'vitest';
import { nest, sectionTree, stateOf, SECTIONS, STATES } from './constants';

const row = (id, parent_id = null, section = 'beats') => ({ id, parent_id, section });

describe('nest', () => {
  it('puts root items at the top', () => {
    expect(nest([row(1), row(2)]).map((r) => r.id)).toEqual([1, 2]);
  });

  it('hangs children off their parent', () => {
    const t = nest([row(1), row(2, 1)]);
    expect(t).toHaveLength(1);
    expect(t[0].children.map((c) => c.id)).toEqual([2]);
  });

  it('nests to any depth', () => {
    const t = nest([row(1), row(2, 1), row(3, 2)]);
    expect(t[0].children[0].children[0].id).toBe(3);
  });

  it('surfaces an orphan rather than dropping it', () => {
    // Losing a card because its parent is missing is worse than showing it
    // in the wrong place — at least the DM can see it and deal with it.
    expect(nest([row(5, 99)]).map((r) => r.id)).toEqual([5]);
  });

  it('does not mutate the rows it was given', () => {
    const rows = [row(1), row(2, 1)];
    nest(rows);
    expect(rows[0]).not.toHaveProperty('children');
  });

  it('keeps each section to itself', () => {
    const items = [row(1, null, 'beats'), row(2, null, 'prep')];
    expect(sectionTree(items, 'beats').map((r) => r.id)).toEqual([1]);
    expect(sectionTree(items, 'prep').map((r) => r.id)).toEqual([2]);
  });

  it('survives no items at all', () => {
    expect(sectionTree(undefined, 'beats')).toEqual([]);
    expect(nest(undefined)).toEqual([]);
  });
});

describe('the vocabulary matches the server', () => {
  it('four stored sections, in the order a session is used', () => {
    // `ongoing` is a view, not a section — it must not appear here, or the
    // UI would offer an "add" for something with nowhere to store it.
    expect(SECTIONS.map((s) => s.id)).toEqual(['recap', 'prep', 'beats', 'outcome']);
  });

  it('five states', () => {
    expect(STATES.map((s) => s.id).sort())
      .toEqual(['done', 'in-preparation', 'on-going', 'ready', 'skipped']);
  });

  it('an unknown state falls back rather than rendering blank', () => {
    expect(stateOf('nonsense').id).toBe('in-preparation');
    expect(stateOf(undefined).label).toBeTruthy();
  });
});
