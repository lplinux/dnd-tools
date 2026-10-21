/**
 * pages/ItemCards/chain.js
 *
 * Walking a chain of evolving item cards.
 *
 * A card may name the card it grew out of (`evolves_from`); NULL means it is a
 * base tier. Which tier a character actually holds is not stored anywhere —
 * it is which card their inventory row points at — so these functions only
 * ever describe the DM's library, never a player's item.
 *
 * All of it runs in the browser on purpose. `GET /api/item-cards` returns the
 * whole library unpaginated, so the chain is already in memory and no
 * recursive query is needed on the server for any of this.
 *
 * Every walk is bounded. The server rejects a link that would close a loop,
 * but a loop already in the data must not freeze the tab, so each function
 * carries its own guard rather than trusting that.
 */

/** Rows are `{ id, name, evolves_from, … }` as the API returns them. */
const index = (cards) => new Map((cards ?? []).map((c) => [c.id, c]));

/** The base tier of this card's chain — the card itself if it has no parent. */
export function baseOf(cards, cardId) {
  const by = index(cards);
  const seen = new Set();
  let at = by.get(cardId);
  while (at?.evolves_from != null && !seen.has(at.id)) {
    seen.add(at.id);
    const up = by.get(at.evolves_from);
    if (!up) break;          // parent not in this library: treat `at` as base
    at = up;
  }
  return at ?? null;
}

/**
 * The whole chain this card belongs to, base first.
 *
 * Depth-first from the base, so a straight chain comes back in tier order.
 * Branching (two cards evolving from the same parent) is not something the UI
 * offers, but the data model allows it, so it is flattened in pre-order rather
 * than treated as an error.
 */
export function chainOf(cards, cardId) {
  const base = baseOf(cards, cardId);
  if (!base) return [];
  const list = (cards ?? []);
  const out = [];
  const seen = new Set();
  const walk = (card) => {
    if (!card || seen.has(card.id)) return;
    seen.add(card.id);
    out.push(card);
    list.filter((c) => c.evolves_from === card.id).forEach(walk);
  };
  walk(base);
  return out;
}

/** True when this card is part of a chain of more than one tier. */
export function hasChain(cards, cardId) {
  return chainOf(cards, cardId).length > 1;
}

/** Where this card sits, 1-based, or 0 if it is not in the list. */
export function tierOf(cards, cardId) {
  return chainOf(cards, cardId).findIndex((c) => c.id === cardId) + 1;
}

/**
 * Everything downstream of this card, itself included.
 *
 * Used to keep the parent picker from offering a choice that would close a
 * loop: a card cannot evolve from something that already evolves from it. The
 * server rejects it anyway, but a dropdown that cannot offer the mistake is
 * better than an error after the fact.
 */
export function descendantIds(cards, cardId) {
  const list = (cards ?? []);
  const out = new Set([cardId]);
  const queue = [cardId];
  // Bounded by the number of cards: every id enters the queue at most once.
  while (queue.length) {
    const id = queue.shift();
    for (const c of list) {
      if (c.evolves_from === id && !out.has(c.id)) { out.add(c.id); queue.push(c.id); }
    }
  }
  return out;
}

/**
 * The cards that may be offered as "evolves from" for `cardId`.
 *
 * `cardId` is null when the card has not been saved yet, in which case nothing
 * can point at it and the whole library is eligible.
 */
export function parentOptions(cards, cardId) {
  if (cardId == null) return cards ?? [];
  const blocked = descendantIds(cards, cardId);
  return (cards ?? []).filter((c) => !blocked.has(c.id));
}

/**
 * The library as a display list: base tiers in their original order, each
 * followed by its own tiers.
 *
 * Cards whose parent is missing from the library still appear, as their own
 * base — losing a card from the list because its parent was deleted would be
 * worse than showing it unchained.
 */
export function groupByChain(cards) {
  const list = (cards ?? []);
  const by = index(list);
  const out = [];
  const placed = new Set();
  for (const card of list) {
    const base = baseOf(list, card.id);
    if (!base || placed.has(base.id)) continue;
    const chain = chainOf(list, base.id);
    chain.forEach((c, i) => {
      placed.add(c.id);
      out.push({ card: c, tier: chain.length > 1 ? i + 1 : 0, of: chain.length });
    });
  }
  // Anything the walk missed — only reachable if the data holds a cycle.
  for (const card of list) {
    if (!placed.has(card.id)) out.push({ card, tier: 0, of: 1 });
  }
  return out.filter((e) => by.has(e.card.id));
}

/**
 * The library as rarity groups, each holding one entry per item.
 *
 * An "item" here is a whole chain, not a card: a three-tier sword is one entry
 * with two hidden tiers, so the list reads as the things you own rather than
 * as 69 rows of which 27 are the same nine swords.
 *
 * Filtering is per ENTRY, not per card, and matches if any tier matches —
 * searching for a tier-3 name finds the item rather than hiding it behind a
 * base tier called something else.
 *
 * `rarityOrder` fixes the group order (the RARITIES list, common → artifact)
 * rather than letting it fall out of the data. Anything whose rarity is not in
 * that list still appears, in a trailing group: a card must never disappear
 * from the library because of an unexpected value.
 */
