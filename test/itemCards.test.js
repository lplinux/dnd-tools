/**
 * test/itemCards.test.js
 *
 * Item Cards gained server-side storage. Two things about it are easy to break
 * silently, so they are pinned here:
 *
 *   - **Scoping.** Cards are per-user and there is no other access path — no
 *     sharing, no campaign link, no DM override. Every statement must carry
 *     `user_id`, or one user's library leaks into another's.
 *   - **Sanitisation.** `abilities` is HTML from a contenteditable editor,
 *     rendered with dangerouslySetInnerHTML. While cards lived in localStorage
 *     that was self-inflicted; with an import route it is someone else's markup
 *     in your page.
 *
 * As with the other backend suites there is no HTTP harness — these read app.js
 * as text. The sanitiser's actual behaviour is covered by the live round-trip in
 * the verification run, which is the only thing that proves the real library
 * does what the config says.
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

/** Comments stripped — the handlers explain the scoping in prose right beside it. */
const handlerCode = (m, p) => handlerBody(m, p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--[^\n]*/g, '')
  .replace(/\/\/[^\n]*/g, '');

const ROUTES = [
  ['get', '/api/item-cards'],
  ['get', '/api/item-cards/export'],
  ['post', '/api/item-cards/import'],
  ['post', '/api/item-cards'],
  ['put', '/api/item-cards/:id'],
  ['delete', '/api/item-cards/:id'],
];

describe('schema', () => {
  it('is per-user, cascading from users', () => {
    expect(source).toContain('CREATE TABLE IF NOT EXISTS item_cards');
    expect(source).toMatch(/user_id\s+INTEGER NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  });

  it('constrains rarity in the database, not just the UI', () => {
    expect(source).toMatch(/CHECK \(rarity IN \('common','uncommon','rare','veryrare','legendary','artifact'\)\)/);
  });

  it('has no campaign link — cards are deliberately user-scoped', () => {
    const ddl = source.slice(
      source.indexOf('CREATE TABLE IF NOT EXISTS item_cards'),
      source.indexOf('CREATE TABLE IF NOT EXISTS item_cards') + 900,
    );
    expect(ddl).not.toContain('campaign_id');
  });
});

describe('every route is scoped to the calling user', () => {
  it.each(ROUTES)('%s %s names user_id', (method, routePath) => {
    expect(handlerCode(method, routePath)).toContain('user_id');
  });

  it.each(ROUTES)('%s %s reads the id from the session, never the body', (method, routePath) => {
    const body = handlerCode(method, routePath);
    expect(body).toContain('req.session.userId');
    // A user_id taken from the request would let a caller write into someone
    // else's library; there is no legitimate reason for one here.
    expect(body).not.toMatch(/req\.body\.user_?[iI]d/);
  });

  it('the two :id routes check ownership as well as filtering', () => {
    for (const [method, routePath] of [['put', '/api/item-cards/:id'], ['delete', '/api/item-cards/:id']]) {
      const body = handlerCode(method, routePath);
      expect(body, `${method} ${routePath}`).toContain('ownsItemCard');
      // Belt and braces: the WHERE carries user_id too, so a race between the
      // check and the statement cannot land on another user's row.
      expect(body, `${method} ${routePath}`).toMatch(/AND user_id=\$/);
    }
  });
});

describe('abilities sanitisation', () => {
  const fn = source.slice(
    source.indexOf('function sanitizeAbilities'),
    source.indexOf('function sanitizeAbilities') + 1400,
  );

  it('exists and is applied on write', () => {
    expect(source).toContain('function sanitizeAbilities');
    // cardValues is the single funnel for every INSERT and UPDATE.
    const cv = source.slice(source.indexOf('function cardValues'), source.indexOf('function cardValues') + 1200);
    expect(cv).toContain('sanitizeAbilities(b.abilities)');
  });

  it('allows only what the editor toolbar can produce', () => {
    expect(fn).toMatch(/allowedTags:\s*\[([^\]]*)\]/);
    const tags = /allowedTags:\s*\[([^\]]*)\]/.exec(fn)[1];
    for (const bad of ['script', 'iframe', 'object', 'embed', 'form', 'a', 'img', 'svg']) {
      expect(tags, `"${bad}" must not be allowed`).not.toMatch(new RegExp(`'${bad}'`));
    }
  });

  it('permits no attributes beyond a style on span/div', () => {
    const attrs = /allowedAttributes:\s*\{([^}]*)\}/.exec(fn)[1];
    expect(attrs).not.toMatch(/on[a-z]+/i);   // onerror, onclick, …
    expect(attrs).not.toContain('href');
    expect(attrs).not.toContain('src');
  });

  it('discards the contents of stripped script-like tags, not just the tags', () => {
    expect(fn).toMatch(/nonTextTags:[\s\S]*'script'/);
  });
});

