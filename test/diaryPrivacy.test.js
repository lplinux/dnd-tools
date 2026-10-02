/**
 * test/diaryPrivacy.test.js
 *
 * The diary has two privacy boundaries that are enforced entirely in SQL:
 *   - an anonymous visitor on a share link must never receive a DRAFT entry,
 *     and must never receive ANY player diary;
 *   - a player must never be able to address another player's diary entry.
 *
 * There is no HTTP harness in this project, so these read app.js as text. That
 * makes them coarse — they prove the right strings are in the right handlers,
 * not that the handlers behave — but each assertion maps to a specific leak,
 * and each would have caught that leak being introduced.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const source = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app.js'),
  'utf8',
);

/**
 * The body of one route handler: from its registration to the `});` that closes
 * it at column zero. Stopping at the next `app.` registration instead would
 * swallow the comment block between handlers and give false positives.
 */
function handlerBody(method, routePath) {
  const needle = `app.${method}('${routePath}'`;
  const start = source.indexOf(needle);
  expect(start, `route not found: ${method.toUpperCase()} ${routePath}`).toBeGreaterThan(-1);
  const end = source.indexOf('\n});', start);
  expect(end, `unterminated handler: ${routePath}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

/**
 * Comments stripped. These assertions are about the SQL, and the handlers are
 * heavily commented — without this, prose explaining *why* a column is withheld
 * trips the very test checking it is withheld.
 */
function handlerCode(method, routePath) {
  return handlerBody(method, routePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('public diary endpoint', () => {
  const body = handlerCode('get', '/api/diary-public/:token');

  it('reads only the campaign diary table', () => {
    expect(body).toContain('campaign_diary_entries');
  });

  it('NEVER names the player diary table', () => {
    // The whole reason player diaries live in a separate table: a leak here
    // should require naming it, not forgetting a WHERE clause.
    expect(body).not.toContain('player_diary_entries');
  });

  it('filters drafts in SQL, not in the client', () => {
    expect(body).toMatch(/status\s*=\s*'published'/);
  });

  it('selects explicit columns, never *', () => {
    expect(body).not.toMatch(/SELECT\s+\*/i);
  });

  it('does not expose the author or edit timestamps', () => {
    expect(body).not.toContain('created_by');
    expect(body).not.toContain('updated_at');
  });

  it('is not gated on a session, so a cookie cannot change what it returns', () => {
    expect(body).not.toContain('req.session');
  });
});

describe('player diary mutations are scoped by player AND campaign', () => {
  // The owner guard only proves the caller owns the player they NAMED. Scoping
  // the statement is what stops them naming their own player while addressing
  // another player's entry id.
  const statements = source.match(/(UPDATE|DELETE FROM) player_diary_entries[\s\S]*?(?=`|RETURNING)/g) ?? [];

  it('finds the mutation statements', () => {
    expect(statements.length).toBeGreaterThanOrEqual(2);
  });

  it.each(statements.map((s, i) => [i, s]))('statement %i scopes by player_id and campaign_id', (_i, stmt) => {
    expect(stmt).toContain('player_id=');
    expect(stmt).toContain('campaign_id=');
  });
});

describe('standalone diary import is destructive, so it is fenced', () => {
  const body = handlerCode('post', '/api/campaign-diary/:campaignId/import');

  it('validates the bundle type before touching anything', () => {
    // A wrong file arriving at a route whose first act is DELETE must 400, not
    // delete. The hub also sniffs the type, but this endpoint is reachable
    // directly and cannot rely on that.
    expect(body).toContain("type !== 'campaign-diary'");
    const typeCheck = body.indexOf("type !== 'campaign-diary'");
    const del = body.indexOf('DELETE FROM campaign_diary_entries');
    expect(typeCheck, 'type check must precede the delete').toBeLessThan(del);
  });

  it('scopes the delete to one campaign', () => {
    expect(body).toMatch(/DELETE FROM campaign_diary_entries WHERE campaign_id=\$1/);
  });

  it('never deletes from the player diary table', () => {
    expect(body).not.toContain('player_diary_entries');
  });

  it('runs in a transaction that rolls back', () => {
    expect(body).toContain("BEGIN");
    expect(body).toContain("COMMIT");
    expect(body).toContain("ROLLBACK");
  });
});

describe('route guards', () => {
  it('every campaign-diary route is DM/admin only', () => {
    const routes = source.match(/app\.\w+\('\/api\/campaign-diary\/[^']*',[^\n]*/g) ?? [];
    expect(routes.length).toBeGreaterThanOrEqual(7);
    for (const r of routes) expect(r, r).toContain("requireRole(['dm', 'admin'])");
  });

  it('player-diary writes use the owner-only check, not canAccessTimeline', () => {
    // canAccessTimeline returns true for the campaign's DM. Using it on a write
    // would let the DM silently edit a diary the UI calls private.
    for (const m of ['post', 'put', 'delete']) {
      const routes = source.match(new RegExp(`app\\.${m}\\('/api/player-diary/[^']*'[\\s\\S]*?\\n\\}\\);`, 'g')) ?? [];
      for (const r of routes) {
        expect(r, `${m} route must call ownsPlayer`).toContain('ownsPlayer(');
        expect(r, `${m} route must not authorise via canAccessTimeline`).not.toContain('canAccessTimeline(');
      }
    }
  });

  it('the DM-facing /all listing excludes the DM pseudo-player', () => {
    expect(handlerCode('get', '/api/player-diary/:campaignId/all')).toContain('is_dm_player = false');
  });
});
