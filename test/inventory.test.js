/**
 * test/inventory.test.js
 *
 * The inventory has three rules that are easy to state and easy to lose:
 *
 *   1. An item card is "reusable on any campaign, but only once per campaign."
 *      Enforced by a PARTIAL unique index, not a pre-check — a pre-check races.
 *   2. Quantities belong to free-text gear only. A granted magic item is one
 *      artifact, not a stack.
 *   3. Only the DM can grant a card-linked item, and only the DM can take one
 *      away. A player manages their own gear and may pass items on.
 *
 * And one thing that must NOT have happened: granting an item must not have
 * widened access to the DM's item_cards library. The card's fields are joined
 * into the inventory response instead.
 *
 * As with the other backend suites, these read app.js as text.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const source = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app.js'),
  'utf8',
);

function handlerBody(method, routePath) {
  const needle = `app.${method}('${routePath}'`;
  const start = source.indexOf(needle);
  expect(start, `route not found: ${method.toUpperCase()} ${routePath}`).toBeGreaterThan(-1);
  const end = source.indexOf('\n});', start);
  expect(end, `unterminated handler: ${routePath}`).toBeGreaterThan(start);
  return source.slice(start, end);
}
const handlerCode = (m, p) => handlerBody(m, p)
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').replace(/\/\/[^\n]*/g, '');

/**
 * The CREATE TABLE statement, sliced to its real end rather than a fixed
 * character count — the table has already grown once (weight, category) and a
 * fixed window silently dropped the last CHECK out of view, passing the test
 * for the wrong reason until it happened to fail.
 */
const ddl = (() => {
  const start = source.indexOf('CREATE TABLE IF NOT EXISTS inventory_items');
  expect(start, 'inventory_items DDL not found').toBeGreaterThan(-1);
  const end = source.indexOf('\n      );', start);
  expect(end, 'unterminated inventory_items DDL').toBeGreaterThan(start);
  return source.slice(start, end);
})();