describe('import', () => {
  const body = handlerCode('post', '/api/item-cards/import');

  it('rejects a bundle of the wrong type before writing anything', () => {
    expect(body).toContain("bundle.type !== 'item-cards'");
    const typeCheck = body.indexOf("bundle.type !== 'item-cards'");
    const firstInsert = body.indexOf('INSERT INTO item_cards');
    expect(typeCheck).toBeLessThan(firstInsert);
  });

  it('is transactional', () => {
    expect(body).toContain("BEGIN");
    expect(body).toContain("COMMIT");
    expect(body).toContain("ROLLBACK");
  });

  it('adds rather than replaces — an import must not delete the library', () => {
    expect(body).not.toMatch(/DELETE\s+FROM\s+item_cards/i);
  });
});

describe('deleting a card that is in play', () => {
  const one = handlerCode('delete', '/api/item-cards/:id');
  const all = handlerCode('delete', '/api/item-cards');

  it('still refuses by default, and says who is holding it', () => {
    // The refusal is the feature. RESTRICT was chosen over CASCADE so a DM
    // finds out rather than a player silently losing a magic item, and that is
    // unchanged — forcing is the informed second step, not a way around it.
    expect(one).toMatch(/23503/);
    expect(one).toMatch(/CARD_IN_PLAY/);
    expect(one).toMatch(/holders/);
  });

  it('only forces when explicitly asked', () => {
    expect(one).toMatch(/const force = String\(req\.query\.force\) === 'true'/);
    expect(one).toMatch(/if \(force\)/);
  });

  it('takes out only the rows pointing at THIS card', () => {
    // A tier is a card. Forcing one tier out of play must not empty the
    // inventories holding the other tiers of the same chain.
    expect(one).toMatch(/DELETE FROM inventory_items WHERE item_card_id = \$1/);
  });

  it('still heals the chain before deleting', () => {
    expect(one.indexOf('UPDATE item_cards SET evolves_from'))
      .toBeLessThan(one.indexOf('DELETE FROM item_cards'));
  });

  describe('clearing the whole library', () => {
    it('is scoped to the caller', () => {
      expect(all).toMatch(/user_id = \$1/);
      expect(all).toMatch(/req\.session\.userId/);
    });

    it('refuses first and names the holders, like the single delete', () => {
      expect(all).toMatch(/CARD_IN_PLAY/);
      expect(all).toMatch(/holders\.length && !force/);
    });

    it('runs in one transaction — a half-cleared library helps nobody', () => {
      expect(all).toMatch(/BEGIN/);
      expect(all).toMatch(/COMMIT/);
      expect(all).toMatch(/ROLLBACK/);
    });

    it('removes inventory rows only for the caller’s own cards', () => {
      expect(all).toMatch(/item_card_id IN \(SELECT id FROM item_cards WHERE user_id = \$1\)/);
    });

    it('reports how many it deleted', () => {
      expect(all).toMatch(/RETURNING id/);
      expect(all).toMatch(/deleted: r\.rows\.length/);
    });
  });
});
