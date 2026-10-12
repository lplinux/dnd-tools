/**
 * test/itemChain.test.js
 *
 * Evolving items: a card may name the card it grew out of, and a character's
 * inventory row points at whichever tier they currently hold.
 *
 * Two requirements carry the whole feature, and both are the kind that break
 * silently rather than loudly:
 *
 *   - **Players must never learn other tiers exist.** There is no tier column
 *     anywhere a player reads; the containment is that `INV_SELECT` lists the
 *     card columns explicitly and `evolves_from` is not among them. A later
 *     "tidy-up" adding it for symmetry would leak the whole chain with nothing
 *     failing, so that omission is asserted here.
 *   - **A cycle must be impossible.** The chain is walked in the browser, so
 *     A→B→A would hang the DM's tab rather than erroring.
 *
 * `chainLinkError` and friends only touch `pool` and `ownsItemCard`, so they
 * are lifted out of app.js and run against a stub — app.js calls `app.listen`
 * at import time and cannot be required.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function handlerCode(method, routePath) {
  const needle = `app.${method}('${routePath}'`;
  const start = source.indexOf(needle);
  expect(start, `route not found: ${method.toUpperCase()} ${routePath}`).toBeGreaterThan(-1);
  const end = source.indexOf('\n});', start);
  return source.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Lift the chain helpers and run them against a fake library.
 * `lib` is `{ id: { evolves_from, user_id } }`.
 */
function loadChain(lib) {
  const start = source.indexOf('const CHAIN_MAX');
  const fnStart = source.indexOf('async function chainLinkError', start);
  const end = source.indexOf('\n}\n', fnStart);
  const src = source.slice(start, end + 2);

  const pool = {
    query: async (sql, params) => {
      const row = lib[params[0]];
      if (!row || (params[1] !== undefined && row.user_id !== params[1])) return { rows: [] };
      return { rows: [{ evolves_from: row.evolves_from ?? null }] };
    },
  };
  const ownsItemCard = async (id, userId) => !!lib[id] && lib[id].user_id === userId;

  return new Function('pool', 'ownsItemCard', `${src}
    return { chainLinkError, chainRoot, sameChain, CHAIN_MAX };`)(pool, ownsItemCard);
}

/** Owner 1 holds a three-tier chain 1→2→3 and a lone card 9. Owner 2 holds 50. */
const LIB = {
  1: { evolves_from: null, user_id: 1 },
  2: { evolves_from: 1,    user_id: 1 },
  3: { evolves_from: 2,    user_id: 1 },
  9: { evolves_from: null, user_id: 1 },
  50: { evolves_from: null, user_id: 2 },
};

describe('the spoiler containment', () => {
  const invSelect = source.slice(source.indexOf('const INV_SELECT'),
                                 source.indexOf('`;', source.indexOf('const INV_SELECT')));

  it('does NOT send evolves_from to a player', () => {
    // The single most important assertion in this file. A player reads their
    // own inventory through INV_SELECT; anything listed there, they can see.
    expect(invSelect).not.toMatch(/evolves_from/);
  });

  it('still selects the card columns it is supposed to', () => {
    // A guard on the guard: if INV_SELECT were renamed or emptied, the
    // assertion above would pass vacuously.
    for (const col of ['card_name', 'card_rarity', 'card_abilities', 'card_weight']) {
      expect(invSelect).toContain(col);
    }
  });

  it('keeps every chain column on item_cards, never on inventory_items', () => {
    // INV_SELECT also does `i.*`, a wildcard over inventory_items — so a tier
    // column added to THAT table would reach players the day it migrated.
    const ddl = stripped.slice(stripped.indexOf('CREATE TABLE IF NOT EXISTS inventory_items'),
                               stripped.indexOf('CREATE TABLE IF NOT EXISTS pc_dm_notes'));
    expect(ddl).not.toMatch(/evolves_from|\btier\b|evolution/i);
    expect(stripped).not.toMatch(/ALTER TABLE inventory_items[\s\S]{0,120}evolves_from/);
  });

  it('exposes the chain only on the owner-scoped card routes', () => {
    // GET /api/item-cards is SELECT *, so evolves_from rides along — correct,
    // because that route is the card author reading their own library.
    const list = handlerCode('get', '/api/item-cards');
    expect(list).toMatch(/user_id=\$1/);
  });
});