describe('schema enforces the rules, not just the handlers', () => {
  /**
   * The CHECKs live in named, idempotent migrations rather than inline in the
   * CREATE TABLE — an inline constraint is invisible to a database that already
   * has the table, exactly as an inline column is. Asserting on the migration
   * list is therefore asserting the thing that actually reaches every install.
   */
  it('a row is either card-linked or named, never neither', () => {
    expect(source).toContain("['inventory_items_kind',         \"item_card_id IS NOT NULL OR (name IS NOT NULL AND name <> '')\"]");
  });

  it('a card-linked row cannot carry a quantity', () => {
    expect(source).toContain("['inventory_items_card_qty',     'item_card_id IS NULL OR quantity = 1']");
  });

  it('quantity cannot go below 1', () => {
    expect(source).toContain("['inventory_items_qty_positive', 'quantity >= 1']");
  });

  it('no CHECK is left inline, where an existing database would never see it', () => {
    expect(ddl).not.toMatch(/\bCHECK\b/);
  });

  it('"only once per campaign" is a partial unique index on card-linked rows', () => {
    const idx = source.slice(
      source.indexOf('idx_inventory_card_once_per_campaign') - 200,
      source.indexOf('idx_inventory_card_once_per_campaign') + 320,
    );
    expect(idx).toContain('UNIQUE INDEX');
    expect(idx).toMatch(/ON inventory_items \(campaign_id, item_card_id\)/);
    // The WHERE is what lets two players both carry rope.
    expect(idx).toMatch(/WHERE item_card_id IS NOT NULL/);
  });

  it('deleting a card that is in play fails loudly rather than silently', () => {
    expect(ddl).toMatch(/item_card_id INTEGER REFERENCES item_cards\(id\) ON DELETE RESTRICT/);
  });

  it('category is constrained to the four panels of the sheet', () => {
    expect(ddl).toMatch(/category\s+VARCHAR\(20\) NOT NULL DEFAULT 'inventory'/);
    expect(source).toContain("['inventory_items_category',     \"category IN ('inventory','treasure','potions','misc')\"]");
  });

  it('weight is fractional — a vial is 0.5 lb, not 1', () => {
    expect(ddl).toMatch(/weight\s+NUMERIC\(8,2\)/);
    expect(source).toMatch(/ALTER TABLE item_cards ADD COLUMN IF NOT EXISTS weight NUMERIC\(8,2\)/);
  });

  /**
   * The bug this exists for: `category` and `weight` were added to the CREATE
   * TABLE only. On any install that already had inventory_items, CREATE TABLE
   * IF NOT EXISTS is a no-op, so the columns never appeared and adding an item
   * failed with `column "category" ... does not exist`.
   *
   * A scratch database cannot catch it — there, CREATE TABLE always runs. So
   * the rule is asserted statically instead: any column added after a table's
   * first release must ALSO have an ALTER.
   */
  it('columns added after the table shipped have real ALTER migrations', () => {
    for (const col of ['category', 'weight']) {
      expect(
        source,
        `inventory_items.${col} is in CREATE TABLE but has no ALTER — existing databases will not get it`,
      ).toMatch(new RegExp(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS ${col}\\b`));
    }
  });

  it('carry capacity is an override, so it must be nullable', () => {
    expect(source).toMatch(/ALTER TABLE pc_characters ADD COLUMN IF NOT EXISTS carry_capacity NUMERIC\(8,2\);/);
    // No NOT NULL and no DEFAULT: NULL is the signal to derive it from STR.
    expect(source).not.toMatch(/carry_capacity NUMERIC\(8,2\)\s+(NOT NULL|DEFAULT)/);
  });

  it('inventory belongs to a character, not a user account', () => {
    expect(ddl).toMatch(/player_id\s+INTEGER NOT NULL REFERENCES campaign_players\(id\)/);
    expect(ddl).not.toMatch(/user_id\s+INTEGER NOT NULL/);
  });
});

describe('granting', () => {
  const body = handlerCode('post', '/api/pc/:playerId/inventory/assign');

  it('is DM-only', () => {
    expect(handlerBody('post', '/api/pc/:playerId/inventory/assign'))
      .toContain("requireRole(['dm', 'admin'])");
  });

  it('grants only from the caller\'s own library', () => {
    expect(body).toContain('ownsItemCard');
  });

  it('lets the unique index report the duplicate rather than pre-checking', () => {
    // A SELECT-then-INSERT would let two simultaneous grants both pass.
    expect(body).toContain("23505");
    expect(body).toMatch(/status\(409\)/);
  });
});

describe('a player cannot mint a magic item', () => {
  it('the add route never writes item_card_id', () => {
    const body = handlerCode('post', '/api/pc/:playerId/inventory');
    expect(body).toContain('INSERT INTO inventory_items');
    expect(body).not.toContain('item_card_id');
  });

  it('the edit route leaves a card-linked row\'s name and quantity alone', () => {
    const body = handlerCode('put', '/api/pc/:playerId/inventory/:itemId');
    expect(body).toContain('item_card_id');          // it reads the kind…
    expect(body).toMatch(/CASE WHEN \$1::boolean THEN name/);   // …and branches on it
    expect(body).toMatch(/CASE WHEN \$1::boolean THEN 1\s+ELSE/);
  });

  it('only the DM can remove a granted item', () => {
    const body = handlerCode('delete', '/api/pc/:playerId/inventory/:itemId');
    expect(body).toContain('isDmRole(req.session.role)');
    expect(body).toMatch(/status\(403\)/);
  });
});

describe('giving', () => {
  const body = handlerCode('post', '/api/pc/:playerId/inventory/:itemId/give');

  it('refuses a transfer across campaigns', () => {
    // Otherwise an item could be walked into another campaign, which is both a
    // continuity break and a way around "only once per campaign".
    expect(body).toMatch(/String\(from\) !== String\(to\)/);
  });

  it('records where it came from', () => {
    expect(body).toContain('prev_player_id');
    expect(body).toContain('transferred_at');
  });

  it('only moves a row the giver actually holds', () => {
    expect(body).toMatch(/WHERE id = \$3 AND player_id = \$2/);
  });
});

describe('every inventory route is access-checked', () => {
  const ROUTES = [
    ['get', '/api/pc/:playerId/inventory'],
    ['post', '/api/pc/:playerId/inventory'],
    ['put', '/api/pc/:playerId/inventory/:itemId'],
    ['delete', '/api/pc/:playerId/inventory/:itemId'],
    ['post', '/api/pc/:playerId/inventory/assign'],
    ['post', '/api/pc/:playerId/inventory/:itemId/give'],
  ];
  it.each(ROUTES)('%s %s calls canAccessPC', (method, routePath) => {
    expect(handlerCode(method, routePath)).toContain('canAccessPC');
  });
});

describe('weight is single-sourced', () => {
  it('a card-linked row stores no weight of its own', () => {
    // Two places to set one number is how they drift apart; the card owns it.
    const body = handlerCode('put', '/api/pc/:playerId/inventory/:itemId');
    expect(body).toMatch(/weight\s+= CASE WHEN \$1::boolean THEN NULL ELSE/);
  });

  it('the list exposes the card\'s weight for the carry total', () => {
    expect(source).toMatch(/c\.weight\s+AS card_weight/);
  });
});

describe('carry capacity is derived, never stored', () => {
  /**
   * Maximum Carry Weight is STR x 15 and nothing else. A manual override
   * briefly existed and was removed: a second, editable copy of a derived
   * number is only a way for the two to disagree. The column survives (a
   * destructive migration to drop a nullable column nobody writes is not worth
   * the risk) but nothing may read or write it.
   */
  it('no route sets it', () => {
    expect(source).not.toContain('carry-capacity');
  });

  it('nothing writes the column', () => {
    expect(source).not.toMatch(/SET\s+carry_capacity/);
    expect(source).not.toMatch(/INSERT[^;]*carry_capacity/);
  });
});

describe('attunement', () => {
  it('separates "needs attuning" from "is attuned"', () => {
    // Two different questions. requires_attunement is a property of the item;
    // attuned is this character's state. Collapsing them would make it
    // impossible to show an unattuned magic item as needing attention.
    expect(ddl).toMatch(/attuned\s+BOOLEAN NOT NULL DEFAULT false/);
    expect(ddl).toMatch(/requires_attunement BOOLEAN NOT NULL DEFAULT false/);
  });

  it('both reach an existing database via ALTER', () => {
    for (const col of ['attuned', 'requires_attunement']) {
      expect(
        source,
        `inventory_items.${col} has no ALTER — existing databases will not get it`,
      ).toMatch(new RegExp(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS ${col}\\b`));
    }
  });

  it("a card-linked row cannot override the card's attunement requirement", () => {
    expect(handlerCode('put', '/api/pc/:playerId/inventory/:itemId'))
      .toMatch(/requires_attunement = CASE WHEN \$1::boolean THEN false/);
  });
});

