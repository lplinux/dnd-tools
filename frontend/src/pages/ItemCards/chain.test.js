/**
 * chain.js — walking a chain of evolving item cards.
 *
 * Two things here are worth more than the rest. The **bounded walks**: the
 * server refuses to store a cycle, but a cycle that somehow got in must not
 * freeze the DM's browser, and an unguarded `while` here would. And
 * **parentOptions**, which is what stops the dropdown offering a choice that
 * would make one in the first place.
 */
import { describe, it, expect } from 'vitest';
import {
  baseOf, chainOf, hasChain, tierOf, descendantIds, parentOptions, groupByChain,
  libraryGroups, buildExportBundle, pngNames,
} from './chain';

/** A three-tier chain, a two-tier chain, and a lone card. */
const card = (id, name, evolves_from = null) => ({ id, name, evolves_from });
const LIB = [
  card(1, 'Tidecaller'),
  card(2, 'Tidecaller, Woken', 1),
  card(3, 'Tidecaller, Drowned', 2),
  card(10, 'Ashen Cloak'),
  card(11, 'Ashen Cloak, Kindled', 10),
  card(20, 'Ordinary Lantern'),
];

describe('baseOf', () => {
  it('walks up to the base tier', () => {
    expect(baseOf(LIB, 3).id).toBe(1);
    expect(baseOf(LIB, 2).id).toBe(1);
  });

  it('returns the card itself when it is already the base', () => {
    expect(baseOf(LIB, 1).id).toBe(1);
    expect(baseOf(LIB, 20).id).toBe(20);
  });

  it('stops at a parent that is not in the library', () => {
    // The parent was deleted elsewhere, or this is a partial list. Treating
    // the orphan as a base beats returning null and losing the card.
    expect(baseOf([card(5, 'Orphan', 99)], 5).id).toBe(5);
  });

  it('returns null for an unknown id', () => {
    expect(baseOf(LIB, 404)).toBeNull();
  });

  it('terminates on a cycle instead of hanging', () => {
    const loop = [card(1, 'A', 2), card(2, 'B', 1)];
    expect(() => baseOf(loop, 1)).not.toThrow();
    expect(baseOf(loop, 1)).toBeTruthy();
  });
});

