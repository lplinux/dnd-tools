/**
 * test/campaignGear.test.js
 *
 * The campaign bundle used to carry no gear at all: 13 tables, and neither
 * `inventory_items` nor `item_cards` among them. Meanwhile the Danger Zone
 * says "delete it for good once you are sure. Export first if you want a
 * copy", and `inventory_items.campaign_id` is ON DELETE CASCADE against a route
 * that really does `DELETE FROM campaigns`. The documented safe path destroyed
 * every granted magic item and the backup did not contain them.
 *
 * Three things here are subtle enough to be worth pinning, and one of them was
 * found only by running it:
 *
 *   - **Positional refs, never ids.** `item_cards` is keyed to a USER and the
 *     bundle crosses accounts, so an id means nothing on the far side.
 *   - **Chains match whole.** Every tier shares one name by design, so matching
 *     card-by-card would link an inventory row to whichever tier came back
 *     first — a one-in-three chance of the wrong sword.
 *   - **The SAVEPOINT.** Postgres aborts the entire transaction on any failed
 *     statement, so catching the duplicate-key error without one threw the
 *     whole import away while still answering `success: true`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

function handlerCode(method, routePath) {
  const needle = `app.${method}('${routePath}'`;
  const start = source.indexOf(needle);
  expect(start, `route not found: ${method} ${routePath}`).toBeGreaterThan(-1);
  const end = source.indexOf('\n});', start);
  return source.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const exp = handlerCode('get', '/api/campaigns/:id/export');
const imp = handlerCode('post', '/api/campaigns/import');

describe('the export carries gear', () => {
  it('includes the cards and the per-player inventory', () => {
    expect(exp).toMatch(/item_cards: cardsOut/);
    expect(exp).toMatch(/inventory: inventoryFor\(p\.id\)/);
  });

  it('is at a version that carries gear', () => {
    // Gear arrived in 5. The exact current number is NOT pinned here — it
    // moves whenever anything else is added to the bundle, and this file is
    // about gear. test/campaignBundle.test.js owns the number.
    const m = exp.match(/version: (\d+)/);
    expect(m, 'no version in the export').not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(5);
  });

  it('refers to a card by POSITION, never by id', () => {
    // An id is meaningless in another user's library — the whole reason this
    // did not work before.
    expect(exp).toMatch(/card_ref/);
    expect(exp).toMatch(/evolves_from_ref/);
    // The card objects are built by stripping id and evolves_from off the row.
    expect(exp).toMatch(/\{ id: _id, evolves_from: parent, \.\.\.card \}/);
  });

  it('exports whole chains, not just the tier in play', () => {
    // A campaign may hold tier 2 while tiers 1 and 3 sit unused. Exporting only
    // the tier in play lands a chainless orphan and the tier buttons vanish.
    expect(exp).toMatch(/WITH RECURSIVE/);
    expect(exp).toMatch(/roots AS/);
    expect(exp).toMatch(/down AS/);
  });

  it('scopes to this campaign only', () => {
    expect(exp).toMatch(/WHERE i\.campaign_id = \$1/);
  });
});

describe('the import resolves cards by name, not id', () => {
  const key = (() => {
    const start = source.indexOf('const cardKey = (c) =>');
    const end = source.indexOf('\n\n', start);
    return new Function(`${source.slice(start, end)}\nreturn cardKey;`)();
  })();

  it('keys on name + type + rarity, case-insensitively', () => {
    const a = { name: 'Tidecaller', type: 'Weapon', rarity: 'veryrare' };
    expect(key(a)).toBe(key({ name: ' tidecaller ', type: 'WEAPON', rarity: 'VeryRare' }));
  });

  it('separates two items that merely share a name', () => {
    // Name alone would fuse these. This is why the key is a tuple.
    expect(key({ name: 'Dagger', type: 'Weapon', rarity: 'common' }))
      .not.toBe(key({ name: 'Dagger', type: 'Wondrous Item', rarity: 'legendary' }));
  });

  it('defaults a missing rarity the way the column does', () => {
    expect(key({ name: 'x', type: 'y' })).toBe(key({ name: 'x', type: 'y', rarity: 'rare' }));
  });

  it('cannot collide across fields', () => {
    // A NUL separator, so "ab"+"c" and "a"+"bc" stay distinct.
    expect(key({ name: 'ab', type: 'c', rarity: 'rare' }))
      .not.toBe(key({ name: 'a', type: 'bc', rarity: 'rare' }));
  });
});

describe('chains are matched whole or not at all', () => {
  const fn = source.slice(source.indexOf('async function resolveImportedCards'));

  it('compares the base tiers and requires equal lengths', () => {
    expect(fn).toMatch(/cardKey\(row\) !== cardKey\(base\)/);
    expect(fn).toMatch(/existing\.length === chain\.length/);
  });

  it('only considers base tiers as candidates', () => {
    expect(fn).toMatch(/evolves_from IS NULL/);
  });

  it('maps tier for tier when it matches', () => {
    expect(fn).toMatch(/chain\.forEach\(\(bundleIdx, tier\) =>/);
  });

  it('re-links the chain when it inserts one', () => {
    expect(fn).toMatch(/vals\[CARD_COLS\.indexOf\('evolves_from'\)\] = prev/);
  });

  it('never overwrites a card the library already has', () => {
    // On a match it records ids and moves on — no UPDATE of item_cards.
    const matched = fn.slice(fn.indexOf('if (matched)'), fn.indexOf('Nothing comparable'));
    expect(matched).not.toMatch(/UPDATE item_cards/);
  });

  it('is bounded against a cycle in a hand-edited bundle', () => {
    expect(fn).toMatch(/if \(seen\.has\(i\)\) return acc/);
  });

  it('is scoped to the importing user', () => {
    expect(fn).toMatch(/WHERE user_id = \$1/);
  });
});

describe('the duplicate-key skip does not discard the import', () => {
  it('wraps the row insert in a SAVEPOINT', () => {
    // THE bug this file exists for. Postgres aborts the whole transaction on a
    // failed statement; COMMIT then silently becomes ROLLBACK. Without the
    // savepoint the import answered `success: true, campaign_id: 4` and no
    // campaign 4 existed.
    // Match the CREATION statement exactly. A bare /SAVEPOINT inv_row/ is
    // satisfied by the ROLLBACK line, so deleting the savepoint left this test
    // green — which it did, until this was tightened.
    expect(imp).toMatch(/client\.query\('SAVEPOINT inv_row'\)/);
    expect(imp).toMatch(/client\.query\('ROLLBACK TO SAVEPOINT inv_row'\)/);
    expect(imp).toMatch(/client\.query\('RELEASE SAVEPOINT inv_row'\)/);
  });

  it('rolls back to the savepoint before deciding what the error was', () => {
    // Order matters: any query issued before the rollback fails too.
    const c = imp.slice(imp.indexOf('catch (e) {', imp.indexOf('SAVEPOINT inv_row')));
    expect(c.indexOf('ROLLBACK TO SAVEPOINT')).toBeLessThan(c.indexOf("e.code === '23505'"));
  });

  it('rethrows anything that is not the duplicate', () => {
    expect(imp).toMatch(/else \{ throw e; \}/);
  });

  it('reports what happened to the gear', () => {
    expect(imp).toMatch(/cards_added: cardResolve\.added/);
    expect(imp).toMatch(/cards_matched: cardResolve\.reused/);
    expect(imp).toMatch(/skipped: gearSkipped/);
  });
});

describe('a v4 bundle still imports', () => {
  it('resolves no cards rather than failing', () => {
    const fn = source.slice(source.indexOf('async function resolveImportedCards'));
    expect(fn).toMatch(/if \(!list\.length\) return \{ ids, added: 0, reused: 0 \}/);
  });

  it('tolerates a player with no inventory key', () => {
    expect(imp).toMatch(/p\.inventory \|\| \[\]/);
  });
});