describe('attunement follows equipping', () => {
  const body = handlerCode('put', '/api/pc/:playerId/inventory/:itemId');

  /**
   * The rule has to fire on the TRANSITION, not on every write. Deriving
   * `attuned` from `equipped` unconditionally would make the manual badge
   * useless — the next save of any unrelated field would reset whatever it
   * had set. That is the one subtlety worth pinning.
   */
  it('reads the previous equipped state so it can see a change', () => {
    expect(body).toContain('i.equipped');
    expect(body).toMatch(/equippedChanged\s*=\s*!!equipped !== !!row\.equipped/);
  });

  it('follows equipped on a change, and honours the override otherwise', () => {
    expect(body).toMatch(/equippedChanged \? !!equipped : !!attuned/);
  });

  it('never attunes something that does not require it', () => {
    // A torch does not become attuned by being held.
    expect(body).toMatch(/: false;\s*$/m);
    expect(body).toContain('rowNeedsAttunement');
  });

  it('a card-linked row takes the requirement from its card', () => {
    expect(body).toContain('card_attunement');
    const fn = source.slice(
      source.indexOf('const rowNeedsAttunement'),
      source.indexOf('const rowNeedsAttunement') + 300,
    );
    expect(fn).toContain('card_attunement');
    expect(fn).toContain('requires_attunement');
  });
});