export function libraryGroups(cards, { query = '', rarity = '' } = {}, rarityOrder = []) {
  const list = cards ?? [];
  const q = query.trim().toLowerCase();
  const match = (c) => {
    if (rarity && c.rarity !== rarity) return false;
    if (!q) return true;
    return `${c.name ?? ''} ${c.type ?? ''}`.toLowerCase().includes(q);
  };

  const seen = new Set();
  const entries = [];
  for (const c of list) {
    const base = baseOf(list, c.id);
    if (!base || seen.has(base.id)) continue;
    const chain = chainOf(list, base.id);
    chain.forEach((x) => seen.add(x.id));
    if (!chain.some(match)) continue;
    entries.push({ base, tiers: chain.slice(1), size: chain.length });
  }
  entries.sort((a, b) => (a.base.name || '').localeCompare(b.base.name || ''));

  const order = rarityOrder.length
    ? rarityOrder
    : [...new Set(entries.map((e) => e.base.rarity))];
  const groups = [];
  for (const r of order) {
    const items = entries.filter((e) => e.base.rarity === r);
    if (items.length) {
      groups.push({ rarity: r, items, count: items.reduce((n, e) => n + e.size, 0) });
    }
  }
  const known = new Set(order);
  const rest = entries.filter((e) => !known.has(e.base.rarity));
  if (rest.length) {
    groups.push({ rarity: null, items: rest, count: rest.reduce((n, e) => n + e.size, 0) });
  }
  return groups;
}

/**
 * The fields a bundle card carries. Kept in step with CARD_COLS in app.js,
 * minus `evolves_from` — a bundle names a parent by POSITION, never by id,
 * because ids mean nothing in another user's library.
 */
const BUNDLE_FIELDS = [
  'name', 'type', 'rarity', 'flavor', 'abilities', 'attunement',
  'damage', 'damage_type', 'properties', 'mastery', 'ac_bonus', 'armor_type',
  'uses', 'weight',
];

/**
 * An `item-cards` bundle (version 2) for a selection of cards.
 *
 * Built here rather than on the server because the whole library is already in
 * memory — there is nothing to ask for. It mirrors what
 * `GET /api/item-cards/export` produces, including the one rule that matters:
 *
 * **Chain-complete.** Selecting one tier exports all of them. A lone tier 2
 * would import as a chainless orphan, and the tier buttons would simply never
 * appear on the far side — the same reason the campaign export walks whole
 * chains.
 */
export function buildExportBundle(cards, ids) {
  const list = cards ?? [];
  const want = ids instanceof Set ? ids : new Set(ids ?? []);

  // Expand the selection to every tier of every chain it touches.
  const members = new Map();
  for (const c of list) {
    if (!want.has(c.id)) continue;
    for (const m of chainOf(list, c.id)) members.set(m.id, m);
  }

  const out = [...members.values()];
  const posById = new Map(out.map((c, i) => [c.id, i]));
  return {
    type: 'item-cards',
    version: 2,
    exported_at: new Date().toISOString(),
    cards: out.map((c) => {
      const card = {};
      for (const f of BUNDLE_FIELDS) card[f] = c[f] ?? null;
      const ref = c.evolves_from == null ? undefined : posById.get(c.evolves_from);
      return ref === undefined ? card : { ...card, evolves_from_ref: ref };
    }),
  };
}

/**
 * Unique PNG filenames for a batch of cards, in the order given.
 *
 * Needed because every tier of a chain deliberately shares one name — the
 * whole reason a player holding tier 2 cannot tell tiers 1 and 3 exist. Three
 * cards called "Tidecaller" would produce one filename three times, and a ZIP
 * silently keeps the last. The tier number disambiguates them in a way that
 * reads correctly on disk:
 *
 *     tidecaller.png · tidecaller-2.png · tidecaller-3.png
 *
 * Anything else that still collides — two unrelated cards with the same name,
 * or a card literally named "Tidecaller 2" — falls back to a counter, so the
 * function never returns the same name twice whatever it is given.
 *
 * `slug` is passed in rather than imported so this module stays free of the
 * download layer; the caller hands it `slugify` from api/downloadBundle.
 */
export function pngNames(cards, rows, slug) {
  const used = new Map();
  return (rows ?? []).map((row) => {
    const base = slug(row?.name || 'card') || 'card';
    const tier = hasChain(cards, row?.id) ? tierOf(cards, row.id) : 0;
    let name = tier > 1 ? `${base}-${tier}` : base;
    const seen = (used.get(name) ?? 0) + 1;
    used.set(name, seen);
    if (seen > 1) name = `${name}-${seen}`;
    return `${name}.png`;
  });
}
