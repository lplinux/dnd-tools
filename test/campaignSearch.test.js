/**
 * test/campaignSearch.test.js
 *
 * Campaign-wide search reads things a player must never see: DM-only journal
 * entries, unpublished diary drafts, `private_info`, hidden locations, every
 * NPC, and the DM's own notes. Rather than teach one query seven different
 * withholding rules, the route is closed to players outright — so the single
 * most important property is that it stays closed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const reg = source.indexOf("app.get('/api/campaigns/:campaignId/search'");
const body = strip(source.slice(reg, source.indexOf('\n});', reg)));
const decl = source.slice(reg, source.indexOf('\n', reg));

describe('who may search', () => {
  it('is DM-only at the middleware, not merely in the handler', () => {
    expect(decl).toMatch(/requireRole\(\['dm', 'admin'\]\)/);
  });

  it('also checks they own THIS campaign', () => {
    // requireRole answers "a DM somewhere", not "the DM of this campaign".
    expect(body).toMatch(/dmOwnsCampaign\(campaignId, req\.session\.userId, req\.session\.role\)/);
    expect(body).toMatch(/403/);
  });

  it('checks ownership before reading anything', () => {
    const guard = body.indexOf('dmOwnsCampaign');
    const read = body.indexOf('pool.query');
    expect(guard).toBeLessThan(read);
  });
});

describe('every source is scoped to the campaign', () => {
  const queries = [...body.matchAll(/q\(\s*`?'?([\s\S]*?)`?\)\s*,/g)].map((m) => m[1]);

  it('found the source queries', () => {
    expect(queries.length).toBeGreaterThanOrEqual(8);
  });

  it('none reads a table without a campaign filter', () => {
    // A missing WHERE here would search every campaign on the server — and the
    // caller is a DM, so nothing downstream would refuse the rows.
    for (const sql of queries) {
      if (!/SELECT/i.test(sql)) continue;
      expect(sql.replace(/\s+/g, ' '), `unscoped query: ${sql.slice(0, 60)}`)
        .toMatch(/campaign_id = \$1/);
    }
  });

  it('searches the items in play, not the DM’s whole library', () => {
    // item_cards is keyed to a USER. Joining through inventory_items is what
    // makes "items" mean "in this campaign" rather than "everything I own".
    expect(body).toMatch(/FROM inventory_items inv/);
    expect(body).toMatch(/JOIN item_cards ic ON ic\.id = inv\.item_card_id/);
    expect(body).not.toMatch(/FROM item_cards\s+WHERE/);
  });
});

describe('matching', () => {
  const fold = strip(source.slice(
    source.indexOf('const searchFold'), source.indexOf('const SEARCH_ROW_CAP'),
  ));

  it('folds accents, which is why matching is in Node and not SQL', () => {
    // ILIKE '%thea%' does not find "Théa", and unaccent is a CREATE EXTENSION
    // this app cannot assume it may run.
    expect(fold).toMatch(/normalize\('NFD'\)/);
    expect(fold).toMatch(/\[\\u0300-\\u036f\]/);
    expect(fold).toMatch(/toLowerCase\(\)/);
    expect(body).not.toMatch(/ILIKE/i);
  });

  it('stays identical to the frontend’s fold', () => {
    // Two searches that disagree are worse than one that is merely imperfect.
    const client = readFileSync(
      path.join(root, 'frontend', 'src', 'pages', 'Diary', 'searchEntries.js'), 'utf8');
    const normalise = (t) => t
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      .replace(/\s+/g, '').replace(/'/g, '"');
    for (const step of ['normalize("NFD")', 'replace(/[\\u0300-\\u036f]/g,"")', 'toLowerCase()']) {
      expect(normalise(fold), `server fold is missing ${step}`).toContain(step);
      expect(normalise(client), `client fold is missing ${step}`).toContain(step);
    }
  });

  it('requires every term, anywhere in the row', () => {
    const fn = strip(source.slice(
      source.indexOf('function searchRow'), source.indexOf("app.get('/api/campaigns/:campaignId/search'")));
    expect(fn).toMatch(/for \(const t of terms\)/);
    expect(fn).toMatch(/if \(!folded\.some\(\(f\) => f\.includes\(t\)\)\) return null;/);
  });

  it('reads HTML fields as text, so a search for "span" finds nothing', () => {
    expect(body).toMatch(/searchPlain\(r\.abilities\)/);
  });
});

describe('the excerpt', () => {
  const fn = strip(source.slice(
    source.indexOf('function searchExcerpt'), source.indexOf('function searchRow')));

  it('returns plain text and an offset, never markup', () => {
    // The client marks the match by slicing into React nodes. Emitting <mark>
    // here would put a DM's prose into HTML something has to trust.
    expect(fn).toMatch(/text:/);
    expect(fn).toMatch(/at:/);
    expect(fn).not.toMatch(/<mark|<b>|innerHTML/);
  });
});

describe('bounds', () => {
  it('caps the rows read per source and the hits per group', () => {
    expect(source).toMatch(/const SEARCH_ROW_CAP = \d+/);
    expect(source).toMatch(/const SEARCH_GROUP_CAP = \d+/);
    expect(body).toMatch(/LIMIT \$\{SEARCH_ROW_CAP\}/);
    expect(body).toMatch(/hits\.length >= SEARCH_GROUP_CAP/);
  });

  it('refuses a one-character query rather than reading the campaign for it', () => {
    expect(body).toMatch(/raw\.length < SEARCH_MIN_QUERY/);
    const guard = body.indexOf('SEARCH_MIN_QUERY');
    expect(guard).toBeLessThan(body.indexOf('pool.query'));
  });
});

/**
 * The detail route — one result in full, read inside the search.
 *
 * It takes a kind and an id straight from the client, so every lookup is
 * scoped by campaign as well as by id: a valid id belonging to another DM's
 * campaign must return nothing rather than that DM's note.
 */