describe('chainOf', () => {
  it('returns the whole chain base-first, from any member', () => {
    expect(chainOf(LIB, 3).map((c) => c.id)).toEqual([1, 2, 3]);
    expect(chainOf(LIB, 1).map((c) => c.id)).toEqual([1, 2, 3]);
    expect(chainOf(LIB, 2).map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('returns a single-card chain for an unchained item', () => {
    expect(chainOf(LIB, 20).map((c) => c.id)).toEqual([20]);
  });

  it('keeps chains apart', () => {
    expect(chainOf(LIB, 11).map((c) => c.id)).toEqual([10, 11]);
  });

  it('flattens a branch rather than failing on it', () => {
    // Two cards evolving from one parent. The UI never offers this, but the
    // data model allows it and it must not produce an empty or infinite list.
    const branched = [card(1, 'A'), card(2, 'B', 1), card(3, 'C', 1)];
    expect(chainOf(branched, 1).map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('terminates on a cycle', () => {
    const loop = [card(1, 'A', 2), card(2, 'B', 1)];
    expect(chainOf(loop, 1).length).toBeLessThanOrEqual(2);
  });
});

describe('hasChain and tierOf', () => {
  it('knows a chained card from a lone one', () => {
    expect(hasChain(LIB, 2)).toBe(true);
    expect(hasChain(LIB, 20)).toBe(false);
  });

  it('numbers tiers from 1', () => {
    expect(tierOf(LIB, 1)).toBe(1);
    expect(tierOf(LIB, 3)).toBe(3);
    expect(tierOf(LIB, 20)).toBe(1);
  });

  it('returns 0 for a card not in the list', () => {
    expect(tierOf(LIB, 404)).toBe(0);
  });
});

describe('descendantIds', () => {
  it('collects everything downstream, itself included', () => {
    expect([...descendantIds(LIB, 1)].sort()).toEqual([1, 2, 3]);
    expect([...descendantIds(LIB, 2)].sort()).toEqual([2, 3]);
    expect([...descendantIds(LIB, 3)]).toEqual([3]);
  });

  it('terminates on a cycle', () => {
    const loop = [card(1, 'A', 2), card(2, 'B', 1)];
    expect(() => descendantIds(loop, 1)).not.toThrow();
  });
});

describe('parentOptions', () => {
  it('cannot offer a choice that would close a loop', () => {
    // Tier 1 must not be allowed to evolve from tier 2 or 3.
    const ids = parentOptions(LIB, 1).map((c) => c.id);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(3);
    expect(ids).toEqual([10, 11, 20]);
  });

  it('offers upstream tiers, which are legitimate', () => {
    // Tier 3 re-pointing at tier 1 is a valid edit — it shortens the chain.
    expect(parentOptions(LIB, 3).map((c) => c.id)).toContain(1);
  });

  it('offers the whole library for a card not yet saved', () => {
    expect(parentOptions(LIB, null)).toHaveLength(LIB.length);
  });
});

describe('groupByChain', () => {
  it('lists each chain together, base first', () => {
    expect(groupByChain(LIB).map((e) => e.card.id)).toEqual([1, 2, 3, 10, 11, 20]);
  });

  it('marks tier position only for cards that are actually in a chain', () => {
    const g = groupByChain(LIB);
    expect(g.find((e) => e.card.id === 2)).toMatchObject({ tier: 2, of: 3 });
    expect(g.find((e) => e.card.id === 20)).toMatchObject({ tier: 0, of: 1 });
  });

  it('lists every card exactly once', () => {
    const ids = groupByChain(LIB).map((e) => e.card.id);
    expect(new Set(ids).size).toBe(LIB.length);
  });

  it('does not drop a card whose parent is missing', () => {
    const partial = [card(5, 'Orphan', 99), card(6, 'Lone')];
    expect(groupByChain(partial).map((e) => e.card.id).sort()).toEqual([5, 6]);
  });

  it('loses nothing even if the data holds a cycle', () => {
    const loop = [card(1, 'A', 2), card(2, 'B', 1), card(3, 'C')];
    const ids = groupByChain(loop).map((e) => e.card.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('libraryGroups', () => {
  const ORDER = ['common', 'uncommon', 'rare', 'veryrare', 'legendary', 'artifact'];
  const c = (id, name, rarity, evolves_from = null, type = '') =>
    ({ id, name, rarity, evolves_from, type });
  const LIB2 = [
    c(1, 'Tidecaller', 'veryrare'),
    c(2, 'Tidecaller, Woken', 'veryrare', 1),
    c(3, 'Tidecaller, Drowned', 'veryrare', 2),
    c(10, 'Ashen Cloak', 'rare'),
    c(20, 'Zephyr Boots', 'common', null, 'Wondrous Item'),
    c(21, 'Antitoxin', 'common', null, 'Consumable'),
  ];

  it('makes one entry per chain, not one per card', () => {
    const g = libraryGroups(LIB2, {}, ORDER);
    const entries = g.flatMap((x) => x.items);
    expect(entries).toHaveLength(4);                 // 6 cards, 4 items
    const tide = entries.find((e) => e.base.id === 1);
    expect(tide.tiers.map((t) => t.id)).toEqual([2, 3]);
    expect(tide.size).toBe(3);
  });

  it('groups by rarity in the given order, not the data order', () => {
    expect(libraryGroups(LIB2, {}, ORDER).map((g) => g.rarity))
      .toEqual(['common', 'rare', 'veryrare']);
  });

  it('sorts entries by name within a group', () => {
    const common = libraryGroups(LIB2, {}, ORDER)[0];
    expect(common.items.map((e) => e.base.name)).toEqual(['Antitoxin', 'Zephyr Boots']);
  });

  it('counts cards, not entries, so a group total matches the library', () => {
    const g = libraryGroups(LIB2, {}, ORDER);
    expect(g.reduce((n, x) => n + x.count, 0)).toBe(LIB2.length);
  });

  it('finds an item by a name only one of its tiers has', () => {
    // "Drowned" is tier 3's name. Hiding the item would be wrong.
    const g = libraryGroups(LIB2, { query: 'drowned' }, ORDER);
    expect(g.flatMap((x) => x.items).map((e) => e.base.name)).toEqual(['Tidecaller']);
  });

  it('matches on type as well as name', () => {
    const g = libraryGroups(LIB2, { query: 'consumable' }, ORDER);
    expect(g.flatMap((x) => x.items).map((e) => e.base.name)).toEqual(['Antitoxin']);
  });

  it('filters by rarity', () => {
    const g = libraryGroups(LIB2, { rarity: 'rare' }, ORDER);
    expect(g).toHaveLength(1);
    expect(g[0].items[0].base.name).toBe('Ashen Cloak');
  });

  it('returns no groups when nothing matches', () => {
    expect(libraryGroups(LIB2, { query: 'nothing here' }, ORDER)).toEqual([]);
  });

  it('never loses a card to an unexpected rarity', () => {
    const odd = [...LIB2, c(99, 'Mystery', 'mythic')];
    const g = libraryGroups(odd, {}, ORDER);
    const names = g.flatMap((x) => x.items).map((e) => e.base.name);
    expect(names).toContain('Mystery');
    expect(g[g.length - 1].rarity).toBeNull();
  });

  it('copes with an empty library', () => {
    expect(libraryGroups([], {}, ORDER)).toEqual([]);
    expect(libraryGroups(null, {}, ORDER)).toEqual([]);
  });
});

describe('buildExportBundle', () => {
  const c = (id, name, rarity = 'rare', evolves_from = null) =>
    ({ id, name, rarity, type: 'Weapon', evolves_from, flavor: null, abilities: null,
       attunement: false, damage: null, damage_type: null, properties: null,
       ac_bonus: null, armor_type: null, uses: null, weight: null });
  const LIB3 = [
    c(1, 'Tidecaller'), c(2, 'Tidecaller', 'rare', 1), c(3, 'Tidecaller', 'rare', 2),
    c(10, 'Ashen Cloak'),
  ];

  it('emits a version 2 item-cards bundle', () => {
    const b = buildExportBundle(LIB3, [10]);
    expect(b.type).toBe('item-cards');
    expect(b.version).toBe(2);
    expect(b.cards).toHaveLength(1);
  });

  it('exports the whole chain when one tier is selected', () => {
    // A lone tier 2 would import as a chainless orphan and the tier buttons
    // would never appear.
    const b = buildExportBundle(LIB3, [2]);
    expect(b.cards).toHaveLength(3);
  });

  it('links the chain by position, never by id', () => {
    const b = buildExportBundle(LIB3, [1]);
    expect(b.cards[0].evolves_from_ref).toBeUndefined();
    expect(b.cards[1].evolves_from_ref).toBe(0);
    expect(b.cards[2].evolves_from_ref).toBe(1);
    for (const card of b.cards) {
      expect(card).not.toHaveProperty('id');
      expect(card).not.toHaveProperty('evolves_from');
      expect(card).not.toHaveProperty('user_id');
    }
  });

  it('does not duplicate a chain when several of its tiers are selected', () => {
    expect(buildExportBundle(LIB3, [1, 2, 3]).cards).toHaveLength(3);
  });

  it('carries every field the server round-trips', () => {
    const b = buildExportBundle(LIB3, [10]);
    for (const f of ['name', 'type', 'rarity', 'flavor', 'abilities', 'attunement',
      'damage', 'damage_type', 'properties', 'ac_bonus', 'armor_type', 'uses', 'weight']) {
      expect(b.cards[0]).toHaveProperty(f);
    }
  });

  it('returns an empty bundle for an empty selection', () => {
    expect(buildExportBundle(LIB3, []).cards).toEqual([]);
    expect(buildExportBundle(LIB3, null).cards).toEqual([]);
  });

  it('accepts a Set as well as an array', () => {
    expect(buildExportBundle(LIB3, new Set([10])).cards).toHaveLength(1);
  });
});

describe('pngNames', () => {
  const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const c = (id, name, evolves_from = null) => ({ id, name, evolves_from });
  const LIB4 = [
    c(1, 'Tidecaller'), c(2, 'Tidecaller', 1), c(3, 'Tidecaller', 2),
    c(10, 'Ashen Cloak'),
  ];

  it('numbers the tiers of a chain rather than colliding', () => {
    // All three share a name by design; a ZIP would keep one.
    const rows = [LIB4[0], LIB4[1], LIB4[2]];
    expect(pngNames(LIB4, rows, slug))
      .toEqual(['tidecaller.png', 'tidecaller-2.png', 'tidecaller-3.png']);
  });

  it('leaves an unchained card unnumbered', () => {
    expect(pngNames(LIB4, [LIB4[3]], slug)).toEqual(['ashen-cloak.png']);
  });

  it('numbers a tier correctly even when exported alone', () => {
    expect(pngNames(LIB4, [LIB4[2]], slug)).toEqual(['tidecaller-3.png']);
  });

  it('falls back to a counter for two unrelated cards of the same name', () => {
    const lib = [c(1, 'Dagger'), c(2, 'Dagger')];
    expect(pngNames(lib, lib, slug)).toEqual(['dagger.png', 'dagger-2.png']);
  });

  it('never returns the same name twice, however contrived the input', () => {
    // A tier-2 named "Tidecaller" and a card literally named "Tidecaller 2".
    const lib = [c(1, 'Tidecaller'), c(2, 'Tidecaller', 1), c(9, 'Tidecaller 2')];
    const names = pngNames(lib, lib, slug);
    expect(new Set(names).size).toBe(names.length);
  });

  it('copes with a nameless card', () => {
    expect(pngNames([], [{ id: 1, name: '' }], slug)).toEqual(['card.png']);
  });

  it('returns nothing for nothing', () => {
    expect(pngNames([], [], slug)).toEqual([]);
    expect(pngNames([], null, slug)).toEqual([]);
  });
});