describe('chainLinkError', () => {
  it('allows a legitimate link', async () => {
    const { chainLinkError } = loadChain(LIB);
    expect(await chainLinkError(1, 9, 1)).toBeNull();
  });

  it('allows no link at all', async () => {
    const { chainLinkError } = loadChain(LIB);
    expect(await chainLinkError(null, 2, 1)).toBeNull();
  });

  it('refuses a card evolving from itself', async () => {
    const { chainLinkError } = loadChain(LIB);
    expect(await chainLinkError(2, 2, 1)).toMatch(/itself/);
  });

  it('refuses a parent in someone else’s library', async () => {
    // Chains stay inside one library, like every other item-card rule.
    const { chainLinkError } = loadChain(LIB);
    expect(await chainLinkError(50, 2, 1)).toMatch(/Not your card/);
  });

  it('refuses a link that would close a loop', async () => {
    // 1 evolving from 3 would make 1→2→3→1. The walk happens in the browser,
    // so this is the difference between an error and a frozen tab.
    const { chainLinkError } = loadChain(LIB);
    expect(await chainLinkError(3, 1, 1)).toMatch(/loop/);
    expect(await chainLinkError(2, 1, 1)).toMatch(/loop/);
  });

  it('allows shortening a chain, which is not a loop', async () => {
    // Re-pointing tier 3 at tier 1 drops the middle. Legitimate.
    const { chainLinkError } = loadChain(LIB);
    expect(await chainLinkError(1, 3, 1)).toBeNull();
  });

  it('skips the cycle check when creating, since nothing can point at it yet', async () => {
    const { chainLinkError } = loadChain(LIB);
    expect(await chainLinkError(3, null, 1)).toBeNull();
  });

  it('terminates on a cycle already in the data', async () => {
    const looped = { 1: { evolves_from: 2, user_id: 1 }, 2: { evolves_from: 1, user_id: 1 } };
    const { chainLinkError } = loadChain(looped);
    await expect(chainLinkError(1, 9, 1)).resolves.toBeDefined();
  });
});

describe('sameChain', () => {
  it('is true across every tier of one chain, in both directions', async () => {
    const { sameChain } = loadChain(LIB);
    expect(await sameChain(1, 3, 1)).toBe(true);
    expect(await sameChain(3, 1, 1)).toBe(true);
    expect(await sameChain(2, 2, 1)).toBe(true);
  });

  it('is false for an unrelated card', async () => {
    const { sameChain } = loadChain(LIB);
    expect(await sameChain(1, 9, 1)).toBe(false);
  });
});

