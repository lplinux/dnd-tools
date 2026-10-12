/**
 * pages/Diary/groupedEntries.test.js
 *
 * `groupEntries` backs both the Diary and the Campaign Journal, and the
 * journal leans on it harder: the server returns entries already in in-game
 * date order, and grouping must not quietly reshuffle them.
 */
import { describe, it, expect } from 'vitest';
import { groupEntries } from './GroupedEntries';

const e = (id, category) => ({ id, category, title: `#${id}` });

describe('groupEntries', () => {
  it('keeps each group in the order the entries arrived', () => {
    // The journal is read in date order; a group that re-sorted its own
    // contents would silently rewrite the campaign's chronology.
    const groups = groupEntries(
      [e(1, 'Documents'), e(2, 'Rumours'), e(3, 'Documents')],
      'category',
    );
    expect(groups.map((g) => g.label)).toEqual(['Documents', 'Rumours']);
    expect(groups[0].items.map((x) => x.id)).toEqual([1, 3]);
  });

  it('orders the groups by where each first appears', () => {
    const groups = groupEntries([e(1, 'Zeta'), e(2, 'Alpha')], 'category');
    expect(groups.map((g) => g.label)).toEqual(['Zeta', 'Alpha']);
  });

  it('collects the unfiled at the end, under no label', () => {
    const groups = groupEntries([e(1, null), e(2, 'Documents'), e(3, '  ')], 'category');
    const last = groups[groups.length - 1];
    expect(last.label).toBeNull();
    expect(last.items.map((x) => x.id)).toEqual([1, 3]);
  });

  it('treats whitespace as no category at all', () => {
    expect(groupEntries([e(1, '   ')], 'category')[0].label).toBeNull();
  });

  it('trims, so " Documents" and "Documents" are one group', () => {
    const groups = groupEntries([e(1, 'Documents'), e(2, ' Documents ')], 'category');
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it('groups by a function, for a value that is not a column', () => {
    // The journal's "who wrote it" is a character name falling back to a
    // username; there is no single field holding it.
    const rows = [
      { id: 1, author_character: 'Thalia', author_username: 'p1' },
      { id: 2, author_character: null, author_username: 'dm1' },
      { id: 3, author_character: 'Thalia', author_username: 'p1' },
    ];
    const groups = groupEntries(rows, (x) => x.author_character || x.author_username);
    expect(groups.map((g) => g.label)).toEqual(['Thalia', 'dm1']);
    expect(groups[0].items.map((x) => x.id)).toEqual([1, 3]);
  });

  it('sorts the groups alphabetically when asked', () => {
    // Grouping by owner or location, first-appearance order is noise — the
    // same names should sit in the same places every time.
    const groups = groupEntries([e(1, 'Zeta'), e(2, 'alpha'), e(3, 'Mu')],
      'category', { sortGroups: true });
    expect(groups.map((g) => g.label)).toEqual(['alpha', 'Mu', 'Zeta']);
  });

  it('still keeps the unfiled last when sorting alphabetically', () => {
    const groups = groupEntries([e(1, null), e(2, 'Zeta'), e(3, 'Alpha')],
      'category', { sortGroups: true });
    expect(groups.map((g) => g.label)).toEqual(['Alpha', 'Zeta', null]);
  });

  it('leaves order alone by default', () => {
    const groups = groupEntries([e(1, 'Zeta'), e(2, 'Alpha')], 'category');
    expect(groups.map((g) => g.label)).toEqual(['Zeta', 'Alpha']);
  });

  it('returns nothing for an empty list', () => {
    // Which is why the component falls back to the flat list here: that is the
    // only branch that renders the "nothing yet" text.
    expect(groupEntries([], 'category')).toEqual([]);
  });
});