describe('the detail route', () => {
  const dreg = source.indexOf("app.get('/api/campaigns/:campaignId/search/:kind/:id'");
  const dbody = strip(source.slice(dreg, source.indexOf('\n});', dreg)));
  const ddecl = source.slice(dreg, source.indexOf('\n', dreg));

  it('exists and is DM-only', () => {
    expect(dreg).toBeGreaterThan(-1);
    expect(ddecl).toMatch(/requireRole\(\['dm', 'admin'\]\)/);
  });

  it('re-checks campaign ownership rather than trusting the list', () => {
    // Reachable directly; the id came from a browser either way.
    expect(dbody).toMatch(/dmOwnsCampaign\(campaignId, req\.session\.userId, req\.session\.role\)/);
  });

  it('scopes every lookup by campaign AND id', () => {
    // $1 is the campaign, $2 the row. A query keyed on the id alone would hand
    // over another campaign's row to a DM who guessed a number.
    const queries = [...dbody.matchAll(/one\(\s*`([\s\S]*?)`\s*\)/g)].map((m) => m[1])
      .concat([...dbody.matchAll(/one\('([^']+)'\)/g)].map((m) => m[1]));
    expect(queries.length).toBeGreaterThanOrEqual(9);
    for (const sql of queries) {
      const flat = sql.replace(/\s+/g, ' ');
      expect(flat, `not campaign-scoped: ${flat.slice(0, 50)}`).toMatch(/\$1/);
      expect(flat, `not id-scoped: ${flat.slice(0, 50)}`).toMatch(/\$2/);
    }
  });

  it('covers every kind the list can produce', () => {
    // A kind in the list with no case here is a result that cannot be opened.
    const listed = [...body.matchAll(/group\('([a-z-]+)'/g)].map((m) => m[1]);
    const handled = [...dbody.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]);
    expect(listed.length).toBe(9);
    expect([...listed].sort()).toEqual([...handled].sort());
  });

  it('refuses an unknown kind rather than falling through', () => {
    expect(dbody).toMatch(/default:/);
    expect(dbody).toMatch(/Unknown result type/);
  });

  it('names the format of every body it returns', () => {
    // markdown, html and text are rendered three different ways; a body sent
    // without its format would be guessed at, and a DM note containing * is
    // not emphasis.
    for (const f of ["bodyFormat: 'markdown'", "bodyFormat: 'text'", "bodyFormat: 'html'"]) {
      expect(dbody).toContain(f);
    }
  });

  it('only ever calls an item\u2019s abilities html', () => {
    // That is the one field the card editor produces as markup, and the only
    // one sanitizeAbilities has cleaned.
    const htmlCase = dbody.slice(dbody.indexOf("case 'item':"));
    expect(htmlCase).toMatch(/bodyFormat: 'html'/);
    const others = dbody.slice(0, dbody.indexOf("case 'item':"));
    expect(others).not.toMatch(/bodyFormat: 'html'/);
  });
});