describe('the 3-item attunement limit', () => {
  it('is a single constant, enforced server-side', () => {
    expect(source).toMatch(/const ATTUNEMENT_LIMIT = 3;/);
  });

  it('counts the character\'s other items, excluding the one being written', () => {
    // Without the exclusion, re-saving an already-attuned item at the cap
    // would conflict with itself.
    const fn = source.slice(
      source.indexOf('async function countAttuned'),
      source.indexOf('async function countAttuned') + 400,
    );
    expect(fn).toContain('attuned = true');
    expect(fn).toContain('id <> $2');
  });

  it.each([
    ['put', '/api/pc/:playerId/inventory/:itemId'],
    ['post', '/api/pc/:playerId/inventory'],
  ])('%s %s refuses with 409', (method, routePath) => {
    const b = handlerCode(method, routePath);
    expect(b).toContain('ATTUNEMENT_LIMIT');
    expect(b).toMatch(/status\(409\)/);
  });

  it('only checks when the write would NEWLY attune', () => {
    // Un-attuning at the cap must always be allowed, or you could never get
    // back under it.
    expect(handlerCode('put', '/api/pc/:playerId/inventory/:itemId'))
      .toMatch(/if \(nextAttuned && !row\.attuned\)/);
  });
});

describe('consumables cannot be equipped', () => {
  it('is enforced on the server, not only hidden in the UI', () => {
    expect(source).toMatch(/const EQUIPPABLE = \(category\) => category !== 'potions';/);
  });

  it.each([
    ['put', '/api/pc/:playerId/inventory/:itemId'],
    ['post', '/api/pc/:playerId/inventory'],
  ])('%s %s gates equipped on the category', (method, routePath) => {
    expect(handlerCode(method, routePath)).toMatch(/EQUIPPABLE\([a-zA-Z]+\) && !!equipped/);
  });

  it('uses the NEW category, so moving an item into Potions unequips it', () => {
    // Checking the old category would let an equipped sword stay equipped
    // after being dragged into the Potions panel.
    const b = handlerCode('put', '/api/pc/:playerId/inventory/:itemId');
    expect(b).toMatch(/const nextCategory = INV_CATEGORIES\.includes\(category\)/);
    expect(b).toMatch(/EQUIPPABLE\(nextCategory\)/);
  });
});

describe('the coin purse', () => {
  it('stores four denominations on the character', () => {
    for (const c of ['pp', 'gp', 'sp', 'cp']) {
      expect(source).toMatch(new RegExp(`coins_\\$\\{c\\}|coins_${c}`));
    }
    expect(source).toMatch(/ALTER TABLE pc_characters ADD COLUMN IF NOT EXISTS coins_\$\{c\} INTEGER NOT NULL DEFAULT 0/);
  });

  it('is its own route, not fields on the main character save', () => {
    // Same reasoning as the carry override that was removed: that route takes
    // a fixed field list, so folding these in would zero them on every
    // unrelated save.
    expect(handlerCode('put', '/api/pc/:playerId')).not.toContain('coins_');
    expect(handlerCode('put', '/api/pc/:playerId/coins')).toContain('canAccessPC');
  });

  it('refuses a negative purse', () => {
    expect(handlerCode('put', '/api/pc/:playerId/coins')).toMatch(/n > 0 \? n : 0/);
  });
});

describe('the weight parameter is explicitly typed', () => {
  /**
   * The bug this exists for: `weight = CASE WHEN $1 THEN NULL ELSE $7 END`.
   * The other CASEs type their parameter from the column they COALESCE
   * against; this one has a bare NULL in the THEN branch, so Postgres inferred
   * TEXT and every edit — including the equip toggle — failed with
   * `column "weight" is of type numeric but expression is of type text`.
   */
  it('casts $7 to numeric', () => {
    expect(handlerCode('put', '/api/pc/:playerId/inventory/:itemId'))
      .toMatch(/weight\s+= CASE WHEN \$1::boolean THEN NULL ELSE \$7::numeric END/);
  });
});

describe('item_cards access was NOT widened', () => {
  it('the inventory read joins the card instead of exposing a card route', () => {
    expect(source).toContain('LEFT JOIN item_cards c ON c.id = i.item_card_id');
  });

  it('ownsItemCard still compares against the owning user alone', () => {
    const fn = source.slice(
      source.indexOf('async function ownsItemCard'),
      source.indexOf('async function ownsItemCard') + 400,
    );
    expect(fn).toMatch(/WHERE id=\$1 AND user_id=\$2/);
    // No "…OR it is in someone's inventory" escape hatch crept in.
    expect(fn).not.toContain('inventory_items');
  });
});