describe('the bump route', () => {
  const handler = handlerCode('put', '/api/pc/:playerId/inventory/:itemId/card');

  it('is DM-only', () => {
    const decl = source.slice(source.indexOf("app.put('/api/pc/:playerId/inventory/:itemId/card'"));
    expect(decl.slice(0, 120)).toMatch(/requireRole\(\['dm', 'admin'\]\)/);
  });

  it('checks access to the character and ownership of the card', () => {
    expect(handler).toMatch(/canAccessPC/);
    expect(handler).toMatch(/ownsItemCard/);
  });

  it('refuses a target outside the item’s own chain', () => {
    // Without this the route is a way to swap any granted item for any other
    // card while keeping the row, which would make the transfer trail a lie.
    expect(handler).toMatch(/sameChain\(current, target/);
    expect(handler).toMatch(/not another tier/);
  });

  it('refuses to touch a free-text row', () => {
    expect(handler).toMatch(/free-text item/);
  });

  it('reports the per-campaign collision rather than a raw 500', () => {
    expect(handler).toMatch(/23505/);
    expect(handler).toMatch(/already holds that tier/);
  });

  it('writes nothing but the pointer', () => {
    // The whole reversibility story: one column, so backwards is the same
    // call. If this ever also wrote a tier or a timestamp, "undo" stops being
    // symmetrical.
    // Bounded to the SQL itself: the 409 message further down legitimately
    // contains the word "tier".
    const from = handler.indexOf('UPDATE inventory_items');
    const update = handler.slice(from, handler.indexOf('`', from));
    expect(update).toMatch(/SET item_card_id = \$1, updated_at = CURRENT_TIMESTAMP/);
    expect(update).not.toMatch(/prev_player_id|tier|transferred_at/);
  });
});

describe('deleting a card heals the chain', () => {
  const handler = handlerCode('delete', '/api/item-cards/:id');

  it('re-points the children at the deleted card’s own parent', () => {
    // ON DELETE SET NULL alone would turn tier 3 into its own base tier, so a
    // three-tier chain silently becomes two chains.
    expect(handler).toMatch(/UPDATE item_cards SET evolves_from=\$1 WHERE evolves_from=\$2/);
  });

  it('does so before the delete, not after', () => {
    expect(handler.indexOf('UPDATE item_cards SET evolves_from'))
      .toBeLessThan(handler.indexOf('DELETE FROM item_cards'));
  });

  it('stays scoped to the owner', () => {
    const heal = handler.slice(handler.indexOf('UPDATE item_cards SET evolves_from'));
    expect(heal.slice(0, 200)).toMatch(/user_id=\$3/);
  });
});

describe('the schema', () => {
  it('adds evolves_from as an ALTER, not inside CREATE TABLE', () => {
    // A column added inside CREATE TABLE IF NOT EXISTS never reaches an
    // existing database — the migration bug this repo has already had once.
    expect(stripped).toMatch(/ALTER TABLE item_cards ADD COLUMN IF NOT EXISTS\s+evolves_from/);
    const create = stripped.slice(stripped.indexOf('CREATE TABLE IF NOT EXISTS item_cards'));
    expect(create.slice(0, create.indexOf(');'))).not.toMatch(/evolves_from/);
  });

  it('uses SET NULL, because RESTRICT would misreport through the DELETE handler', () => {
    expect(stripped).toMatch(/evolves_from INTEGER REFERENCES item_cards\(id\) ON DELETE SET NULL/);
  });

  it('indexes the column it looks rows up by', () => {
    expect(stripped).toMatch(/CREATE INDEX IF NOT EXISTS idx_item_cards_evolves_from/);
  });
});

describe('export and import carry the chain without carrying ids', () => {
  const exp = handlerCode('get', '/api/item-cards/export');
  const imp = handlerCode('post', '/api/item-cards/import');

  it('exports the parent as a position in the bundle, never a database id', () => {
    // A raw id means nothing after import: it would point at whatever card
    // holds that id in the importing library.
    expect(exp).toMatch(/evolves_from_ref/);
    expect(exp).toMatch(/version: 2/);
  });

  it('strips the raw column from the exported card', () => {
    expect(exp).toMatch(/evolves_from: parent, \.\.\.card/);
  });

  it('refuses to trust evolves_from coming in from a bundle', () => {
    // Otherwise a hand-edited file saying `evolves_from: 7` attaches the
    // imported card to whatever card 7 is in THIS library.
    expect(imp).toMatch(/vals\[CARD_COLS\.indexOf\('evolves_from'\)\] = null/);
  });

  it('links in a second pass, because a card may name a later one', () => {
    expect(imp).toMatch(/newIds/);
    expect(imp.indexOf('INSERT INTO item_cards'))
      .toBeLessThan(imp.indexOf('UPDATE item_cards SET evolves_from'));
  });

  it('drops a bad ref instead of failing the whole import', () => {
    expect(imp).toMatch(/ref < 0 \|\| ref >= newIds\.length \|\| ref === i\) continue/);
  });

  it('still runs in one transaction', () => {
    expect(imp).toMatch(/BEGIN/);
    expect(imp).toMatch(/COMMIT/);
    expect(imp).toMatch(/ROLLBACK/);
  });
});
